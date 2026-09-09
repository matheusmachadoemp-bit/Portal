import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Portal Grupo Nord",
    short_name: "Portal Nord",
    description: "Portal administrativo do Grupo Nord",
    start_url: "/portal/inicio",
    scope: "/",
    display: "standalone",
    background_color: "#05070a",
    theme_color: "#05070a",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
