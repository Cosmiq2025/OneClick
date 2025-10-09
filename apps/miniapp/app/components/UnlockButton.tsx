// app/components/UnlockButton.tsx (or your path)
import React from "react";
import { payToUnlock } from "x402-fetch";
import { buildApiUrl } from "@/lib/utils"; // adjust import if your utils path differs

type Props = {
  priceUsd?: number;
  title?: string;
  body?: string;
};

export default function UnlockButton({
  priceUsd = 1,
  title = "Test",
  body = "Post",
}: Props) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unlocked, setUnlocked] = React.useState<string | null>(null);

  async function ensureWalletReady() {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("No EVM wallet found. Enable MetaMask or Coinbase Wallet for this site.");

    // request accounts
    await eth.request({ method: "eth_requestAccounts" });

    // ensure Base Sepolia (0x14a34)
    const cid: string = await eth.request({ method: "eth_chainId" });
    if (cid !== "0x14a34") {
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x14a34" }],
        });
      } catch (e: any) {
        // add chain if needed (code 4902)
        if (e?.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x14a34",
              chainName: "Base Sepolia",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
            }],
          });
        } else {
          throw e;
        }
      }
    }
  }

  async function onUnlock() {
    setError(null);
    setUnlocked(null);
    setLoading(true);

    try {
      await ensureWalletReady();

      const url = buildApiUrl("/api/unlock", { title, body, price: priceUsd });
      console.log("[UnlockButton] API_BASE:", (window as any).__API_BASE__);
      console.log("[UnlockButton] Calling URL:", url);

      // IMPORTANT: no walletClient arg — x402-fetch will use window.ethereum internally
      const result = await payToUnlock(url);

      const content =
        (result as any)?.content ??
        (typeof result === "string" ? result : JSON.stringify(result, null, 2));

      setUnlocked(content);
    } catch (e: any) {
      console.error("Unlock error:", e);
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-3">
      <button
        onClick={onUnlock}
        disabled={loading}
        className="w-full h-11 rounded-md font-bold text-white"
        style={{ background: "#1a1aff" }}
      >
        {loading ? "Processing…" : `Unlock for $${priceUsd.toFixed(2)} USDC`}
      </button>

      {error && <div style={{ color: "#d00" }}>{error}</div>}
      {unlocked && (
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{unlocked}</pre>
      )}
    </div>
  );
}
