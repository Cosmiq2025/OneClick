// apps/miniapp/lib/splits.mjs
// NOTE: @0xsplits/splits-sdk is CommonJS → default import then pick props.
import SplitsSDK from "@0xsplits/splits-sdk";
const { SplitV2Client, SplitV2Type } = SplitsSDK;

import { readFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, http, getAddress, isAddress } from "viem";
import { baseSepolia } from "viem/chains"; // switch to `base` for mainnet
import { privateKeyToAccount } from "viem/accounts";

// ---- Env checks ----
const requiredEnv = ["SPLITS_DEPLOYER_PK", "RPC_BASE", "TREASURY_ADDRESS"];
for (const k of requiredEnv) {
  if (!process.env[k]) throw new Error(`Missing required environment variable: ${k}`);
}

const TREASURY = getAddress(process.env.TREASURY_ADDRESS);

// Normalize private key (ensure 0x prefix)
let pk = process.env.SPLITS_DEPLOYER_PK;
if (!pk.startsWith("0x")) pk = `0x${pk}`;
const account = privateKeyToAccount(pk);

// Clients (Base Sepolia)
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_BASE) });
const walletClient = createWalletClient({ chain: baseSepolia, transport: http(process.env.RPC_BASE), account });

// 84532 = Base Sepolia (8453 = Base mainnet)
const splits = new SplitV2Client({ chainId: 84532, publicClient, walletClient });

// --- In-memory cache (creator -> split) + inflight map ---
const mem = new Map();      // creator -> split
const pending = new Map();  // creator -> Promise<string>

// --- Boot-load previously saved splits from JSONL (optional) ---
try {
  // server writes to apps/miniapp/splits.jsonl → from lib/ it’s ../splits.jsonl
  const raw = await readFile(new URL("../splits.jsonl", import.meta.url)).catch(() => null);
  if (raw) {
    for (const line of raw.toString().split("\n")) {
      if (!line.trim()) continue;
      const { creator, split } = JSON.parse(line);
      if (creator && split) mem.set(getAddress(creator), split);
    }
    console.log(`[Splits] Boot-loaded ${mem.size} cached splits from splits.jsonl`);
  }
} catch (e) {
  console.warn("[Splits] Could not boot-load splits.jsonl:", e?.message || e);
}

/**
 * Ensure a 90/10 Split exists for the creator (Base Sepolia).
 * Returns the split address (creates once, race-safe).
 */
export async function ensureCreatorSplit(creatorWallet) {
  if (!isAddress(creatorWallet)) throw new Error("Invalid creator wallet address");
  const creator = getAddress(creatorWallet);

  const cached = mem.get(creator);
  if (cached) return cached;

  const inflight = pending.get(creator);
  if (inflight) return inflight;

  const creation = (async () => {
    try {
      console.log(`[Splits] Creating 90/10 split for ${creator} (treasury ${TREASURY})`);
      const { splitAddress } = await splits.createSplit({
        recipients: [
          { address: creator,  percentAllocation: 90.0 },
          { address: TREASURY, percentAllocation: 10.0 },
        ],
        totalAllocationPercent: 100.0,
        distributorFeePercent: 0.0,          // no bounty
        splitType: SplitV2Type?.Pull ?? 0,   // enum from SDK (fallback 0)
        ownerAddress: "0x0000000000000000000000000000000000000000", // immutable
        creatorAddress: TREASURY,
        chainId: 84532,
      });
      console.log(`[Splits] Created: ${splitAddress}`);
      mem.set(creator, splitAddress);
      return splitAddress;
    } catch (err) {
      console.error("[Splits] Failed:", err);
      const msg = err && err.message ? err.message : "Unknown error";
      throw new Error(`Failed to create split for ${creator}: ${msg}`);
    } finally {
      pending.delete(creator);
    }
  })();

  pending.set(creator, creation);
  return creation;
}

// Optional helpers
export function getCachedSplit(creatorWallet) {
  if (!isAddress(creatorWallet)) return null;
  return mem.get(getAddress(creatorWallet)) ?? null;
}
export function cacheSplit(creatorWallet, splitAddress) {
  if (!isAddress(creatorWallet)) throw new Error("Invalid creator wallet address");
  mem.set(getAddress(creatorWallet), splitAddress);
}
export function getAllCachedSplits() {
  return new Map(mem);
}
