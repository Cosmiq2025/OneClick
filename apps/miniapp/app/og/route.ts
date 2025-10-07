// app/og/route.ts
import { escapeXml } from '../../lib/utils';

async function GET_og(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = (searchParams.get('t') || 'TL;DR Ready').slice(0, 80);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="100%" height="100%" fill="#0a0a0a"/>
    <text x="60" y="180" font-size="60" fill="#ffffff" font-family="system-ui,sans-serif">One-Click TL;DR</text>
    <text x="60" y="270" font-size="42" fill="#b3b3b3" font-family="system-ui,sans-serif">${escapeXml(text)}</text>
    <rect x="60" y="360" rx="16" ry="16" width="420" height="90" fill="#ffffff" />
    <text x="90" y="420" font-size="36" fill="#0a0a0a" font-family="system-ui,sans-serif">Open TL;DR →</text>
  </svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}

export const GET = GET_og;
