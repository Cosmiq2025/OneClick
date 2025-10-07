// apps/miniapp/app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

export default function MiniappPage() {
  const [locked, setLocked] = useState(true);
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Just for display
  const amountHuman = useMemo(() => {
    const v = Number(process.env.NEXT_PUBLIC_AMOUNT_USDC ?? "0.01");
    return Number.isFinite(v) && v > 0 ? v : 0.01;
  }, []);

  const receiver = process.env.NEXT_PUBLIC_RECEIVER_ADDRESS ?? "RECEIVER_ADDRESS";
  const usdc     = process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "USDC_ADDRESS";

  useEffect(() => {
    const ok = typeof window !== "undefined" && localStorage.getItem("oneclick_unlocked") === "1";
    setLocked(!ok);
  }, []);

  async function verifyAndUnlock(raw: string) {
    const clean = raw.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(clean)) {
      setMsg("Invalid txHash format: need 0x + 64 hex characters");
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch("/api/pay/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash: clean }),
      });
      const data = await r.json();
      if (data.ok) {
        localStorage.setItem("oneclick_unlocked", "1");
        setLocked(false);
        setMsg("Payment verified ✅");
      } else {
        setMsg(data.reason || data.error || "Payment not verified");
      }
    } catch (e: any) {
      setMsg(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Miniapp Unlock</h1>
        <p style={{ color: "#666", marginTop: 6 }}>
          Send USDC (Base Sepolia) → paste txHash → click Verify.
        </p>
      </header>

      <section style={{ border: "1px solid #eee", borderRadius: 16, padding: 20 }}>
        <div style={locked ? { filter: "blur(6px)", userSelect: "none", pointerEvents: "none" } : undefined}>
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>Premium Content</h2>
          <p>This will appear after successful payment and verification.</p>
        </div>

        {locked && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 10, fontWeight: 600 }}>
              Minimum: {amountHuman} USDC (Base Sepolia)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#555", lineHeight: 1.4 }}>
                Send USDC to:{" "}
                <code style={{ background: "#f6f6f6", padding: "2px 6px", borderRadius: 6, wordBreak: "break-all" }}>
                  {receiver}
                </code>
                <br />
                USDC token (test):{" "}
                <code style={{ background: "#f6f6f6", padding: "2px 6px", borderRadius: 6, wordBreak: "break-all" }}>
                  {usdc}
                </code>
              </div>

              <input
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="Paste full txHash (0x + 64 hex)"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                }}
              />

              <button
                onClick={() => verifyAndUnlock(txHash)}
                disabled={loading}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                  opacity: loading ? 0.7 : 1,
                  fontWeight: 600,
                }}
              >
                {loading ? "Checking…" : "Verify"}
              </button>
            </div>

            {msg && (
              <div style={{ color: msg.includes("✅") ? "#0a7f18" : "#c00", fontSize: 14, whiteSpace: "pre-wrap" }}>
                {msg}
              </div>
            )}

            <div style={{ marginTop: 10, color: "#777", fontSize: 12 }}>
              Hint: copy the full txHash from the block explorer (66 characters). No spaces or ellipsis.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
