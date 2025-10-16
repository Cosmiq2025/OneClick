// apps/miniapp/lib/splits.mjs
import SplitsSDK from "@0xsplits/splits-sdk";   // CJS default import
const { SplitV2Client } = SplitsSDK;            // no SplitV2Type (default is Pull)

import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  isAddress,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { SplitsStore } from "./splits.store.mjs";

// Pick chain from env (default: base-sepolia)
const X402_NETWORK = (process.env.X402_NETWORK || "base-sepolia").trim();
const CHAIN = X402_NETWORK === "base" ? base : baseSepolia;

/* =========================
   Environment & validation
   ========================= */
const requiredEnv = ["SPLITS_DEPLOYER_PK", "RPC_BASE", "TREASURY_ADDRESS"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Validate and normalize treasury
const TREASURY = getAddress(process.env.TREASURY_ADDRESS);
if (!isAddress(TREASURY)) {
  throw new Error(`Invalid TREASURY_ADDRESS: ${process.env.TREASURY_ADDRESS}`);
}

// Normalize private key (ensure 0x prefix)
let pk = process.env.SPLITS_DEPLOYER_PK;
if (!pk.startsWith("0x")) pk = `0x${pk}`;
const account = privateKeyToAccount(pk);

/* =========================
   viem clients + Splits client
   ========================= */
const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(process.env.RPC_BASE),
});

const walletClient = createWalletClient({
  chain: CHAIN,
  transport: http(process.env.RPC_BASE),
  account,
});

const splitsClient = new SplitV2Client({
  chainId: CHAIN.id,
  publicClient,
  walletClient,
});

/* =========================
   Store + inflight tracker
   ========================= */
export const store = new SplitsStore();
const inflight = new Map(); // creator -> Promise<string>

/* =========================
   Public API (used by server.mjs)
   ========================= */

/** Initialize the splits module and load persisted records. */
export async function initSplits() {
  await store.init();
  console.log(
    `[splits] Initialized with ${store.size()} cached splits (network=${X402_NETWORK}, chainId=${CHAIN.id})`
  );
}

/**
 * Ensure a 90/10 split exists for the creator.
 * - Idempotent
 * - Race-safe (coalesces concurrent calls per creator)
 * - Persists to SplitsStore (JSONL)
 *
 * @param {string} creatorWallet
 * @returns {Promise<string>} split contract address
 */
export async function ensureCreatorSplit(creatorWallet) {
  if (!isAddress(creatorWallet)) {
    throw new Error("Invalid creator wallet address");
  }
  const creator = getAddress(creatorWallet);

  // 1) Already cached?
  const existing = store.get(creator);
  if (existing) return existing;

  // 2) Already creating?
  const pending = inflight.get(creator);
  if (pending) return pending;

  // 3) Create new split
  const creation = (async () => {
    try {
      console.log(`[splits] Creating 90/10 split for ${creator}`);
      console.log(`[splits] Treasury 10% → ${TREASURY}`);

      const { splitAddress } = await splitsClient.createSplit({
        recipients: [
          { address: creator,  percentAllocation: 90.0 },
          { address: TREASURY, percentAllocation: 10.0 },
        ],
        totalAllocationPercent: 100.0,
        distributorFeePercent: 0.0,
        // NOTE: splitType omitted — SDK defaults to Pull
        ownerAddress: "0x0000000000000000000000000000000000000000", // immutable
        creatorAddress: TREASURY,
        chainId: CHAIN.id,
      });

      const normalizedSplit = getAddress(splitAddress);
      console.log(`[splits] ✓ Created split ${normalizedSplit} for ${creator}`);

      await store.upsert({ creator, split: normalizedSplit });
      return normalizedSplit;
    } catch (err) {
      console.error("[splits] Failed to create split:", err);
      throw new Error(
        `Failed to create split for ${creator}: ${err?.message || "Unknown error"}`
      );
    } finally {
      inflight.delete(creator);
    }
  })();

  inflight.set(creator, creation);
  return creation;
}

/** Get cached split (no create). */
export function getCachedSplit(creatorWallet) {
  if (!isAddress(creatorWallet)) return null;
  return store.get(getAddress(creatorWallet)) || null;
}

/** Check if a creator has a split. */
export function hasSplit(creatorWallet) {
  if (!isAddress(creatorWallet)) return false;
  return Boolean(store.get(getAddress(creatorWallet)));
}

/** Import/override a split record manually. */
export async function cacheSplit(creatorWallet, splitAddress) {
  if (!isAddress(creatorWallet) || !isAddress(splitAddress)) {
    throw new Error("Invalid address");
  }
  return await store.upsert({
    creator: getAddress(creatorWallet),
    split: getAddress(splitAddress),
  });
}

/** Convenience stats (useful for /__who or admin). */
export function getStats() {
  return {
    totalSplits: store.size(),
    inflightCreations: inflight.size,
    network: X402_NETWORK,
    chainId: CHAIN.id,
    treasury: TREASURY,
    shares: { creator: "90%", treasury: "10%" },
  };
}
