// app/frame/route.ts
export const dynamic = 'force-dynamic';

function originFrom(req: Request) {
  const h = req.headers;
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host  = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const origin = originFrom(request);
  const { searchParams } = new URL(request.url);
  const sid = searchParams.get('sid') || 'demo';

  const image   = `${origin}/og?t=${encodeURIComponent(`TL;DR ready for ${sid}`)}`;
  const txUrl   = `${origin}/api/tx?sid=${encodeURIComponent(sid)}`;
  const tldrUrl = `${origin}/api/tldr?sid=${encodeURIComponent(sid)}`;
  const tipUrl  = process.env.NEXT_PUBLIC_CRYPTO_TIP || '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="fc:frame" content="vNext"/>
  <meta name="fc:frame:image" content="${image}"/>

  <meta name="fc:frame:button:1" content="Pay 1 USDC"/>
  <meta name="fc:frame:button:1:action" content="tx"/>
  <meta name="fc:frame:button:1:target" content="${txUrl}"/>

  <meta name="fc:frame:button:2" content="Get TL;DR"/>
  <meta name="fc:frame:button:2:action" content="link"/>
  <meta name="fc:frame:button:2:target" content="${tldrUrl}"/>

  ${tipUrl ? `
  <meta name="fc:frame:button:3" content="Tip"/>
  <meta name="fc:frame:button:3:action" content="link"/>
  <meta name="fc:frame:button:3:target" content="${tipUrl}"/>` : ''}

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
</head>
<body>
  <main class="wrap">
    <div class="card">
      <h2>One-Click TL;DR Frame</h2>
      <p>OneClick — quick TL;DR in two taps.</p>
      <div class="row">
        <a class="btn"         href="${txUrl}"   target="_blank" rel="noreferrer">Pay 1 USDC (tx)</a>
        <a class="btn primary" href="${tldrUrl}" target="_blank" rel="noreferrer">Get TL;DR</a>
        ${tipUrl ? `<a class="btn" href="${tipUrl}" target="_blank" rel="noreferrer">Tip</a>` : ''}
      </div>
      ${tipUrl ? `<div class="tip">Tip: <a href="${tipUrl}" target="_blank" rel="noreferrer">${tipUrl}</a></div>` : ''}
      <p style="opacity:.6;margin-top:12px">Farcaster clients render the buttons from the meta tags above.</p>
    </div>
  </main>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
