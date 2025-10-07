// app/api/tldr/route.ts
import { escapeHtml, summarize, isRateLimited } from '../../../lib/utils';

export const runtime = 'edge';
export const preferredRegion = ['fra1', 'iad1', 'hnd1'];

async function GET_tldr(request: Request) {
  const { searchParams } = new URL(request.url);
  const sid = searchParams.get('sid') || 'demo';

  // Simple IP rate limit
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (await isRateLimited(ip)) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const tldr = await summarize(sid);
  const shareLink = new URL(request.url);
  shareLink.pathname = '/frame';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TL;DR for ${escapeHtml(sid)}</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#0b0b10;color:#e8e8ea}
    .card{max-width:840px;margin:0 auto;background:#121218;border:1px solid #232333;border-radius:16px;padding:24px}
    .t{font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#8b8ba3}
    .h{font-size:28px;margin:8px 0 16px}
    .b{font-size:18px;line-height:1.55;white-space:pre-wrap}
    .row{display:flex;gap:12px;margin-top:20px;flex-wrap:wrap}
    .btn{display:inline-block;padding:10px 16px;border-radius:12px;border:1px solid #2d2d3a;color:#e8e8ea;text-decoration:none}
    .btn.primary{background:#3858ff;border-color:#3858ff;color:#fff}
  </style>
</head>
<body>
  <div class="card">
    <div class="t">TL;DR</div>
    <div class="h">Summary for <code>${escapeHtml(sid)}</code></div>
    <div class="b">${escapeHtml(tldr)}</div>
    <div class="row">
      <a class="btn" href="${shareLink.toString()}?sid=${encodeURIComponent(sid)}" target="_blank">Open as Frame</a>
      ${process.env.NEXT_PUBLIC_CRYPTO_TIP ? `<a class="btn primary" href="${process.env.NEXT_PUBLIC_CRYPTO_TIP}" target="_blank">Tip</a>` : ''}
    </div>
  </div>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export const GET = GET_tldr;
