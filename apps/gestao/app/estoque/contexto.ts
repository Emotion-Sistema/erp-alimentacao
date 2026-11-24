/**
 * O que as telas do estoque precisam saber da pessoa e das listas do domínio, montado no SERVIDOR
 * (a página) e passado pronto à tela: a tela nunca importa `@erp/dominio` raiz. Só para mostrar e
 * esconder botões; o servidor confere a permissão de novo em cada chamada.
 */
import {
  AREAS_ESTOQUE,
  CAMPOS_DO_SALDO_INICIAL,
  MOTIVOS_DE_BLOQUEIO,
  MOTIVOS_DE_PERDA,
  NOME_DA_AREA,
  NOME_DO_MOTIVO_DE_BLOQUEIO,
  NOME_DO_MOTIVO_DE_PERDA,
  areasDoAtor,
  pode,
  type Ator,
} from "@erp/dominio";

export type Opcao = { valor: string; texto: string };

export type ContextoDoEstoque = {
  /** Áreas que a pessoa cuida (cargo ativo). */
  areas: Opcao[];
  /** Nome de todas as áreas (para mostrar o que vier do servidor). */
  nomeDaArea: Record<string, string>;
  podeVerCusto: boolean;
  podeDesfazer: boolean;
  /** Cuida de todas as áreas (só então a lista de entradas traz valores). */
  todasAsAreas: boolean;
  motivosDePerda: Opcao[];
  motivosDeBloqueio: Opcao[];
  /** Colunas da planilha de saldo inicial (para o modelo e a ajuda). */
  camposDoSaldo: { campo: string; rotulo: string; obrigatorio: boolean; explicacao: string; exemplo: string }[];
};

export function contextoDoEstoque(ator: Ator): ContextoDoEstoque {
  const minhas = areasDoAtor(ator);
  return {
    areas: minhas.map((a) => ({ valor: a, texto: NOME_DA_AREA[a] })),
    nomeDaArea: { ...NOME_DA_AREA },
    podeVerCusto: pode(ator.cargoAtivo, "custos.ver"),
    podeDesfazer: pode(ator.cargoAtivo, "estoque.desfazer"),
    todasAsAreas: minhas.length === AREAS_ESTOQUE.length,
    motivosDePerda: MOTIVOS_DE_PERDA.map((m) => ({ valor: m, texto: NOME_DO_MOTIVO_DE_PERDA[m] })),
    motivosDeBloqueio: MOTIVOS_DE_BLOQUEIO.map((m) => ({ valor: m, texto: NOME_DO_MOTIVO_DE_BLOQUEIO[m] })),
    camposDoSaldo: CAMPOS_DO_SALDO_INICIAL.map((c) => ({ campo: c.campo, rotulo: c.rotulo, obrigatorio: c.obrigatorio, explicacao: c.explicacao, exemplo: c.exemplo })),
  };
}

/** Áreas de cada tela do menu: a Cozinha e o Salão (bebidas, cafeteria e sorvete). */
export const AREAS_DA_COZINHA = ["cozinha"] as const;
export const AREAS_DO_SALAO = ["bebidas_salao", "cafeteria", "sorvete"] as const;
