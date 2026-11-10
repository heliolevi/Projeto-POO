import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bike Ilha Club",
    short_name: "Bike Ilha Club",
    description: "Aluguel de bicicletas em São Luís (MA)",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF8FF",
    theme_color: "#005F49",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
