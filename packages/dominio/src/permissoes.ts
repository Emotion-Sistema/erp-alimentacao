/**
 * Cargos e ações (RC-12). A permissão é SEMPRE conferida no servidor, em cada ação.
 * Esta é a base da E02; a matriz completa de cada cargo é a etapa E03.
 * Regra de ouro: o que não está listado para o cargo é recusado.
 */
export const CARGOS = [
  "dono",
  "administrador",
  "gerente_geral",
  "financeiro",
  "supervisor",
  "atendente",
  "caixa",
  "cozinheira",
  "auxiliar_cozinha",
  "motoboy",
  "contador",
] as const;
export type Cargo = (typeof CARGOS)[number];

export const ACOES = [
  "usuarios.ver",
  "usuarios.gerenciar",
  "auditoria.ver",
  "financeiro.ver",
] as const;
export type Acao = (typeof ACOES)[number];

const TUDO: readonly Acao[] = ACOES;

export const PERMISSOES: Readonly<Record<Cargo, readonly Acao[]>> = {
  dono: TUDO,
  administrador: TUDO,
  // Gerente geral: tudo, exceto financeiro (RC-12, decisão 0008).
  gerente_geral: ["usuarios.ver", "usuarios.gerenciar", "auditoria.ver"],
  financeiro: ["financeiro.ver"],
  supervisor: ["usuarios.ver"],
  atendente: [],
  caixa: [], // caixa nunca acessa o financeiro
  cozinheira: [],
  auxiliar_cozinha: [],
  motoboy: [],
  contador: [],
};

export function ehCargo(v: string): v is Cargo {
  return (CARGOS as readonly string[]).includes(v);
}

/** Verdadeiro se algum dos cargos da pessoa permite a ação. Cargo desconhecido não dá nada. */
export function pode(cargos: readonly string[], acao: Acao): boolean {
  return cargos.some((c) => ehCargo(c) && PERMISSOES[c].includes(acao));
}
