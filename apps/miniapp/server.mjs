// apps/miniapp/server.mjs
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { paymentMiddleware } from "x402-express";
import { isAddress, getAddress } from "viem";
import { SplitsStore } from "./lib/splits.store.mjs";
import { ensureCreatorSplit } from "./lib/splits.mjs";

const app = express();
app.set("trust proxy", 1);

// ===== ENV / Defaults =====
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const X402_NETWORK = process.env.X402_NETWORK || "base-sepolia";
const DEFAULT_USDC = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};
const USDC_ADDRESS =
  process.env.USDC_ADDRESS || DEFAULT_USDC[X402_NETWORK] || DEFAULT_USDC["base-sepolia"];

if (!isAddress(USDC_ADDRESS)) {
  throw new Error(`Invalid USDC_ADDRESS: ${USDC_ADDRESS}`);
}

// ===== CORS / JSON =====
const ALLOW_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:3001")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (ALLOW_ORIGINS.length === 0) ALLOW_ORIGINS.push("http://localhost:3001");

app.use(cors({ origin: ALLOW_ORIGINS }));
app.use(express.json({ limit: "1mb" }));

// ===== Rate Limiting =====
const unlockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { ok: false, error: "Too many unlock requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});
const onboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { ok: false, error: "Too many onboard requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ===== Store & small in-memory cache =====
const splits = new SplitsStore();

class SplitCache {
  constructor(ttlMs = 60 * 60 * 1000) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }
  get(addr) {
    const hit = this.cache.get(addr);
    if (!hit) return null;
    if (Date.now() - hit.ts > this.ttlMs) {
      this.cache.delete(addr);
      return null;
    }
    return hit.split;
  }
  set(addr, split) {
    this.cache.set(addr, { split, ts: Date.now() });
  }
  clear() { this.cache.clear(); }
  size() { return this.cache.size; }
}
const splitCache = new SplitCache();

// ===== Helpers =====
const clampUsd = (n) => (Number.isFinite(n) ? Math.min(100, Math.max(0.01, n)) : 1.0);
const parseUsd = (q) => clampUsd(Number.parseFloat(Array.isArray(q) ? q[0] : q));
const usdToUnits6 = (usd) => Math.round(usd * 1_000_000);
const getSplitWithCache = (creator) => {
  let split = splitCache.get(creator);
  if (split) return split;
  split = splits.get(creator);
  if (split) splitCache.set(creator, split);
  return split;
};

// ===== Health =====
app.get("/__who", (_req, res) => {
  res.json({
    ok: true,
    service: "x402-micropayments",
    network: X402_NETWORK,
    usdc: USDC_ADDRESS,
    splitsCount: splits.size(),
    cacheSize: splitCache.size(),
    timestamp: new Date().toISOString(),
  });
});

// ===== Creator onboarding =====
app.post("/api/creators/onboard", onboardLimiter, async (req, res, next) => {
  try {
    const { wallet } = req.body || {};
    if (!wallet || !isAddress(wallet)) {
      return res.status(400).json({ ok: false, error: "Valid wallet address required" });
    }
    const creator = getAddress(wallet);

    const existing = splits.getRecord(creator);
    if (existing?.split) {
      return res.json({ ok: true, splitAddress: existing.split, record: existing, alreadyExists: true });
    }

    const splitAddress = await ensureCreatorSplit(creator);
    const record = splits.getRecord(creator);
    splitCache.set(creator, splitAddress);

    res.json({ ok: true, splitAddress, record, message: "Creator successfully onboarded" });
  } catch (e) {
    next(e);
  }
});

// ===== Payment info (manual test) =====
app.get("/api/unlock/:postId/payment-info", async (req, res, next) => {
  try {
    const { postId } = req.params;
    const creatorRaw = String(req.query.creator || "").trim();
    if (!creatorRaw || !isAddress(creatorRaw)) {
      return res.status(400).json({
        ok: false,
        error: "Missing or invalid ?creator=<wallet>",
        example: `/api/unlock/${postId}/payment-info?creator=0x...&price=1.00`,
      });
    }
    const creator = getAddress(creatorRaw);
    const splitAddress = getSplitWithCache(creator);
    if (!splitAddress) {
      return res.status(400).json({
        ok: false, error: "Creator not onboarded", creator, hint: "POST /api/creators/onboard { wallet }",
      });
    }

    const price = parseUsd(req.query.price);
    const units = usdToUnits6(price);
    const fullUrl = `${req.protocol}://${req.get("host")}/api/unlock/${postId}?creator=${creator}&price=${price}`;

    res.status(402).json({
      x402Version: 1,
      error: "Payment required",
      accepts: [{
        scheme: "exact",
        network: X402_NETWORK,
        resource: fullUrl,
        description: `Unlock post: ${postId} ($${price.toFixed(2)})`,
        mimeType: "application/json",
        payTo: splitAddress,
        asset: USDC_ADDRESS,
        minAmountRequired: String(units),
        maxAmountRequired: String(Math.ceil(units * 1.2)),
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", decimals: 6 },
      }],
    });
  } catch (err) {
    next(err);
  }
});

// ===== Optional hard 402 guard (ensures 402 if no X-PAYMENT) =====
function hardRequirePaid({ postId, creator, price, splitAddress, req, res }) {
  if (req.headers["x-payment"]) return null; // allow through to middleware
  const units = usdToUnits6(price);
  const fullUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}${req.path}?creator=${creator}&price=${price}`;
  return res.status(402).json({
    x402Version: 1,
    error: "Payment required",
    accepts: [{
      scheme: "exact",
      network: X402_NETWORK,
      resource: fullUrl,
      description: `Unlock post: ${postId} ($${price.toFixed(2)})`,
      mimeType: "application/json",
      payTo: splitAddress,
      asset: USDC_ADDRESS,
      minAmountRequired: String(units),
      maxAmountRequired: String(Math.ceil(units * 1.2)),
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", decimals: 6 },
    }],
  });
}

// ===== Stateless unlock =====
app.get("/api/unlock/:postId", unlockLimiter, async (req, res, next) => {
  try {
    const { postId } = req.params;
    const creatorRaw = String(req.query.creator || "").trim();
    if (!creatorRaw || !isAddress(creatorRaw)) {
      return res.status(400).json({
        ok: false, error: "Missing or invalid ?creator=<wallet>",
        example: `/api/unlock/${postId}?creator=0x...&price=1.00`,
      });
    }
    const creator = getAddress(creatorRaw);
    const splitAddress = getSplitWithCache(creator);
    if (!splitAddress) {
      return res.status(400).json({
        ok: false, error: "Creator must onboard first", message: "POST /api/creators/onboard { wallet }", creator,
      });
    }

    const requestedPrice = req.query.price;
    const price = parseUsd(requestedPrice);
    const units = usdToUnits6(price);

    // 1) HARD GUARD: send 402 if there is no X-PAYMENT yet
    const maybeGuard = hardRequirePaid({ postId, creator, price, splitAddress, req, res });
    if (maybeGuard) return; // 402 already sent

    // 2) FACILITATOR PAYWALL: map must match Express route path (parametrized)
    const paywall = paymentMiddleware(
      splitAddress,
      {
        "GET /api/unlock/:postId": {
          price: `$${price.toFixed(2)}`,
          network: X402_NETWORK,
          config: {
            description: `Unlock post: ${postId}`,
            mimeType: "application/json",
            asset: USDC_ADDRESS,
            minAmountRequired: String(units),
            maxAmountRequired: String(Math.ceil(units * 1.2)),
            maxTimeoutSeconds: 60,
          },
        },
      },
      { url: FACILITATOR_URL }
    );

    // Run the middleware; success only after payment validated
    paywall(req, res, (err) => {
      if (err) return next(err);
      res.json({
        ok: true,
        unlocked: true,
        postId,
        creator,
        splitAddress,
        paid: `$${price.toFixed(2)}`,
        priceRequested: requestedPrice || "default",
      });
    });
  } catch (err) {
    next(err);
  }
});

// ===== Split management =====
app.get("/api/splits/:creator", (req, res) => {
  try {
    const { creator } = req.params;
    if (!isAddress(creator)) return res.status(400).json({ ok: false, error: "Invalid address" });
    const normalized = getAddress(creator);
    const record = splits.getRecord(normalized);
    if (!record) return res.status(404).json({ ok: false, error: "Split not found", creator: normalized });
    res.json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Internal error" });
  }
});

app.post("/api/splits", async (req, res) => {
  try {
    const { creator, split } = req.body || {};
    if (!creator || !split) return res.status(400).json({ ok: false, error: "creator and split required" });
    if (!isAddress(creator) || !isAddress(split)) return res.status(400).json({ ok: false, error: "Invalid address format" });
    const normalizedCreator = getAddress(creator);
    const normalizedSplit = getAddress(split);
    const record = await splits.upsert({ creator: normalizedCreator, split: normalizedSplit });
    splitCache.set(normalizedCreator, normalizedSplit);
    res.json({ ok: true, record });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// ===== Admin (optional) =====
app.post("/api/admin/cache/clear", (_req, res) => {
  splitCache.clear();
  res.json({ ok: true, message: "Cache cleared" });
});
app.get("/api/admin/stats", (_req, res) => {
  res.json({
    ok: true,
    stats: {
      splitsStored: splits.size(),
      cacheSize: splitCache.size(),
      network: X402_NETWORK,
      usdc: USDC_ADDRESS,
      facilitator: FACILITATOR_URL,
    },
  });
});

// ===== 404 & Error =====
app.use((req, res) => res.status(404).json({ ok: false, error: "Not found", path: req.originalUrl }));
app.use((err, _req, res, _next) => {
  console.error("[Error]", err);
  res.status(err.status || 500).json({ ok: false, error: err.message || "Internal server error" });
});

// ===== Startup =====
const PORT = Number(process.env.PORT || process.env.X402_PORT || 4021);
(async () => {
  try {
    await splits.init();
    console.log(`[Store] Initialized with ${splits.size()} cached splits`);
    app.listen(PORT, () => {
      console.log(`
🚀 x402 Micropayment Server
━━━━━━━━━━━━━━━━━━━━━━━━━━
  Port:        ${PORT}
  Network:     ${X402_NETWORK}
  USDC:        ${USDC_ADDRESS}
  Facilitator: ${FACILITATOR_URL}
  CORS:        ${ALLOW_ORIGINS.join(", ")}
  Splits:      ${splits.size()} loaded
━━━━━━━━━━━━━━━━━━━━━━━━━━
Endpoints:
  POST /api/creators/onboard
  GET  /api/unlock/:postId?creator=0x...&price=1.00
  GET  /api/unlock/:postId/payment-info
  GET  /api/splits/:creator
  POST /api/splits
  GET  /api/admin/stats
  POST /api/admin/cache/clear
      `);
    });
  } catch (err) {
    console.error("[Fatal] Failed to initialize server:", err);
    process.exit(1);
  }
})();
