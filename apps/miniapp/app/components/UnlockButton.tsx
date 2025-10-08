"use client";

import { useState } from "react";
import { payToUnlock } from "../../lib/pay-client";

export default function UnlockButton({ postId }: { postId?: string }) {
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState("");

  async function onClick() {
    try {
      setLoading(true);
      const base = (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:4021").replace(/\/$/, "");
      const url = `${base}/api/unlock?title=Demo&postId=${postId ?? "demo"}`;
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
      <button onClick={onClick} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">
        {loading ? "Processing…" : "Unlock for $1.00 USDC"}
      </button>
      {out && <pre className="text-xs p-2 bg-gray-100 rounded border overflow-auto">{out}</pre>}
    </div>
  );
}
