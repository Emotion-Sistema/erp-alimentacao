import type { MetadataRoute } from "next";
import { CORES_DO_TEMA_CLARO } from "@erp/interface";

/** Atalho de instalação do delivery (marca E-MOTION, decisão 0019). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "E-MOTION: pedidos online",
    short_name: "E-MOTION",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "pt-BR",
    background_color: CORES_DO_TEMA_CLARO.fundo,
    theme_color: CORES_DO_TEMA_CLARO.fundo,
    icons: [
      {
        src: "/marca/icone-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/marca/icone-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/marca/icone-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
