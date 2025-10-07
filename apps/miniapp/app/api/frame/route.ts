// app/api/frame/route.ts
import { NextResponse } from "next/server";

/** Button shape used by htmlFrame (keeps literal types intact) */
type FrameButton = { label: string; action: "link" | "post" | "tx"; target?: string; sid?: string };

/** Derive a public origin (works locally & behind proxies) */
function getOrigin(req: Request) {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  return `${proto}://${host}`;
}

/** Allow both x-www-form-urlencoded (Warpcast) and JSON bodies */
async function parseFrameRequest(req: Request) {
  const ct = req.headers.get("content-type") || "";
  let buttonIndex = 0;
  let sid = "demo";

  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    const bi = Number(form.get("buttonIndex") ?? 0);
    if (Number.isFinite(bi)) buttonIndex = bi;
    const sf = String(form.get("sid") ?? "").trim();
    if (sf) sid = sf;
  } else if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({} as any));
    const bi = Number(body?.untrustedData?.buttonIndex ?? body?.buttonIndex ?? 0);
    if (Number.isFinite(bi)) buttonIndex = bi;
    const sj = String(body?.untrustedData?.inputText ?? body?.sid ?? "").trim();
    if (sj) sid = sj;
  } else {
    const url = new URL(req.url);
    const sq = url.searchParams.get("sid");
    if (sq) sid = sq;
  }

  if (!Number.isFinite(buttonIndex) || buttonIndex < 0) buttonIndex = 0;
  return { buttonIndex, sid };
}

/** Shared HTML builder with both meta tags (for frames) and visible controls (for humans) */
function htmlFrame(opts: {
  origin: string;
  image: string;
  buttons: FrameButton[];
  bodyText: string;
  postUrl: string;
  sid: string;
  tipUrl?: string | null;
}) {
  const { origin, image, buttons, bodyText, postUrl, sid, tipUrl } = opts;

  const metaButtons = buttons
    .map((b, i) => {
      const idx = i + 1;
      const base = [
        `<meta name="fc:frame:button:${idx}" content="${b.label}" />`,
        `<meta name="fc:frame:button:${idx}:action" content="${b.action}" />`,
      ];
      if (b.action !== "post" && b.target) {
        base.push(`<meta name="fc:frame:button:${idx}:target" content="${b.target}" />`);
      }
      return base.join("\n");
    })
    .join("\n");

  // Visible controls for normal browsers (debug / human preview)
  const visibleButtons = buttons
    .map((b, i) => {
      if (b.action === "link" && b.target) {
        return `<a class="btn primary" href="${b.target}" target="_blank" rel="noreferrer">${b.label}</a>`;
      }
      if (b.action === "tx" && b.target) {
        return `<a class="btn" href="${b.target}" target="_blank" rel="noreferrer">${b.label} (tx)</a>`;
      }
      // POST buttons can’t be “clicked” from static HTML; render a tiny form
      return `<form method="post" action="${postUrl}" style="display:inline-block;margin:0">
        <input type="hidden" name="buttonIndex" value="${i + 1}" />
        <input type="hidden" name="sid" value="${sid}"/>
        <button class="btn" type="submit">${b.label}</button>
      </form>`;
    })
    .join(" ");

  return `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="fc:frame" content="vNext"/>
<meta name="fc:frame:image" content="${image}"/>
${metaButtons}
<meta name="fc:frame:post_url" content="${postUrl}"/>
<title>One-Click TL;DR</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;background:#0b0b10;color:#e8e8ea}
  .wrap{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:820px;background:#121218;border:1px solid #232333;border-radius:16px;padding:24px;text-align:center}
  .btn{display:inline-block;margin-top:14px;padding:10px 16px;border-radius:12px;border:1px solid #2d2d3a;color:#e8e8ea;text-decoration:none;background:transparent}
  .btn.primary{background:#3858ff;border-color:#3858ff;color:#fff}
  .row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
  .tip{opacity:.7;margin-top:10px}
</style>
</head><body>
  <main class="wrap">
    <div class="card">
      <h2>One-Click TL;DR Frame</h2>
      <p>${bodyText}</p>
      <div class="row">${visibleButtons}</div>
      ${tipUrl ? `<div class="tip">Tip: <a href="${tipUrl}" target="_blank" rel="noreferrer">${tipUrl}</a></div>` : ""}
      <p style="opacity:.6;margin-top:12px">Farcaster clients will render buttons from meta tags above.</p>
    </div>
  </main>
</body></html>`;
}

export async function POST(req: Request) {
  const origin = getOrigin(req);
  const { buttonIndex, sid } = await parseFrameRequest(req);

  const image = `${origin}/og?t=${encodeURIComponent(`TL;DR ready for ${sid}`)}`;
  const postUrl = `${origin}/api/frame`;
  const tldrUrl = `${origin}/api/tldr?sid=${encodeURIComponent(sid)}`;
  const txUrl = `${origin}/api/tx?sid=${encodeURIComponent(sid)}`;
  const tipUrl = process.env.NEXT_PUBLIC_CRYPTO_TIP || null;

  // Button 1: Pay (tx)
  if (buttonIndex === 1) {
    const buttonsPay: FrameButton[] = [
      { label: "Get TL;DR", action: "link", target: tldrUrl },
    ];
    if (tipUrl) buttonsPay.push({ label: "Tip", action: "link", target: tipUrl });

    const html = htmlFrame({
      origin,
      image,
      postUrl,
      buttons: buttonsPay,
      bodyText: "Payment marked ✅ — press “Get TL;DR”.",
      sid,
      tipUrl,
    });

    return new NextResponse(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Button 2: Open TL;DR
  if (buttonIndex === 2) {
    let bodyText = "Please pay first (button 1).";
    try {
      const r = await fetch(tldrUrl, { cache: "no-store" });
      if (r.ok) bodyText = "TL;DR is ready — opening link will show it.";
    } catch { /* ignore */ }

    const buttonsOpen: FrameButton[] = [
      { label: "Pay 1 USDC", action: "tx",   target: txUrl },
      { label: "Open TL;DR", action: "link", target: tldrUrl },
    ];
    if (tipUrl) buttonsOpen.push({ label: "Tip", action: "link", target: tipUrl });

    const html = htmlFrame({
      origin,
      image,
      postUrl,
      buttons: buttonsOpen,
      bodyText,
      sid,
      tipUrl,
    });

    return new NextResponse(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Default screen
  const buttonsDefault: FrameButton[] = [
    { label: "Pay 1 USDC", action: "tx",   target: txUrl },
    { label: "Get TL;DR",  action: "link", target: tldrUrl },
  ];
  if (tipUrl) buttonsDefault.push({ label: "Tip", action: "link", target: tipUrl });

  const html = htmlFrame({
    origin,
    image,
    postUrl,
    buttons: buttonsDefault,
    bodyText: "OneClick — quick TL;DR in two taps.",
    sid,
    tipUrl,
  });

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
