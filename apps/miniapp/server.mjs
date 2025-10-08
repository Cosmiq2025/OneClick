import express from "express";
import cors from "cors";
import { paymentMiddleware } from "x402-express";

const app = express();
app.use(cors());                // allow GET from anywhere (fine for share links)
app.use(express.json());

// ---- env ----
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS || "";
const FACILITATOR_URL  = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const X402_NETWORK     = process.env.X402_NETWORK || "base-sepolia";
if (!RECEIVER_ADDRESS) throw new Error("RECEIVER_ADDRESS is not set");

// ---- PAYWALL: must come BEFORE your route handler ----
app.use(paymentMiddleware(
  RECEIVER_ADDRESS,
  {
    "GET /api/unlock": {
      price: "$1.00",
      network: X402_NETWORK,
      // return HTML so the browser shows the post after payment
      config: { description: "Unlock premium post", mimeType: "text/html" },
    },
  },
  { url: FACILITATOR_URL }
));

// ---- CONTENT after successful payment ----
app.get("/api/unlock", (req, res) => {
  const q = req.query ?? {};
  const title = String(q.title ?? "Unlocked Post").slice(0, 200);
  const by    = String(q.by ?? "").slice(0, 120);
  const img   = String(q.img ?? "").slice(0, 2048);
  const body  = String(q.body ?? "🎉 Payment confirmed.").slice(0, 8000);

  res.type("html").send(`<!doctype html>
<meta charset="utf-8"><title>${title}</title>
<style>
  body{font:16px/1.6 system-ui;margin:32px}
  .card{max-width:760px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,.04)}
  h1{font-size:28px;margin:0 0 6px} img{max-width:100%;border-radius:12px;margin:12px 0}
  .by{color:#666;font-size:13px}
</style>
<div class="card">
  <h1>${title}</h1>
  ${by ? `<div class="by">by ${by}</div>` : ""}
  ${img ? `<img src="${img}" alt="">` : ""}
  <div>${body.replace(/\n/g,"<br/>")}</div>
</div>`);
});

// optional: redirect root -> sample link
app.get("/", (_req, res) => {
  res.redirect("/api/unlock?title=Demo&body=Pay%20%E2%86%92%20unlock%20%E2%86%92%20post");
});

// ---- listen (Render uses PORT) ----
const PORT = Number(process.env.PORT || process.env.X402_PORT || 4021);
app.listen(PORT, () => console.log(`listening on :${PORT}`));
