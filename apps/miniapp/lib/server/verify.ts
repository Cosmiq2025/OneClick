// apps/miniapp/lib/server/verify.ts
export type VerifyResult = { ok: true } | { ok: false; reason?: string };

export async function verifyPaymentOnBase(txHash: string): Promise<VerifyResult> {
  const ok = /^0x[0-9a-fA-F]{64}$/.test(txHash);
  return ok ? { ok: true } : { ok: false, reason: "invalid tx hash" };
}
