import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // ESPN hosts every team logo and athlete headshot we show.
    remotePatterns: [{ protocol: "https", hostname: "a.espncdn.com", pathname: "/i/**" }],
  },
};

export default nextConfig;
