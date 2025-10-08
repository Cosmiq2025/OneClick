// USE ONLY FROM CLIENT COMPONENTS
import { createWalletClient, custom } from "viem";
import { baseSepolia } from "viem/chains";
import { wrapFetchWithPayment } from "x402-fetch";

declare global { interface Window { ethereum?: any } }

export async function payToUnlock(url: string) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet found. Install Coinbase/MetaMask.");
  }

  // запросим аккаунт и сеть
  await window.ethereum.request({ method: "eth_requestAccounts" });
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x14A34" }], // Base Sepolia (84532)
    });
  } catch {}

  const wallet = createWalletClient({
    chain: baseSepolia,
    transport: custom(window.ethereum),
  });

  const paidFetch = wrapFetchWithPayment(wallet, { method: "USDC" });
  const res = await paidFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`Unlock failed: ${res.status}`);
  return res.json();
}
