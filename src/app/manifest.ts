import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Skill Compass", short_name: "Skill Compass", description: "Personal engineering growth dashboard", start_url: "/today", scope: "/", display: "standalone", background_color: "#f4f7f5", theme_color: "#176f64", icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ] };
}
