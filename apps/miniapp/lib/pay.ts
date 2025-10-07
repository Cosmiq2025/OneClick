// apps/miniapp/lib/pay.ts
// ВАЖНО: импортируй и используй ЭТОТ модуль ТОЛЬКО из client-компонентов.
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";

const API_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE || "") // напр. "https://miniapp.oneclick.app"
    : ""; // на сервере всё равно не используем

function api(path: string) {
  return `${API_BASE}${path}`;
}

/**
 * Обёртка вокруг window.fetch для x402.
 * Автоматически обрабатывает 402 → платит → ретраит с X-PAYMENT.
 */
export const fetchWithPayment = wrapFetchWithPayment(fetch);

/**
 * X402-unlock. По умолчанию бьём в /api/unlock,
 * но можно пробросить id: unlockWith402("abc") -> /api/unlock/abc
 */
export async function unlockWith402(id?: string) {
  const route = id ? `/api/unlock/${id}` : `/api/unlock`;
  const res = await fetchWithPayment(api(route));
  if (!res.ok) throw new Error(`Unlock failed: ${res.status}`);

  // ожидаем JSON; сервер возвращает { ok: boolean, content: string, ... }
  const data = await res.json();

  // (опционально) распарсим подтверждение оплаты из заголовка
  const payHeader = res.headers.get("x-payment-response");
  const details = payHeader ? decodeXPaymentResponse(payHeader) : null;

  return { data, details };
}

/**
 * LEGACY: верификация произвольного txHash (не x402).
 * ТВОЙ экран делает POST -> значит и здесь делаем POST, чтобы не было рассинхрона.
 */
export async function verifyAndUnlock(txHash: `0x${string}`) {
  const res = await fetch(api(`/api/pay/verify`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txHash }),
  });
  if (!res.ok) throw new Error(`Verify failed: ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.reason ?? "Verification failed");
  return data;
}
