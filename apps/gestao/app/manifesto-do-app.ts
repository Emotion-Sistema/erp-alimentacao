import type { Metadata } from "next";

/** Cada aplicativo tem o seu atalho de instalação (RC-03). */
export function metadadosDoApp(codigo: string): Metadata {
  return { manifest: `/aplicativo/${codigo}/manifest.webmanifest` };
}
