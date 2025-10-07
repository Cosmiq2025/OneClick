// app/api/tx/route.ts
export const runtime = "edge";

// Simple helpers
function strip0x(s: string) {
  return s.startsWith("0x") ? s.slice(2) : s;
}

function isHexAddress(addr: string) {
  const a = strip0x(addr);
  return addr.startsWith("0x") && a.length === 40 && /^[0-9a-fA-F]+$/.test(a);
}

function leftPadHex32(hex: string) {
  const h = strip0x(hex).toLowerCase();
  return h.padStart(64, "0");
}

// Convert a decimal string like "0.01" to integer units with `decimals`
function toUnitsDecimalString(amount: string, decimals: bigint): string {
  const DEC10 = BigInt(10);
  const parts = amount.trim().split(".");
  if (parts.length > 2) throw new Error("invalid amount");

  const whole = parts[0] || "0";
  const frac = (parts[1] || "").replace(/[^0-9]/g, "");

  // take only up to `decimals` fractional digits, pad the rest
  const fracNeeded = Number(decimals);
  const fracTrimmed = frac.slice(0, fracNeeded);
  const fracPadded = fracTrimmed.padEnd(fracNeeded, "0");

  const wholeBig = BigInt(whole || "0");
  const fracBig = fracPadded ? BigInt(fracPadded) : BigInt(0);

  // whole * 10^decimals + frac
  const scale = DEC10 ** decimals;
  const value = wholeBig * scale + fracBig;

  return "0x" + value.toString(16);
}

async function handler(request: Request) {
  const url = new URL(request.url);
  const sid = url.searchParams.get("sid") || "demo";

  // ENV (set these in Vercel → Project → Settings → Environment Variables)
  const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS_SEPOLIA || "";
  const RECEIVER = process.env.NEXT_PUBLIC_RECEIVER_ADDRESS || "";
  const AMOUNT_USDC = process.env.NEXT_PUBLIC_AMOUNT_USDC || "0.01"; // decimal string
  const CHAIN_ID = "eip155:84532"; // Base Sepolia

  if (!USDC || USDC.length !== 42) {
    return new Response(
      JSON.stringify({ error: "Set NEXT_PUBLIC_USDC_ADDRESS_SEPOLIA (0x…)" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (!RECEIVER || !isHexAddress(RECEIVER)) {
    return new Response(
      JSON.stringify({ error: "Set valid NEXT_PUBLIC_RECEIVER_ADDRESS (0x…40 hex)" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // USDC has 6 decimals
  const DECIMALS = BigInt(6);
  let amountHex: string;
  try {
    amountHex = toUnitsDecimalString(AMOUNT_USDC, DECIMALS); // 0x…
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid NEXT_PUBLIC_AMOUNT_USDC (decimal string)" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // ERC20 transfer(to, amount) selector
  const selector = "a9059cbb";
  const toPadded = leftPadHex32(strip0x(RECEIVER));
  const amtPadded = leftPadHex32(strip0x(amountHex));
  const data = "0x" + selector + toPadded + amtPadded;

  const payload = {
    chainId: CHAIN_ID,
    method: "eth_sendTransaction",
    params: {
      to: USDC,
      data,
      value: "0x0",
    },
    meta: {
      note: `Pay for TL;DR (sid=${sid})`,
    },
  };

  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const GET = handler;
