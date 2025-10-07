// apps/miniapp/app/create/page.tsx
"use client";

import { useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

type CreateResult = { id: string; shareUrl: string };

export default function CreatePostPage() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [priceUsd, setPriceUsd] = useState("1.00");
  const [creator, setCreator] = useState(""); // <— creator’s own wallet
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  const validPrice = useMemo(() => {
    const n = Number(priceUsd);
    return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "1.00";
  }, [priceUsd]);

  async function onCreateImport() {
    setLoading(true); setErr(null); setResult(null);
    try {
      if (!sourceUrl.trim()) throw new Error("Please paste a Notion or Google Doc link.");
      if (!creator.trim() || !/^0x[a-fA-F0-9]{40}$/.test(creator.trim())) {
        throw new Error("Please enter your wallet address (valid 0x...).");
      }

      const res = await fetch(`${API_BASE}/api/posts/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim(),
          priceUsd: Number(validPrice),
          creator: creator.trim(), // <— send creator wallet
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Import failed");
      setResult({ id: data.id, shareUrl: data.shareUrl });
    } catch (e: any) {
      setErr(e.message ?? "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Create Paid Post</h1>
        <p className="text-gray-500">
          Import a Notion or Google Doc link. We’ll generate a shareable page your readers can unlock via Base x402.
        </p>
      </header>

      <section className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Source URL</label>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="Paste a Notion or Google Doc (public link)"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Price (USDC)</label>
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="1.00"
              value={priceUsd}
              onChange={(e) => setPriceUsd(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Readers pay in USDC on Base.
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Your Wallet (0x…)</label>
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="Paste your Base wallet (payouts)"
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              A small platform fee (e.g., 10%) is auto-applied on-chain. You receive the rest instantly.
            </p>
          </div>
        </div>

        <button
          onClick={onCreateImport}
          disabled={loading}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {loading ? "Importing…" : "Import & Create"}
        </button>

        <p className="text-xs text-gray-500">
          Tip: Notion public pages import best. Google Docs may require OAuth later.
        </p>

        {err && <p className="text-red-600">{err}</p>}

        {result && (
          <div className="p-4 border rounded space-y-2">
            <div className="font-semibold">Post created ✓</div>
            <div className="flex items-center gap-3">
              <code className="bg-gray-50 px-2 py-1 rounded">{result.shareUrl}</code>
              <button
                onClick={() => navigator.clipboard.writeText(result.shareUrl)}
                className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
              >
                Copy
              </button>
            </div>
            <a
              href={result.shareUrl}
              className="inline-block text-blue-600 hover:underline text-sm"
            >
              Open preview page
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
