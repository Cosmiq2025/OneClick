import express from "express";
import cors from "cors";
import { paymentMiddleware } from "x402-express";

const app = express();

// trust proxy so req.protocol becomes https behind Render/CF
app.set("trust proxy", 1);

// ---- CORS (allow your Lovable origin + X-PAYMENT header) ----
const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://one-click-warp.lovable.app";
const corsOptions = {
  origin: CORS_ORIGIN,
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["content-type", "accept", "x-payment"],
  credentials: false,
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());

// ---- ENV ----
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS || "";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const X402_NETWORK = process.env.X402_NETWORK || "base-sepolia";
if (!RECEIVER_ADDRESS) throw new Error("RECEIVER_ADDRESS is not set");

// ---- HTML ESCAPING (XSS Protection) ----
const escapeHtml = (str) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(str).replace(/[&<>"']/g, (m) => map[m]);
};

// ---- INPUT VALIDATION ----
const sanitizeInput = (value, maxLength, defaultValue = "") => {
  if (!value || typeof value !== "string") return defaultValue;
  return escapeHtml(value.trim().slice(0, maxLength));
};

const isValidUrl = (str) => {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// ---- LOGGING ----
const log = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ timestamp, level, message, ...meta }));
};

// ---- PAYWALL FIRST ----
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

// ---- GUARD (belt & suspenders) ----
const requirePaid = (req, res, next) => {
  if (!req.headers["x-payment"]) {
    log("warn", "Payment required", { path: req.path, ip: req.ip });
    return res.status(402).json({
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts: [{
        scheme: "exact",
        network: X402_NETWORK,
        resource: `${req.protocol}://${req.get("host")}${req.path}`,
        description: "Unlock premium post",
        mimeType: "text/html",
      }],
    });
  }
  next();
};

// ---- CONTENT AFTER PAYMENT ----
app.get("/api/unlock", requirePaid, (req, res) => {
  try {
    const q = req.query ?? {};
    
    // Sanitize and validate inputs
    const title = sanitizeInput(q.title, 200, "Unlocked Post");
    const by = sanitizeInput(q.by, 120);
    const imgUrl = String(q.img || "").slice(0, 2048);
    const img = imgUrl && isValidUrl(imgUrl) ? escapeHtml(imgUrl) : "";
    const body = sanitizeInput(q.body, 8000, "🎉 Payment confirmed.");
    
    log("info", "Content unlocked", { title, hasImage: !!img });

    res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{font:16px/1.6 system-ui;margin:32px;background:#fafafa}
  .card{max-width:760px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,.04);background:#fff}
  h1{font-size:28px;margin:0 0 6px;color:#222}
  img{max-width:100%;height:auto;border-radius:12px;margin:12px 0}
  .by{color:#666;font-size:13px;margin-bottom:16px}
  .content{color:#333;line-height:1.8}
</style>
</head>
<body>
<div class="card">
  <h1>${title}</h1>
  ${by ? `<div class="by">by ${by}</div>` : ""}
  ${img ? `<img src="${img}" alt="Post image" loading="lazy">` : ""}
  <div class="content">${body.replace(/\n/g, "<br>")}</div>
</div>
</body>
</html>`);
  } catch (error) {
    log("error", "Error serving unlocked content", { error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// optional: sample landing
app.get("/", (_req, res) =>
  res.redirect("/api/unlock?title=Demo&body=Pay%20%E2%86%92%20unlock%20%E2%86%92%20post")
);

// ---- ERROR HANDLING ----
app.use((err, req, res, next) => {
  log("error", "Unhandled error", { error: err.message, stack: err.stack, path: req.path });
  res.status(500).json({ error: "Something went wrong" });
});

// Simple browser tester: builds /api/unlock URL and uses x402 to pay+render
app.get("/preview", (req, res) => {
  const FAC = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
  const NET = process.env.X402_NETWORK || "base-sepolia";
  const preset = {
    title: (req.query.title || "Demo").toString(),
    by:    (req.query.by    || "").toString(),
    img:   (req.query.img   || "").toString(),
    body:  (req.query.body  || "Hello world").toString(),
  };
  res.type("html").send(`<!doctype html>
<meta charset="utf-8"><title>Preview & Unlock</title>
<style>
  body{font:16px/1.6 system-ui;margin:32px;max-width:860px}
  input,textarea{width:100%;padding:10px;border:1px solid #ddd;border-radius:10px}
  button{padding:10px 14px;border:0;border-radius:10px;background:#111;color:#fff;cursor:pointer}
  .row{display:grid;gap:10px;margin:10px 0}
  iframe{width:100%;height:70vh;border:1px solid #eee;border-radius:12px;margin-top:12px}
  .muted{color:#666;font-size:13px}
</style>
<h1>Preview & Unlock</h1>
<p class="muted">Network: ${NET}</p>
<div class="row">
  <label>Title <input id="t" value="${preset.title.replace(/"/g,'&quot;')}"></label>
  <label>Author (optional) <input id="by" value="${preset.by.replace(/"/g,'&quot;')}"></label>
  <label>Cover image URL (optional) <input id="img" value="${preset.img.replace(/"/g,'&quot;')}"></label>
  <label>Body <textarea id="b" rows="6">${preset.body.replace(/</g,"&lt;")}</textarea></label>
</div>
<div class="row">
  <button id="go">Preview & Unlock</button>
  <span id="msg" class="muted"></span>
</div>
<iframe id="frame" sandbox="allow-same-origin"></iframe>
<script type="module">
  import { wrapFetchWithPayment } from "https://esm.sh/x402-fetch@0.1.0";
  const FAC="${FAC}", NET="${NET}";
  const payFetch = wrapFetchWithPayment(fetch, { facilitator: FAC, network: NET });
  const $=id=>document.getElementById(id);
  const t=$("t"), by=$("by"), img=$("img"), b=$("b"), msg=$("msg"), frame=$("frame");
  function build(){
    const p=new URLSearchParams();
    if(t.value) p.set("title", t.value.slice(0,200));
    if(by.value) p.set("by", by.value.slice(0,120));
    if(img.value) p.set("img", img.value.slice(0,2048));
    if(b.value) p.set("body", b.value.slice(0,8000));
    return "/api/unlock?" + p.toString();
  }
  $("go").onclick = async () => {
    msg.textContent = "Requesting…";
    try {
      const r = await payFetch(build(), { method:"GET", headers:[["accept","text/html"]] });
      if (!r.ok) throw new Error(await r.text().catch(()=> "HTTP "+r.status));
      frame.srcdoc = await r.text();
      msg.textContent = "Unlocked ✅";
    } catch(e){ msg.textContent = "Failed: " + (e?.message || e); }
  };
</script>`);
});


// 404 handler
app.use((req, res) => {
  log("warn", "Route not found", { path: req.path, method: req.method });
  res.status(404).json({ error: "Not found" });
});

// ---- LISTEN ----
const PORT = Number(process.env.PORT || process.env.X402_PORT || 4021);
app.listen(PORT, () => {
  log("info", `Server started on port ${PORT}`, { 
    network: X402_NETWORK, 
    corsOrigin: CORS_ORIGIN 
  });
});