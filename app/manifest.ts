import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CoSpread POS",
    short_name: "CoSpread POS",
    description: "Offline-first point of sale for CoSpread businesses.",
    start_url: "/pos",
    display: "standalone",
    background_color: "#f5f5f5",
    theme_color: "#ffffff",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
