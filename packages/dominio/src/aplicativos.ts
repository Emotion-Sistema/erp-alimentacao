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
  /** Ícone na barra de baixo do celular (desenhos em apps/gestao/app/icones-do-menu.ts). */
  icone: IconeDoMenu;
  /** Nome curto na barra de baixo do celular, quando o nome inteiro não cabe. */
  curto?: string;
};

/** Ícones da barra de baixo do celular (decisão 0019, adendo de 18/11/2026). */
export type IconeDoMenu =
  | "relogio"
  | "mesa"
  | "dinheiro"
  | "moto"
  | "lista"
  | "chama"
  | "caixa"
  | "salao"
  | "carrinho"
  | "ferramenta"
  | "moeda"
  | "painel"
  | "pessoas"
  | "escudo"
  | "megafone"
  | "turno"
  | "tablet"
  | "folha"
  | "pacote"
  | "caminhao"
  | "xicara"
  | "etiqueta"
  | "calendario"
  | "grafico"
  | "recibo"
  | "documento"
  | "entrega"
  | "adicional";

/** Ação principal do aplicativo: o botão redondo grande no meio da barra de baixo, no celular. */
export type AcaoPrincipal = { texto: string; caminho: string; acao: Acao };

export type Aplicativo = {
  codigo: string;
  nome: string;
  /** Endereço raiz do aplicativo (também é o escopo do atalho de instalação). */
  caminho: string;
  descricao: string;
  /** Para que serve o aparelho onde ele mais roda. */
  aparelho: "celular" | "tablet" | "computador";
  itens: readonly ItemDoMenu[];
  /**
   * Celular: os itens que ficam à vista na barra de baixo, na ordem (no máximo 4; o resto vai
   * para "Mais"). Sem isto, valem os primeiros da lista.
   */
  naBarra?: readonly string[];
  /** Celular: botão grande no meio da barra (pedido do responsável: "B no atendimento"). */
  principal?: AcaoPrincipal;
};

export const APLICATIVOS: readonly Aplicativo[] = [
  {
    codigo: "caixa",
    nome: "Caixa",
    caminho: "/caixa",
    descricao: "Abrir e fechar o caixa, receber, mapa de mesas e motoboys.",
    aparelho: "computador",
    itens: [
      {
        caminho: "/caixa",
        texto: "Início do turno",
        acao: "caixa.operar",
        etapa: "E17",
        icone: "relogio",
        curto: "Turno",
      },
      {
        caminho: "/caixa/mesas",
        texto: "Mapa de mesas",
        acao: "pedidos.ver_todos",
        etapa: "E17",
        icone: "mesa",
        curto: "Mesas",
      },
      {
        caminho: "/caixa/receber",
        texto: "Receber",
        acao: "pagamento.marcar_pago",
        etapa: "E18",
        icone: "dinheiro",
      },
      {
        caminho: "/caixa/motoboys",
        texto: "Motoboys",
        acao: "motoboys.organizar",
        etapa: "E18",
        icone: "moto",
      },
    ],
  },
  {
    codigo: "atendimento",
    nome: "Atendimento",
    caminho: "/atendimento",
    descricao: "Abrir mesa, lançar e alterar pedidos, avisos de pronto.",
    aparelho: "celular",
    itens: [
      {
        caminho: "/atendimento",
        texto: "Mesas",
        acao: "pedidos.lancar",
        etapa: "E13",
        icone: "mesa",
      },
      {
        caminho: "/atendimento/pedidos",
        texto: "Meus pedidos",
        acao: "pedidos.ver_proprios",
        etapa: "E13",
        icone: "lista",
      },
    ],
    // Por enquanto leva às mesas (o pedido começa escolhendo a mesa); o lançamento chega na E13.
    principal: {
      texto: "Novo pedido",
      caminho: "/atendimento",
      acao: "pedidos.lancar",
    },
  },
  {
    codigo: "producao",
    nome: "Produção",
    caminho: "/producao",
    descricao: "Telas da cozinha e da cafeteria: fila, preparo e pronto.",
    aparelho: "tablet",
    itens: [
      {
        caminho: "/producao",
        texto: "Visão geral",
        acao: "producao.ver",
        etapa: "E14",
        icone: "chama",
      },
    ],
  },
  {
    codigo: "estoque",
    nome: "Estoque e compras",
    caminho: "/estoque",
    descricao: "Semáforo do estoque, entradas, contagem, compras e custos.",
    aparelho: "celular",
    itens: [
      {
        caminho: "/estoque",
        texto: "Cozinha",
        acao: "estoque.cozinha",
        etapa: "E09",
        icone: "caixa",
      },
      {
        caminho: "/estoque/salao",
        texto: "Salão",
        acao: "estoque.salao",
        etapa: "E09",
        icone: "salao",
      },
      {
        caminho: "/estoque/compras",
        texto: "Compras do estoque",
        acao: "compras.gerenciar",
        etapa: "E10",
        icone: "carrinho",
        curto: "Compras",
      },
      {
        caminho: "/estoque/materiais",
        texto: "Compras de materiais",
        acao: "compras.materiais",
        etapa: "E10",
        icone: "ferramenta",
        curto: "Materiais",
      },
      {
        caminho: "/estoque/custos",
        texto: "Custos da área",
        acao: "custos.ver",
        etapa: "E08",
        icone: "moeda",
        curto: "Custos",
      },
    ],
  },
  {
    codigo: "gestao",
    nome: "Gestão",
    caminho: "/gestao",
    descricao: "Funcionários, cargos, auditoria e aparelhos.",
    aparelho: "computador",
    itens: [
      {
        caminho: "/gestao",
        texto: "Resumo",
        acao: "usuarios.ver",
        icone: "painel",
      },
      {
        caminho: "/funcionarios",
        texto: "Funcionários",
        acao: "usuarios.ver",
        icone: "pessoas",
      },
      {
        caminho: "/auditoria",
        texto: "Auditoria",
        acao: "auditoria.ver",
        icone: "escudo",
      },
      {
        caminho: "/comunicados",
        texto: "Comunicados",
        acao: "comunicados.enviar",
        icone: "megafone",
      },
      {
        caminho: "/turnos",
        texto: "Turnos",
        acao: "horarios.gerenciar",
        icone: "turno",
      },
      {
        caminho: "/estacoes",
        texto: "Estações",
        acao: "estacoes.ver",
        icone: "tablet",
      },
    ],
    naBarra: ["/gestao", "/funcionarios", "/turnos", "/comunicados"],
  },
  {
    codigo: "cadastros",
    nome: "Cadastros",
    caminho: "/cadastros",
    descricao:
      "Ingredientes, embalagens, fornecedores, categorias e horários de venda.",
    aparelho: "computador",
    itens: [
      {
        caminho: "/cadastros",
        texto: "Ingredientes",
        acao: "cadastros.ver",
        icone: "folha",
        curto: "Insumos",
      },
      {
        caminho: "/cadastros/embalagens",
        texto: "Embalagens",
        acao: "cadastros.ver",
        icone: "pacote",
      },
      {
        caminho: "/cadastros/fornecedores",
        texto: "Fornecedores",
        acao: "cadastros.ver",
        icone: "caminhao",
      },
      {
        caminho: "/cadastros/produtos",
        texto: "Produtos",
        acao: "cadastros.ver",
        icone: "xicara",
      },
      {
        caminho: "/cadastros/adicionais",
        texto: "Adicionais",
        acao: "cadastros.ver",
        icone: "adicional",
      },
      {
        caminho: "/cadastros/categorias",
        texto: "Categorias",
        acao: "cadastros.ver",
        icone: "etiqueta",
      },
      {
        caminho: "/cadastros/tipos-producao",
        texto: "Tipos de produção",
        acao: "cadastros.ver",
        icone: "chama",
        curto: "Tipos",
      },
      {
        caminho: "/cadastros/horarios",
        texto: "Horários de venda",
        acao: "cadastros.ver",
        icone: "calendario",
        curto: "Horários",
      },
    ],
    naBarra: [
      "/cadastros/produtos",
      "/cadastros",
      "/cadastros/categorias",
      "/cadastros/horarios",
    ],
  },
  {
    codigo: "financeiro",
    nome: "Financeiro",
    caminho: "/financeiro",
    descricao: "Contas, faturamento, fechamentos do caixa e contabilidade.",
    aparelho: "computador",
    itens: [
      {
        caminho: "/financeiro",
        texto: "Contas",
        acao: "financeiro.ver",
        etapa: "E21",
        icone: "grafico",
      },
      {
        caminho: "/financeiro/faturamento",
        texto: "Faturamento",
        acao: "faturamento.ver",
        etapa: "E21",
        icone: "recibo",
      },
      {
        caminho: "/financeiro/fechamentos",
        texto: "Fechamentos do caixa",
        acao: "caixa.fechamentos_ver",
        etapa: "E21",
        icone: "dinheiro",
        curto: "Fechamentos",
      },
      {
        caminho: "/financeiro/contabil",
        texto: "Pacote contábil",
        acao: "contabil.ver",
        etapa: "E21",
        icone: "documento",
        curto: "Contábil",
      },
    ],
  },
  {
    codigo: "entregas",
    nome: "Entregas",
    caminho: "/entregas",
    descricao: "Entregas atribuídas a você, com o código de confirmação.",
    aparelho: "celular",
    itens: [
      {
        caminho: "/entregas",
        texto: "Minhas entregas",
        acao: "entregas.proprias",
        etapa: "E29",
        icone: "entrega",
        curto: "Entregas",
      },
    ],
  },
];

/** Itens do aplicativo que o cargo ativo pode ver. */
export function itensVisiveis(
  app: Aplicativo,
  cargoAtivo: string | null | undefined,
): ItemDoMenu[] {
  return app.itens.filter((i) => pode(cargoAtivo, i.acao));
}

/** O aplicativo aparece se o cargo ativo pode ver pelo menos um item dele. */
export function podeAbrir(
  app: Aplicativo,
  cargoAtivo: string | null | undefined,
): boolean {
  return itensVisiveis(app, cargoAtivo).length > 0;
}

export function aplicativosDoCargo(
  cargoAtivo: string | null | undefined,
): Aplicativo[] {
  return APLICATIVOS.filter((a) => podeAbrir(a, cargoAtivo));
}

export function aplicativoPorCodigo(codigo: string): Aplicativo {
  const app = APLICATIVOS.find((a) => a.codigo === codigo);
  if (!app) throw new Error(`Aplicativo desconhecido: ${codigo}`);
  return app;
}

/** Item que corresponde exatamente a um endereço (para a tela conferir a própria ação). */
export function itemDoCaminho(
  app: Aplicativo,
  caminho: string,
): ItemDoMenu | undefined {
  return app.itens.find((i) => i.caminho === caminho);
}

/**
 * Celular: o que fica à vista na barra de baixo e o que vai para "Mais". No máximo 4 itens à
 * vista; com outros aplicativos no cargo, "Mais" também serve para trocar de aplicativo.
 */
export function itensDaBarra(
  app: Aplicativo,
  cargoAtivo: string | null | undefined,
): { naBarra: ItemDoMenu[]; noMais: ItemDoMenu[] } {
  const visiveis = itensVisiveis(app, cargoAtivo);
  const ordem = app.naBarra ?? [];
  const preferidos = ordem
    .map((c) => visiveis.find((i) => i.caminho === c))
    .filter((i): i is ItemDoMenu => !!i);
  const ordenados = [
    ...preferidos,
    ...visiveis.filter((i) => !preferidos.includes(i)),
  ];
  const cabem = ordenados.length <= 4 ? ordenados.length : 4;
  return { naBarra: ordenados.slice(0, cabem), noMais: ordenados.slice(cabem) };
}
