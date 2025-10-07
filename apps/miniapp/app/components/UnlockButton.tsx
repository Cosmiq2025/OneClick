"use client";
import { useState } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:4021").replace(/\/$/, "");
const FACILITATOR = process.env.NEXT_PUBLIC_FACILITATOR_URL || "https://x402.org/facilitator";
const NETWORK = process.env.NEXT_PUBLIC_X402_NETWORK || "base-sepolia";

export default function UnlockButton({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onUnlock() {
    setLoading(true); setErr(null);
    try {
      const mod = await import("x402-fetch"); // npm-пакет
      const wrap =
        (mod as any).wrapFetchWithPayment ||
        ((mod as any).default && (mod as any).default.wrapFetchWithPayment);
      if (typeof wrap !== "function") throw new Error("x402: wrapFetchWithPayment missing");

      // Инициализация (оба варианта совместимы)
      let payFetch: typeof fetch;
      try {
        payFetch = wrap(fetch, { facilitator: FACILITATOR, network: NETWORK });
      } catch {
        const step = wrap({ facilitator: FACILITATOR, network: NETWORK });
        payFetch = typeof step === "function" ? step(fetch) : step;
      }

      // <-- ВАЖНО: headers как массив пар
      const resp = await payFetch(`${API_BASE}/api/unlock/${encodeURIComponent(postId)}`, {
        method: "POST",
        headers: [["accept", "application/json"]] as [string, string][],
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Unlock failed (${resp.status})`);
      }

      const data = await resp.json();
      const content = (data as any)?.content;
      if (!content) throw new Error("No content from server");

      setHtml(String(content));
    } catch (e: any) {
      setErr(e?.message || "Unlock failed");
    } finally {
      setLoading(false);
    }
  }

  if (html) {
    return (
      <iframe
        title="Unlocked content"
        sandbox="allow-same-origin allow-forms"
        srcDoc={html}
        style={{ width: "100%", height: "70vh", border: "1px solid #e5e7eb", borderRadius: 12 }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={onUnlock}
        disabled={loading}
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
      >
        {loading ? "Processing…" : "Unlock"}
      </button>
      {err && <p className="text-red-600 text-sm">{err}</p>}
    </div>
  );
}
