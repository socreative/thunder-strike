import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thunder Strike",
    short_name: "Thunder Strike",
    description: "An isometric attack helicopter game in the spirit of Desert Strike.",
    start_url: "/",
    // iOS treats anything above standalone as standalone and ignores the
    // orientation hint; Android honours both.
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#0b0e0c",
    theme_color: "#0b0e0c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
