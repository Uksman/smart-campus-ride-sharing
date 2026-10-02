import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CampusRide — Smart campus mobility",
    short_name: "CampusRide",
    description: "A trusted way for University of Uyo students and staff to share campus rides.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f8f3",
    theme_color: "#143c34",
    categories: ["travel", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
