import type { MetadataRoute } from "next";

// Lets people add Unchore to the home screen (needed for notifications on iPhone).
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Unchore", short_name: "Unchore", start_url: "/app", display: "standalone",
    // Phone share menu → a new chat with the shared text (lib/share-in.ts · Android Chrome, once on the home screen)
    share_target: { action: "/app", method: "GET", params: { title: "title", text: "text", url: "url" } }, background_color: "#f7f6f2", theme_color: "#f7f6f2", icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ] };
}
