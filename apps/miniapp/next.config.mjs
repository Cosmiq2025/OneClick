// apps/miniapp/next.config.mjs (ESM)
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE
  ?? (process.env.NODE_ENV === "production"
        ? "https://oneclick-sm83.onrender.com"   // Render in prod
        : "http://localhost:4021");              // Local in dev

const nextConfig = {
  async rewrites() {
    return [
      // proxy /api/* to your pay server (dev → localhost, prod → Render)
      { source: "/api/:path*", destination: `${API_BASE}/api/:path*` },
    ];
  },
};

export default nextConfig;
