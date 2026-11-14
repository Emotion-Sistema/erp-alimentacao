import { aplicativoPorCodigo, itensVisiveis, type Aplicativo } from "@erp/dominio";

/** Para onde o ladrilho de um aplicativo leva: a primeira tela que o cargo ativo pode ver. */
export function entradaDoAplicativo(app: Aplicativo, cargoAtivo: string | null | undefined): string {
  return itensVisiveis(app, cargoAtivo)[0]?.caminho ?? app.caminho;
}

export { aplicativoPorCodigo };
