import type { MetadataRoute } from "next";
import { CORES_DO_TEMA_CLARO } from "@erp/interface";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Casa Exemplo - Pedidos online",
    short_name: "Casa Exemplo",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "pt-BR",
    background_color: CORES_DO_TEMA_CLARO.fundo,
    theme_color: CORES_DO_TEMA_CLARO.primaria,
    icons: [{ src: "/icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
