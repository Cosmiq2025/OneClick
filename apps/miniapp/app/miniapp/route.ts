// apps/miniapp/app/miniapp/route.ts
import { NextResponse } from "next/server";

function baseUrl(headers: Headers) {
  const proto = headers.get("x-forwarded-proto") ?? "https";
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3001";
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const origin = baseUrl(req.headers);

  const html = `<!doctype html><html><head>
    <meta property="og:title" content="OneClick — TL;DR in 10s" />
    <meta name="fc:frame" content="vNext" />
    <meta name="fc:frame:image" content="${origin}/oneclick.png" />

    <meta name="fc:frame:button:1" content="Pay 1 USDC" />
    <meta name="fc:frame:button:2" content="Get TL;DR" />

    <!-- Link button to your deployed page -->
    <meta name="fc:frame:button:3" content="Open Website" />
    <meta name="fc:frame:button:3:action" content="link" />
    <meta name="fc:frame:button:3:target" content="https://project-vap2t-gf3bnr5kd-nebulas-projects-e3698ced.vercel.app/miniapp" />

    <meta name="fc:frame:post_url" content="${origin}/api/frame" />
  </head><body>
    OneClick
    <p><a href="https://project-vap2t-gf3bnr5kd-nebulas-projects-e3698ced.vercel.app/miniapp" target="_blank" rel="noopener">Go to our website</a></p>
  </body></html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html" } });
}
