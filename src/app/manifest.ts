import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cincy's All-Sports League",
    short_name: "Cincy's League",
    description: "Live standings for a 20-team, 11-sport family fantasy league.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    // The manifest is read by the OS, outside CSS, so these mirror --canvas and --brand in globals.css.
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
