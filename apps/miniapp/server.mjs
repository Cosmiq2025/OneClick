import express from "express";
import cors from "cors";
import { paymentMiddleware } from "x402-express";

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

// === ENV ===
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS || "";
const FACILITATOR_URL  = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const X402_NETWORK     = process.env.X402_NETWORK || "base-sepolia";
if (!RECEIVER_ADDRESS) throw new Error("RECEIVER_ADDRESS is not set");

// === ПЕЙВОЛЛ ДОЛЖЕН ИДТИ ПЕРЕД РОУТАМИ ===
app.use(paymentMiddleware(
  RECEIVER_ADDRESS,
  {
    "GET /api/unlock": {
      price: "$1.00",
      network: X402_NETWORK,
      config: { description: "Unlock premium post", mimeType: "text/html" },
    },
  },
  { url: FACILITATOR_URL }
));

// === КОНТЕНТ ПОСЛЕ ОПЛАТЫ ===
app.get("/api/unlock", (req, res) => {
  const q = req.query ?? {};
  const esc = s => String(s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const title = esc((q.title ?? "Unlocked Post").toString().slice(0,200));
  const by    = esc((q.by    ?? "").toString().slice(0,120));
  const img   = (q.img ? esc(q.img.toString()) : "");
  const body  = esc((q.body  ?? "🎉 Payment confirmed.").toString().slice(0,8000)).replace(/\n/g,"<br>");

  res.type("html").send(`<!doctype html><meta charset="utf-8"><title>${title}</title>
  <style>body{font:16px/1.6 system-ui;margin:32px;background:#fafafa}
  .card{max-width:760px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,.04);background:#fff}
  h1{font-size:28px;margin:0 0 6px;color:#222}img{max-width:100%;height:auto;border-radius:12px;margin:12px 0}
  .by{color:#666;font-size:13px;margin-bottom:16px}.content{line-height:1.8}</style>
  <div class="card"><h1>${title}</h1>${by?`<div class="by">by ${by}</div>`:""}${img?`<img src="${img}" alt="">`:""}<div class="content">${body}</div></div>`);
});

// удобный редирект
app.get("/", (_req, res) => res.redirect("/api/unlock?title=Demo&body=Pay%20%E2%86%92%20unlock"));

const PORT = Number(process.env.PORT || process.env.X402_PORT || 4021);
app.listen(PORT, () => console.log(`listening on :${PORT}`));
