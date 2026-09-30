import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // ESPN hosts every team logo and athlete headshot we show.
    remotePatterns: [{ protocol: "https", hostname: "a.espncdn.com", pathname: "/i/**" }],
  },
  async headers() {
    return [
      {
        // Only the push worker: it must never be served stale (a cached worker cannot be fixed
        // until the cache expires) and never sniffed into another type. The CSP stops it loading
        // anything but same-origin scripts. No site-wide headers are set here on purpose.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
