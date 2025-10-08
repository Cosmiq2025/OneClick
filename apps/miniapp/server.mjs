// apps/miniapp/server.mjs
import express from "express";
import cors from "cors";
import { paymentMiddleware } from "x402-express";

const app = express();
app.set("trust proxy", 1);

// --- CORS: allow Lovable + X-PAYMENT header ---
const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://one-click-warp.lovable.app";
app.use(cors({
  origin: CORS_ORIGIN,                 // use "*" temporarily if testing from many origins
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["content-type", "accept", "x-payment"],
  credentials: false,
  maxAge: 86400,
}));
app.options("*", cors());              // preflight
app.use(express.json());

// --- ENV ---
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS || "";
const FACILITATOR_URL  = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const X402_NETWORK     = process.env.X402_NETWORK || "base-sepolia";
if (!RECEIVER_ADDRESS) throw new Error("RECEIVER_ADDRESS is not set");

// USDC (Base Sepolia) — override via env if you need
const USDC_BASE_SEPOLIA =
  process.env.USDC_BASE_SEPOLIA || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// --- helpers ---
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (m) =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])
  );

// --- HARD GUARD: return 402 with dynamic challenge unless X-PAYMENT is present ---
function requirePaid(req, res, next) {
  if (req.headers["x-payment"]) return next();
  const q = req.query ?? {};
  // price in USD, default $1.00; clamp to sane range 0.01..100
  let priceUsd = Number(q.price ?? "1");
  if (!Number.isFinite(priceUsd)) priceUsd = 1;
  priceUsd = Math.min(100, Math.max(0.01, priceUsd));

  // USDC has 6 decimals on Base Sepolia
  const units = Math.round(priceUsd * 1e6);

  // allow a small range (±20%) so wallets/facilitators have room
  const minAmountRequired = String(Math.max(1, Math.floor(units * 0.98)));
  const maxAmountRequired = String(Math.ceil(units * 1.20)));

  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  return res.status(402).json({
    x402Version: 1,
    error: "X-PAYMENT header is required",
    accepts: [{
      scheme: "exact",
      network: X402_NETWORK,
      resource: fullUrl,
      description: `Unlock premium post ($${priceUsd.toFixed(2)})`,
      mimeType: "text/html",
      payTo: RECEIVER_ADDRESS,
      asset: USDC_BASE_SEPOLIA,
      minAmountRequired,
      maxAmountRequired,
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    }],
  });
}

// --- Paywall BEFORE routes (keep it; library’s own checks) ---
app.use(paymentMiddleware(
  RECEIVER_ADDRESS,
  {
    "GET /api/unlock": {
      price: "$1.00", // informational; our guard enforces actual min/max
      network: X402_NETWORK,
      config: { description: "Unlock premium post", mimeType: "text/html" },
    },
  },
  { url: FACILITATOR_URL }
));

// --- Content AFTER payment (guarded) ---
app.get("/api/unlock", requirePaid, (req, res) => {
  const q = req.query ?? {};
  const title = esc((q.title ?? "Unlocked Post").toString().slice(0,200));
  const by    = esc((q.by    ?? "").toString().slice(0,120));
  const img   = (q.img ? esc(q.img.toString()).slice(0,2048) : "");
  const body  = esc((q.body  ?? "🎉 Payment confirmed.").toString().slice(0,8000))
                  .replace(/\n/g,"<br>");

  res.set("Cache-Control","no-store").type("html").send(`<!doctype html>
<meta charset="utf-8"><title>${title}</title>
<style>
  body{font:16px/1.6 system-ui;margin:32px;background:#fafafa}
  .card{max-width:760px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,.04);background:#fff}
  h1{font-size:28px;margin:0 0 6px;color:#222}
  img{max-width:100%;height:auto;border-radius:12px;margin:12px 0}
  .by{color:#666;font-size:13px;margin-bottom:16px}
  .content{line-height:1.8}
</style>
<div class="card">
  <h1>${title}</h1>
  ${by ? `<div class="by">by ${by}</div>` : ""}
  ${img ? `<img src="${img}" alt="">` : ""}
  <div class="content">${body}</div>
</div>`);
});

// convenience
app.get("/", (_req, res) =>
  res.redirect("/api/unlock?title=Demo&body=Pay%20%E2%86%92%20unlock")
);

const PORT = Number(process.env.PORT || process.env.X402_PORT || 4021);
app.listen(PORT, () => console.log(`listening on :${PORT}`));
