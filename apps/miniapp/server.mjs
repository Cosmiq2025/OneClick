import express from "express";
import cors from "cors";
import { paymentMiddleware } from "x402-express";

const app = express();
app.use(cors());
app.use(express.json());

const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS || "";
const FACILITATOR_URL  = process.env.FACILITATOR_URL || "https://x402.org/facilitator";

if (!RECEIVER_ADDRESS) {
  throw new Error("RECEIVER_ADDRESS is not set");
}

// attach x402 to the route
app.use(paymentMiddleware(
  RECEIVER_ADDRESS,
  {
    "GET /api/unlock": {
      price: "$1.00",
      network: "base-sepolia",
      config: {
        description: "Unlock premium post content",
        mimeType: "application/json",
      },
    },
  },
  { url: FACILITATOR_URL }
));

// content AFTER successful payment
app.get("/api/unlock", (req, res) => {
  res.json({ ok: true, content: "🎉 Unlocked content" });
});

const PORT = process.env.X402_PORT || 4021;
app.listen(PORT, () => {
  console.log(`x402 server listening on http://localhost:${PORT}`);
});
