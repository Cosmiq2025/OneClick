// /lib/utils.ts
export const mem = new Map<string, { value: string; ts: number }>();
export const rl = new Map<string, number[]>();

export function escapeHtml(s: string): string {
  return s.replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export async function summarize(sid: string): Promise<string> {
  const k = `tldr:${sid}`;
  const now = Date.now();
  const hit = mem.get(k);
  if (hit && now - hit.ts < 60_000) return hit.value; // 60s cache
  const demo = `This is a demo TL;DR for SID="${sid}".\n- Point 1: quick takeaway\n- Point 2: risks & next steps\n- Point 3: link back to source (optional)`;
  mem.set(k, { value: demo, ts: now });
  return demo;
}

export async function isRateLimited(ip: string): Promise<boolean> {
  if (!ip) return false;
  const now = Date.now();
  const windowMs = 30_000; // 30s
  const maxReq = 20;       // 20 req / window
  const arr = rl.get(ip) || [];
  const fresh = arr.filter((t) => now - t < windowMs);
  fresh.push(now);
  rl.set(ip, fresh);
  return fresh.length > maxReq;
}
