"use client";

import { useState } from "react";
import { payToUnlock } from "../../lib/pay-client";

export default function UnlockButton({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<string>("");

  async function onClick() {
    try {
      setLoading(true);
      const base =
        (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:4021").replace(/\/$/, "");
      // add your own query params as your server expects (priceUsd/title/etc)
      const url = `${base}/api/unlock?postId=${postId}&price=0.01&title=Demo`;
      const data = await payToUnlock(url);
      setOut(JSON.stringify(data, null, 2));
    } catch (e: any) {
      alert(e.message || "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={onClick}
        disabled={loading}
        className="px-4 py-2 rounded bg-blue-600 text-white"
      >
        {loading ? "Processing…" : "Unlock for $0.01 USDC"}
      </button>
      {out && <pre className="text-xs p-2 bg-gray-50 rounded border overflow-auto">{out}</pre>}
    </div>
  );
}
