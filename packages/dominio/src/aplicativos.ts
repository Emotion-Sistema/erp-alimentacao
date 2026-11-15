/**
 * Aplicativos por função (RC-03, decisão 0012). Cada aplicativo é uma "casca": nome,
 * endereço, tela inicial e menu próprios, sobre o mesmo núcleo.
 *
 * Isto só decide o que APARECE. Quem decide se a ação acontece é sempre o servidor,
 * em cada rota, com `exigir(acao)`. Um item de menu nunca dá permissão.
 */
import { pode, type Acao } from "./permissoes";

export type ItemDoMenu = {
  /** Endereço da tela (dentro do aplicativo). */
  caminho: string;
  texto: string;
  /** Ação que o cargo ativo precisa ter para ver o item. */
  acao: Acao;
  /** Etapa em que a tela de verdade chega (enquanto isso, a tela diz isso). */
  etapa?: string;
};

export type Aplicativo = {
  codigo: string;
  nome: string;
  /** Endereço raiz do aplicativo (também é o escopo do atalho de instalação). */
  caminho: string;
  descricao: string;
  /** Para que serve o aparelho onde ele mais roda. */
  aparelho: "celular" | "tablet" | "computador";
  itens: readonly ItemDoMenu[];
};

export const APLICATIVOS: readonly Aplicativo[] = [
  {
    codigo: "caixa",
    nome: "Caixa",
    caminho: "/caixa",
    descricao: "Abrir e fechar o caixa, receber, mapa de mesas e motoboys.",
    aparelho: "computador",
    itens: [
      { caminho: "/caixa", texto: "Início do turno", acao: "caixa.operar", etapa: "E17" },
      { caminho: "/caixa/mesas", texto: "Mapa de mesas", acao: "pedidos.ver_todos", etapa: "E17" },
      { caminho: "/caixa/receber", texto: "Receber", acao: "pagamento.marcar_pago", etapa: "E18" },
      { caminho: "/caixa/motoboys", texto: "Motoboys", acao: "motoboys.organizar", etapa: "E18" },
    ],
  },
  {
    codigo: "atendimento",
    nome: "Atendimento",
    caminho: "/atendimento",
    descricao: "Abrir mesa, lançar e alterar pedidos, avisos de pronto.",
    aparelho: "celular",
    itens: [
      { caminho: "/atendimento", texto: "Mesas", acao: "pedidos.lancar", etapa: "E13" },
      { caminho: "/atendimento/pedidos", texto: "Meus pedidos", acao: "pedidos.ver_proprios", etapa: "E13" },
    ],
  },
  {
    codigo: "producao",
    nome: "Produção",
    caminho: "/producao",
    descricao: "Telas da cozinha e da cafeteria: fila, preparo e pronto.",
    aparelho: "tablet",
    itens: [
      { caminho: "/producao", texto: "Visão geral", acao: "producao.ver", etapa: "E14" },
    ],
  },
  {
    codigo: "estoque",
    nome: "Estoque e compras",
    caminho: "/estoque",
    descricao: "Semáforo do estoque, entradas, contagem, compras e custos.",
    aparelho: "celular",
    itens: [
      { caminho: "/estoque", texto: "Cozinha", acao: "estoque.cozinha", etapa: "E09" },
      { caminho: "/estoque/salao", texto: "Salão", acao: "estoque.salao", etapa: "E09" },
      { caminho: "/estoque/compras", texto: "Compras do estoque", acao: "compras.gerenciar", etapa: "E10" },
      { caminho: "/estoque/materiais", texto: "Compras de materiais", acao: "compras.materiais", etapa: "E10" },
      { caminho: "/estoque/custos", texto: "Custos da área", acao: "custos.ver", etapa: "E08" },
    ],
  },
  {
    codigo: "gestao",
    nome: "Gestão",
    caminho: "/gestao",
    descricao: "Funcionários, cargos, auditoria e aparelhos.",
    aparelho: "computador",
    itens: [
      { caminho: "/gestao", texto: "Resumo", acao: "usuarios.ver" },
      { caminho: "/funcionarios", texto: "Funcionários", acao: "usuarios.ver" },
      { caminho: "/auditoria", texto: "Auditoria", acao: "auditoria.ver" },
      { caminho: "/comunicados", texto: "Comunicados", acao: "comunicados.enviar" },
      { caminho: "/turnos", texto: "Turnos", acao: "horarios.gerenciar" },
      { caminho: "/estacoes", texto: "Estações", acao: "estacoes.ver" },
    ],
  },
  {
    codigo: "cadastros",
    nome: "Cadastros",
    caminho: "/cadastros",
    descricao: "Ingredientes, unidades de compra e fornecedores.",
    aparelho: "computador",
    itens: [
      { caminho: "/cadastros", texto: "Ingredientes", acao: "cadastros.ver" },
      { caminho: "/cadastros/embalagens", texto: "Embalagens", acao: "cadastros.ver" },
      { caminho: "/cadastros/fornecedores", texto: "Fornecedores", acao: "cadastros.ver" },
    ],
  },
  {
    codigo: "financeiro",
    nome: "Financeiro",
    caminho: "/financeiro",
    descricao: "Contas, faturamento, fechamentos do caixa e contabilidade.",
    aparelho: "computador",
    itens: [
      { caminho: "/financeiro", texto: "Contas", acao: "financeiro.ver", etapa: "E21" },
      { caminho: "/financeiro/faturamento", texto: "Faturamento", acao: "faturamento.ver", etapa: "E21" },
      { caminho: "/financeiro/fechamentos", texto: "Fechamentos do caixa", acao: "caixa.fechamentos_ver", etapa: "E21" },
      { caminho: "/financeiro/contabil", texto: "Pacote contábil", acao: "contabil.ver", etapa: "E21" },
    ],
  },
  {
    codigo: "entregas",
    nome: "Entregas",
    caminho: "/entregas",
    descricao: "Entregas atribuídas a você, com o código de confirmação.",
    aparelho: "celular",
    itens: [{ caminho: "/entregas", texto: "Minhas entregas", acao: "entregas.proprias", etapa: "E29" }],
  },
];

/** Itens do aplicativo que o cargo ativo pode ver. */
export function itensVisiveis(app: Aplicativo, cargoAtivo: string | null | undefined): ItemDoMenu[] {
  return app.itens.filter((i) => pode(cargoAtivo, i.acao));
}

/** O aplicativo aparece se o cargo ativo pode ver pelo menos um item dele. */
export function podeAbrir(app: Aplicativo, cargoAtivo: string | null | undefined): boolean {
  return itensVisiveis(app, cargoAtivo).length > 0;
}

export function aplicativosDoCargo(cargoAtivo: string | null | undefined): Aplicativo[] {
  return APLICATIVOS.filter((a) => podeAbrir(a, cargoAtivo));
}

export function aplicativoPorCodigo(codigo: string): Aplicativo {
  const app = APLICATIVOS.find((a) => a.codigo === codigo);
  if (!app) throw new Error(`Aplicativo desconhecido: ${codigo}`);
  return app;
}

/** Item que corresponde exatamente a um endereço (para a tela conferir a própria ação). */
export function itemDoCaminho(app: Aplicativo, caminho: string): ItemDoMenu | undefined {
  return app.itens.find((i) => i.caminho === caminho);
}
