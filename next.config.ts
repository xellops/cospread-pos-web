import type { NextConfig } from "next";

/**
 * Same-origin proxy to the CoSpread API, so the browser needs no CORS allowance.
 * Point API_PROXY_TARGET at a local API (http://localhost:7000) during development.
 */
const apiTarget = (process.env.API_PROXY_TARGET || "https://api.dev.cospread.com").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiTarget}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
