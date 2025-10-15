// apps/miniapp/server.mjs
import express from "express";
import cors from "cors";
import { paymentMiddleware } from "x402-express";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAddress, getAddress } from "viem";
import { SplitsStore } from "./lib/splits.store.mjs";
import { ensureCreatorSplit } from "./lib/splits.mjs";

const app = express();
app.set("trust proxy", 1);

// ===== ENV / Defaults =====
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const X402_NETWORK = process.env.X402_NETWORK || "base-sepolia";

// USDC defaults by network
const DEFAULT_USDC = {
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};
const USDC_ADDRESS = process.env.USDC_ADDRESS || DEFAULT_USDC[X402_NETWORK] || DEFAULT_USDC["base-sepolia"];

if (!isAddress(USDC_ADDRESS)) {
  throw new Error(`Invalid USDC_ADDRESS: ${USDC_ADDRESS}`);
}

// ===== CORS / JSON =====
const ALLOW_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:3001")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (ALLOW_ORIGINS.length === 0) {
  console.warn("[CORS] No origins configured, using localhost:3001");
  ALLOW_ORIGINS.push("http://localhost:3001");
}

app.use(cors({ origin: ALLOW_ORIGINS }));
app.use(express.json({ limit: "1mb" }));

// ===== Store =====
const splits = new SplitsStore();

// ===== Health =====
app.get("/__who", (_req, res) => {
  res.json({
    ok: true,
    service: "x402-micropayments",
    network: X402_NETWORK,
    usdc: USDC_ADDRESS,
    splitsCount: splits.size(),
    timestamp: new Date().toISOString(),
  });
});

// ===== Creator onboarding =====
app.post("/api/creators/onboard", async (req, res, next) => {
  try {
    const { wallet } = req.body || {};
    
    if (!wallet || !isAddress(wallet)) {
      return res.status(400).json({ 
        ok: false, 
        error: "Valid wallet address required" 
      });
    }

    // Check if already onboarded
    const existing = splits.getRecord(wallet);
    if (existing?.split) {
      return res.json({
        ok: true,
        splitAddress: existing.split,
        record: existing,
        alreadyExists: true,
      });
    }

    // Create split on-chain (ensureCreatorSplit handles persistence via store)
    const splitAddress = await ensureCreatorSplit(wallet);

    const record = splits.getRecord(wallet);
    res.json({ 
      ok: true, 
      splitAddress, 
      record,
      message: "Creator successfully onboarded"
    });
  } catch (e) {
    next(e);
  }
});

// ===== Post database (replace with real DB) =====
async function dbFindPost(postId) {
  const file = "posts.json";
  if (!existsSync(file)) {
    console.warn(`[DB] posts.json not found`);
    return null;
  }

  try {
    const raw = await readFile(file, "utf8");
    const posts = JSON.parse(raw || "{}");
    const post = posts[postId];

    if (!post) return null;

    if (!post.creatorWallet || !isAddress(post.creatorWallet)) {
      console.error(`[DB] Invalid creator wallet for post ${postId}`);
      return null;
    }

    return {
      creatorWallet: getAddress(post.creatorWallet),
      priceUsd: parsePrice(post.priceUsd),
      content: post.content || "🎉 Content unlocked",
    };
  } catch (err) {
    console.error("[DB] Error reading posts.json:", err.message);
    return null;
  }
}

/**
 * Parse price string to number.
 */
function parsePrice(priceStr) {
  if (typeof priceStr === "number") return Math.max(0.01, priceStr);

  const cleaned = String(priceStr || "1.00").replace(/[$,]/g, "");
  const parsed = Number.parseFloat(cleaned);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[Price] Invalid price "${priceStr}", defaulting to $1.00`);
    return 1.0;
  }

  return Math.min(100.0, Math.max(0.01, parsed));
}

/**
 * Convert USD to USDC units (6 decimals).
 */
function usdToUnits(usd) {
  return Math.round(usd * 1_000_000);
}

/**
 * Apply price override from query param.
 */
function applyPriceOverride(basePrice, queryPrice) {
  if (!queryPrice) return basePrice;

  const override = Number.parseFloat(
    Array.isArray(queryPrice) ? queryPrice[0] : queryPrice
  );

  if (Number.isFinite(override) && override > 0) {
    const clamped = Math.min(100.0, Math.max(0.01, override));
    console.log(`[Price] Override applied: $${clamped.toFixed(2)}`);
    return clamped;
  }

  return basePrice;
}

// ===== Content unlock endpoint =====
app.get("/api/unlock/:postId", async (req, res, next) => {
  try {
    const { postId } = req.params;

    // 1. Fetch post
    const post = await dbFindPost(postId);
    if (!post) {
      return res.status(404).json({
        ok: false,
        error: "Post not found",
        postId,
      });
    }

    // 2. Check if creator has onboarded
    let splitAddress = splits.get(post.creatorWallet);
    
    if (!splitAddress) {
      return res.status(400).json({
        ok: false,
        error: "Creator must onboard first",
        message: "This creator hasn't connected their payout wallet. Ask them to call POST /api/creators/onboard",
        creatorWallet: post.creatorWallet,
      });
    }

    // 3. Calculate price (with optional override)
    let price = applyPriceOverride(post.priceUsd, req.query.price);
    const units = usdToUnits(price);
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

    // 4. Configure payment middleware with unique key per post
    const paywall = paymentMiddleware(
      splitAddress,
      {
        [`GET /api/unlock/${postId}`]: {
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

    // 5. Apply paywall middleware
    paywall(req, res, (err) => {
      if (err) return next(err);

      // Payment successful
      res.json({
        ok: true,
        postId,
        splitAddress,
        paid: `$${price.toFixed(2)}`,
        content: post.content,
      });
    });
  } catch (err) {
    next(err);
  }
});

// ===== Payment info endpoint (for manual testing) =====
app.get("/api/unlock/:postId/payment-info", async (req, res, next) => {
  try {
    const { postId } = req.params;

    const post = await dbFindPost(postId);
    if (!post) {
      return res.status(404).json({ ok: false, error: "Post not found" });
    }

    const splitAddress = splits.get(post.creatorWallet);
    if (!splitAddress) {
      return res.status(400).json({
        ok: false,
        error: "Creator not onboarded",
        creatorWallet: post.creatorWallet,
      });
    }

    let price = applyPriceOverride(post.priceUsd, req.query.price);
    const units = usdToUnits(price);
    const fullUrl = `${req.protocol}://${req.get("host")}/api/unlock/${postId}`;

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
          minAmountRequired: String(units),
          maxAmountRequired: String(Math.ceil(units * 1.2)),
          maxTimeoutSeconds: 60,
          extra: { name: "USDC", decimals: 6 },
        },
      ],
    });
  } catch (err) {
    next(err);
  }
});

// ===== Split management API =====
app.get("/api/splits/:creator", (req, res) => {
  try {
    const { creator } = req.params;
    
    if (!isAddress(creator)) {
      return res.status(400).json({ 
        ok: false, 
        error: "Invalid address" 
      });
    }

    const record = splits.getRecord(creator);
    if (!record) {
      return res.status(404).json({ 
        ok: false, 
        error: "Split not found for this creator" 
      });
    }

    res.json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ 
      ok: false, 
      error: err?.message || "Internal error" 
    });
  }
});

app.post("/api/splits", async (req, res) => {
  try {
    const { creator, split } = req.body || {};

    if (!creator || !split) {
      return res.status(400).json({
        ok: false,
        error: "creator and split addresses required",
      });
    }

    if (!isAddress(creator) || !isAddress(split)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid address format",
      });
    }

    const record = await splits.upsert({ creator, split });
    res.json({ ok: true, record });
  } catch (e) {
    res.status(400).json({
      ok: false,
      error: e?.message || String(e),
    });
  }
});

// ===== 404 handler =====
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.originalUrl,
  });
});

// ===== Error handler =====
app.use((err, _req, res, _next) => {
  console.error("[Error]", err);
  res.status(err.status || 500).json({
    ok: false,
    error: err.message || "Internal server error",
  });
});

// ===== Startup =====
const PORT = Number(process.env.PORT || process.env.X402_PORT || 4021);

(async () => {
  try {
    // Initialize store before starting server
    await splits.init();
    console.log(`[Store] Initialized with ${splits.size()} cached splits`);

    app.listen(PORT, () => {
      console.log(`
🚀 x402 Micropayment Server
━━━━━━━━━━━━━━━━━━━━━━━━━━
  Port:     ${PORT}
  Network:  ${X402_NETWORK}
  USDC:     ${USDC_ADDRESS}
  CORS:     ${ALLOW_ORIGINS.join(", ")}
  Splits:   ${splits.size()} loaded
━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });
  } catch (err) {
    console.error("[Fatal] Failed to initialize server:", err);
    process.exit(1);
  }
})();