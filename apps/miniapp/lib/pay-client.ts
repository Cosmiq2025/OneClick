// USE ONLY FROM CLIENT COMPONENTS
import { createWalletClient, custom } from "viem";
import { baseSepolia } from "viem/chains";
import { wrapFetchWithPayment } from "x402-fetch";

declare global { interface Window { ethereum?: any } }

export async function getPaidFetch() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Wallet provider not found. Install Coinbase/MetaMask.");
  }
  await window.ethereum.request({ method: "eth_requestAccounts" });
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x14A34" }], // Base Sepolia (84532)
    });
  } catch { /* ignore if already on chain */ }

  const wallet = createWalletClient({
    chain: baseSepolia,
    transport: custom(window.ethereum),
  });

  return wrapFetchWithPayment(wallet, { method: "USDC" });
}

export async function payToUnlock(url: string) {
  const paidFetch = await getPaidFetch();
  const res = await paidFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`Unlock failed: ${res.status}`);
  return res.json();
}
