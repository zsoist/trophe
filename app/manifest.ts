import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "app.trophe.pwa",
    name: "Trophē — Precision Nutrition",
    short_name: "Trophē",
    description: "One habit. Two weeks. Transform. AI-powered nutrition coaching for athletes.",
    start_url: "/dashboard?source=pwa",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    theme_color: "#0A0A0A",
    background_color: "#0A0A0A",
    orientation: "portrait-primary",
    categories: ["health", "fitness", "food"],
    lang: "en",
    dir: "ltr",
    scope: "/",
    prefer_related_applications: false,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-monochrome.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "monochrome",
      },
    ],
    shortcuts: [
      {
        name: "Log Food",
        short_name: "Log",
        description: "Quickly log what you ate",
        url: "/dashboard/log?source=pwa-shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Today",
        short_name: "Today",
        description: "View today's nutrition summary",
        url: "/dashboard?source=pwa-shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
