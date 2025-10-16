// apps/miniapp/server.mjs
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { paymentMiddleware } from "x402-express";
import { isAddress, getAddress } from "viem";
import { store as splits, initSplits, ensureCreatorSplit } from "./lib/splits.mjs";

const app = express();
app.set("trust proxy", 1);

/* ========= ENV / Defaults ========= */

// Normalize facilitator without forcing env changes.
// If someone sets the dead "/facilitator" path, or non-www host, silently fix it.
function normalizeFacilitator(raw) {
  let u = (raw || "https://www.x402.org").trim();
  u = u.replace(/\/+$/, ""); // strip trailing slash(es)
  if (/^https?:\/\/[^/]+\/facilitator$/i.test(u)) {
    console.warn(`[x402] FACILITATOR_URL points at /facilitator; using the host root instead`);
    u = u.replace(/\/facilitator$/i, "");
  }
  // Prefer www to avoid a 308 hop from x402.org → www.x402.org
  u = u.replace("://x402.org", "://www.x402.org");
  return u;
}

const FACILITATOR_URL = normalizeFacilitator(process.env.FACILITATOR_URL);
const X402_NETWORK = process.env.X402_NETWORK || "base-sepolia";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

// USDC defaults by network
const DEFAULT_USDC = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

if (!DEFAULT_USDC[X402_NETWORK] && !process.env.USDC_ADDRESS) {
  throw new Error(
    `Unsupported X402_NETWORK: ${X402_NETWORK}. Set USDC_ADDRESS explicitly or use one of: ${Object.keys(DEFAULT_USDC).join(", ")}`
  );
}

const USDC_ADDRESS =
  process.env.USDC_ADDRESS || DEFAULT_USDC[X402_NETWORK] || DEFAULT_USDC["base-sepolia"];

if (!isAddress(USDC_ADDRESS)) {
  throw new Error(`Invalid USDC_ADDRESS: ${USDC_ADDRESS}`);
}

/* ========= CORS / JSON ========= */

const ALLOW_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:3001")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (ALLOW_ORIGINS.length === 0) {
  console.warn("[CORS] No origins configured, using http://localhost:3001");
  ALLOW_ORIGINS.push("http://localhost:3001");
}

app.use(cors({ origin: ALLOW_ORIGINS }));
app.use(express.json({ limit: "1mb" }));

/* ========= Rate Limiting ========= */

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

/* ========= In-memory split cache (TTL) ========= */

class SplitCache {
  constructor(ttlMs = 3600000) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }
  get(creator) {
    const entry = this.cache.get(creator);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.cache.delete(creator);
      return null;
    }
    return entry.split;
  }
  set(creator, split) { this.cache.set(creator, { split, ts: Date.now() }); }
  clear() { this.cache.clear(); }
  size() { return this.cache.size; }
}
const splitCache = new SplitCache();

/* ========= Utilities ========= */

function clampPriceUsd(n) {
  if (!Number.isFinite(n)) return 1.0;
  return Math.min(100.0, Math.max(0.01, n));
}
function parsePriceFromQuery(q) {
  if (!q) return 1.0; // explicit default
  const n = Number.parseFloat(Array.isArray(q) ? q[0] : q);
  return clampPriceUsd(n);
}
function usdToUnits6(usd) {
  return Math.round(usd * 1_000_000);
}
function getSplitWithCache(creator) {
  let split = splitCache.get(creator);
  if (split) return split;
  // SplitsStore API: get(creator) → string | undefined
  split = splits.get?.(creator);
  if (split) splitCache.set(creator, split);
  return split;
}
// respect proxies when building absolute URLs
function getProto(req) {
  const xf = req.headers["x-forwarded-proto"];
  return (Array.isArray(xf) ? xf[0] : xf || req.protocol || "https").split(",")[0];
}

/* ========= Health ========= */

app.get("/__who", (_req, res) => {
  res.json({
    ok: true,
    service: "x402-micropayments",
    network: X402_NETWORK,
    usdc: USDC_ADDRESS,
    splitsCount: splits.size?.() ?? 0,
    cacheSize: splitCache.size(),
    facilitator: FACILITATOR_URL,
    timestamp: new Date().toISOString(),
  });
});

/* ========= Creator onboarding ========= */

app.post("/api/creators/onboard", onboardLimiter, async (req, res, next) => {
  try {
    const { wallet } = req.body || {};
    if (!wallet || !isAddress(wallet)) {
      return res.status(400).json({ ok: false, error: "Valid wallet address required" });
    }
    const creator = getAddress(wallet);

    const existing = splits.get?.(creator);
    if (existing) {
      console.log(`[Onboard] Creator ${creator} already exists → split ${existing}`);
      return res.json({
        ok: true,
        splitAddress: existing,
        record: { creator, split: existing },
        alreadyExists: true,
      });
    }

    console.log(`[Onboard] Creating split for ${creator}`);
    const splitAddress = await ensureCreatorSplit(creator);
    splitCache.set(creator, splitAddress);

    // fetch back for consistency
    const record = splits.get?.(creator) ? { creator, split: splits.get(creator) } : { creator, split: splitAddress };

    console.log(`[Onboard] ✓ Creator ${creator} onboarded with split ${splitAddress}`);
    res.json({ ok: true, splitAddress, record, message: "Creator successfully onboarded" });
  } catch (e) {
    console.error("[Onboard] Error:", e);
    next(e);
  }
});

/* ========= Payment info (manual testing) ========= */

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
        ok: false,
        error: "Creator not onboarded",
        creator,
        hint: "POST /api/creators/onboard { wallet }",
      });
    }

    const price = parsePriceFromQuery(req.query.price);
    const units = usdToUnits6(price);
    const minReq = String(units);
    const maxReq = String(Math.ceil(units * 1.2));

    const fullUrl = `${getProto(req)}://${req.get("host")}/api/unlock/${postId}?creator=${creator}&price=${price}`;

    res.status(402).json({
      x402Version: 1,
      error: "Payment required",
      accepts: [
        {
          scheme: "exact",
          network: X402_NETWORK,
          resource: fullUrl,
          description: `Unlock post: ${postId} ($${price.toFixed(2)})`,
          mimeType: "application/json",
          payTo: splitAddress,
          asset: USDC_ADDRESS,
          minAmountRequired: minReq,
          maxAmountRequired: maxReq,
          maxTimeoutSeconds: 60,
          extra: { name: "USDC", decimals: 6 },
        },
      ],
    });
  } catch (err) {
    console.error("[Payment-Info] Error:", err);
    next(err);
  }
});

/* ========= Content unlock (paywall) ========= */

app.get("/api/unlock/:postId", unlockLimiter, async (req, res, next) => {
  try {
    const { postId } = req.params;
    const creatorRaw = String(req.query.creator || "").trim();

    if (!creatorRaw || !isAddress(creatorRaw)) {
      return res.status(400).json({
        ok: false,
        error: "Missing or invalid ?creator=<wallet>",
        example: `/api/unlock/${postId}?creator=0x...&price=1.00`,
      });
    }

    const creator = getAddress(creatorRaw);
    const splitAddress = getSplitWithCache(creator);
    if (!splitAddress) {
      return res.status(400).json({
        ok: false,
        error: "Creator must onboard first",
        message: "POST /api/creators/onboard { wallet }",
        creator,
      });
    }

    const requestedPrice = req.query.price;
    const price = parsePriceFromQuery(requestedPrice);
    const units = usdToUnits6(price);
    const minReq = String(units);
    const maxReq = String(Math.ceil(units * 1.2));

    // Build both keys so the middleware matches regardless of literal vs pattern
    const method = req.method.toUpperCase(); // "GET"
    const literalKey = `${method} /api/unlock/${postId}`;
    const patternKey = `${method} /api/unlock/:postId`;

    const routeConfig = {
      price: `$${price.toFixed(2)}`,
      network: X402_NETWORK,
      config: {
        description: `Unlock post: ${postId}`,
        mimeType: "application/json",
        asset: USDC_ADDRESS,
        minAmountRequired: minReq,
        maxAmountRequired: maxReq,
        maxTimeoutSeconds: 60,
      },
    };

    const paywall = paymentMiddleware(
      splitAddress,
      { [literalKey]: routeConfig, [patternKey]: routeConfig },
      { url: FACILITATOR_URL }
    );

    // Apply paywall
    paywall(req, res, (err) => {
      if (err) return next(err);

      // ---- SAFETY NET ----
      // If the middleware didn't 402 and didn't mark it paid, return 402 ourselves
      if (!res.headersSent && !(req.x402 && req.x402.paid === true)) {
        const fullUrl = `${getProto(req)}://${req.get("host")}/api/unlock/${postId}?creator=${creator}&price=${price}`;
        return res.status(402).json({
          x402Version: 1,
          error: "Payment required",
          accepts: [
            {
              scheme: "exact",
              network: X402_NETWORK,
              resource: fullUrl,
              description: `Unlock post: ${postId} ($${price.toFixed(2)})`,
              mimeType: "application/json",
              payTo: splitAddress,
              asset: USDC_ADDRESS,
              minAmountRequired: minReq,
              maxAmountRequired: maxReq,
              maxTimeoutSeconds: 60,
              extra: { name: "USDC", decimals: 6 },
            },
          ],
        });
      }

      // Paid → success
      console.log(
        `[Unlock] ✓ postId=${postId} creator=${creator} split=${splitAddress} price=$${price.toFixed(2)}`
      );
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
    console.error("[Unlock] Error:", err);
    next(err);
  }
});

/* ========= Split management ========= */

app.get("/api/splits/:creator", (req, res) => {
  try {
    const { creator } = req.params;
    if (!isAddress(creator)) {
      return res.status(400).json({ ok: false, error: "Invalid address" });
    }
    const normalized = getAddress(creator);
    const split = splits.get ? splits.get(normalized) : undefined;
    if (!split) {
      return res.status(404).json({
        ok: false,
        error: "Split not found for this creator",
        creator: normalized,
      });
    }
    res.json({ ok: true, record: { creator: normalized, split } });
  } catch (err) {
    console.error("[Splits GET] Error:", err);
    res.status(500).json({ ok: false, error: err?.message || "Internal error" });
  }
});

app.post("/api/splits", async (req, res) => {
  try {
    const { creator, split } = req.body || {};
    if (!creator || !split) {
      return res.status(400).json({ ok: false, error: "creator and split addresses required" });
    }
    if (!isAddress(creator) || !isAddress(split)) {
      return res.status(400).json({ ok: false, error: "Invalid address format" });
    }
    const normalizedCreator = getAddress(creator);
    const normalizedSplit = getAddress(split);

    // SplitsStore exposes upsert({ creator, split })
    const record = await splits.upsert({ creator: normalizedCreator, split: normalizedSplit });
    splitCache.set(normalizedCreator, normalizedSplit);

    console.log(`[Splits POST] Manually added split for ${normalizedCreator}: ${normalizedSplit}`);
    res.json({ ok: true, record });
  } catch (e) {
    console.error("[Splits POST] Error:", e);
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

/* ========= Admin auth (strict) ========= */

function adminOnly(req, res, next) {
  const token = req.get("x-admin-token");
  if (!ADMIN_TOKEN || !token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  next();
}

/* ========= Admin endpoints ========= */

app.post("/api/admin/cache/clear", adminOnly, (_req, res) => {
  splitCache.clear();
  console.log("[Admin] Split cache cleared");
  res.json({ ok: true, message: "Cache cleared" });
});

app.get("/api/admin/stats", adminOnly, (_req, res) => {
  res.json({
    ok: true,
    stats: {
      splitsStored: splits.size?.() ?? 0,
      cacheSize: splitCache.size(),
      network: X402_NETWORK,
      usdc: USDC_ADDRESS,
      facilitator: FACILITATOR_URL,
    },
  });
});

/* ========= 404 & Error handlers ========= */

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found", path: req.originalUrl });
});

app.use((err, _req, res, _next) => {
  console.error("[Error]", err);
  res.status(err.status || 500).json({ ok: false, error: err.message || "Internal server error" });
});

/* ========= Startup & graceful shutdown ========= */

const PORT = Number(process.env.PORT || process.env.X402_PORT || 4021);
let server;

(async () => {
  try {
    await initSplits();
    console.log(`[Store] Initialized with ${splits.size?.() ?? 0} cached splits`);

    server = app.listen(PORT, () => {
      console.log(`
🚀 x402 Micropayment Server
━━━━━━━━━━━━━━━━━━━━━━━━━━
  Port:        ${PORT}
  Network:     ${X402_NETWORK}
  USDC:        ${USDC_ADDRESS}
  Facilitator: ${FACILITATOR_URL}
  CORS:        ${ALLOW_ORIGINS.join(", ")}
  Splits:      ${splits.size?.() ?? 0} loaded
━━━━━━━━━━━━━━━━━━━━━━━━━━

Endpoints:
  POST /api/creators/onboard
  GET  /api/unlock/:postId?creator=0x...&price=1.00
  GET  /api/unlock/:postId/payment-info
  GET  /api/splits/:creator
  POST /api/splits

Admin (Header: x-admin-token):
  GET  /api/admin/stats
  POST /api/admin/cache/clear
━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });
  } catch (err) {
    console.error("[Fatal] Failed to initialize server:", err);
    process.exit(1);
  }
})();

function shutdown(signal) {
  console.log(`[Shutdown] Received ${signal}, closing server...`);
  if (server) {
    server.close(() => {
      console.log("[Shutdown] HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      console.warn("[Shutdown] Force exit after 10s");
      process.exit(0);
    }, 10_000).unref();
  } else {
    process.exit(0);
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
