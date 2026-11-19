/**
 * Clube E-MOTION: partes sem banco, usadas no servidor e nas telas (`@erp/dominio/clube`).
 * RC-21 seção 2; migração 0018; decisão 0024. Tudo em inteiros: dinheiro em centavos e
 * percentual em pontos-base (1000 = 10,00%). Nada de float.
 *
 * `descontoDoClube` e `pontosDoPagamento` são a regra única: o pedido (E26 e depois) chama
 * as mesmas funções no servidor, com as regras relidas do banco; a tela usa para a prévia.
 * "Não acumula, vale o maior" (com cupom, promoção e desconto de funcionário) é conferido no
 * pedido, que compara os descontos possíveis; aqui só se calcula o do Clube.
 */

export const PB_MAXIMO_DO_DESCONTO = 5000; // 50%
export const TETO_MAXIMO_CENTAVOS = 999_999;
export const PONTOS_POR_REAL_MAXIMO = 100;
export const PONTOS_DO_PREMIO_MAXIMO = 100_000;

export const MODOS_DO_HORARIO = ["todo_horario", "sem_desconto", "janela"] as const;
export type ModoDoHorario = (typeof MODOS_DO_HORARIO)[number];
export const NOME_DO_MODO: Readonly<Record<ModoDoHorario, string>> = {
  todo_horario: "Todo o horário de venda",
  sem_desconto: "Sem desconto",
  janela: "Só das ... às ...",
};

export const TIPOS_DE_PRESENTE = ["boas_vindas", "aniversario", "sentimos_falta"] as const;
export type TipoDePresente = (typeof TIPOS_DE_PRESENTE)[number];
export const NOME_DO_PRESENTE: Readonly<Record<TipoDePresente, string>> = {
  boas_vindas: "Boas-vindas (no primeiro pedido)",
  aniversario: "Aniversário (no mês do aniversário)",
  sentimos_falta: "Sentimos sua falta (depois de dias sem pedir)",
};

export const BENEFICIOS = ["desconto_percentual", "desconto_valor", "produto", "pontos"] as const;
export type Beneficio = (typeof BENEFICIOS)[number];
export const NOME_DO_BENEFICIO: Readonly<Record<Beneficio, string>> = {
  desconto_percentual: "Desconto em %",
  desconto_valor: "Desconto em R$",
  produto: "Um produto grátis",
  pontos: "Pontos extras",
};

export const PUBLICOS = ["todos", "aniversariantes_do_mes", "sem_pedir_30_dias"] as const;
export type Publico = (typeof PUBLICOS)[number];
export const NOME_DO_PUBLICO: Readonly<Record<Publico, string>> = {
  todos: "Todos os membros que aceitaram ofertas",
  aniversariantes_do_mes: "Aniversariantes do mês",
  sem_pedir_30_dias: "Quem não pede há 30 dias",
};

export const SITUACOES_DA_CAMPANHA = ["agendada", "cancelada", "enviada"] as const;
export type SituacaoDaCampanha = (typeof SITUACOES_DA_CAMPANHA)[number];

export type HorarioDoDesconto = { dia: number; modo: ModoDoHorario; inicio: string | null; fim: string | null };

export type RegrasDoClube = {
  ligado: boolean;
  descontoPb: number;
  todasAsCategorias: boolean;
  /** Categorias que participam (vale só quando `todasAsCategorias` é falso). */
  categorias: number[];
  tetoDescontoCentavos: number | null;
  pontosPorReal: number;
  campanhasPorSemana: number;
  /** Os 7 dias, de segunda (1) a domingo (7). */
  horarios: HorarioDoDesconto[];
  atualizadoEm: string;
};

export type Premio = {
  id: number;
  nome: string;
  descricao: string | null;
  pontos: number;
  produtoId: number | null;
  ativo: boolean;
};

export type Presente = {
  tipo: TipoDePresente;
  ligado: boolean;
  beneficio: Beneficio;
  /** Pontos-base (desconto em %), centavos (desconto em R$) ou pontos; nulo no produto grátis. */
  valor: number | null;
  produtoId: number | null;
  diasSemPedir: number | null;
  validadeDias: number;
  mensagem: string | null;
};

export type Campanha = {
  id: number;
  unidadeId: number;
  titulo: string;
  texto: string;
  publico: Publico;
  /** Hora local da unidade, "AAAA-MM-DDTHH:MM". */
  enviarEm: string;
  situacao: SituacaoDaCampanha;
  criadaPor: string;
  criadaEm: string;
  motivoCancelamento: string | null;
  destinatarios: number | null;
};

/** "10" -> 1000; "10,5" -> 1050; "12,75%" -> 1275. Inválido ou fora de 0 a 100: nulo. */
export function percentualDoTexto(texto: string): number | null {
  const t = texto.trim().replace(/%$/, "").trim();
  const m = /^(\d{1,3})(?:[,.](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const pb = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return pb <= 10_000 ? pb : null;
}

/** 1000 -> "10%"; 1050 -> "10,5%"; 1275 -> "12,75%". */
export function textoDoPercentual(pb: number): string {
  const inteiro = Math.trunc(pb / 100);
  const resto = pb % 100;
  if (!resto) return `${inteiro}%`;
  return `${inteiro},${String(resto).padStart(2, "0").replace(/0$/, "")}%`;
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/;
const minutos = (h: string) => {
  const m = HORA.exec(h);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export type ItemParaDesconto = { categoriaId: number | null; totalCentavos: number };
export type MotivoSemDesconto = "clube_desligado" | "sem_desconto_no_dia" | "fora_do_horario" | "sem_itens_do_clube";
export type ResultadoDoDesconto = {
  descontoCentavos: number;
  /** Soma dos itens que participam. */
  baseCentavos: number;
  /** Verdadeiro quando o teto cortou o desconto. */
  limitadoPeloTeto: boolean;
  motivo: MotivoSemDesconto | null;
};

/**
 * Desconto do aplicativo num pedido de membro logado. `momento` é a hora local da unidade
 * (dia 1 a 7, "HH:MM"); quem chama já conferiu que a casa está vendendo. Arredonda para baixo
 * (nunca dá mais que o percentual) e respeita o teto por pedido.
 */
export function descontoDoClube(
  regras: Pick<RegrasDoClube, "ligado" | "descontoPb" | "todasAsCategorias" | "categorias" | "tetoDescontoCentavos" | "horarios">,
  itens: readonly ItemParaDesconto[],
  momento: { dia: number; hora: string },
): ResultadoDoDesconto {
  if (!Number.isInteger(momento.dia) || momento.dia < 1 || momento.dia > 7) throw new Error("Dia da semana inválido.");
  const agora = minutos(momento.hora);
  if (agora === null) throw new Error("Hora inválida.");
  for (const i of itens)
    if (!Number.isSafeInteger(i.totalCentavos) || i.totalCentavos < 0) throw new Error("Valor do item inválido.");
  if (!Number.isInteger(regras.descontoPb) || regras.descontoPb < 0 || regras.descontoPb > PB_MAXIMO_DO_DESCONTO)
    throw new Error("Percentual do desconto inválido.");
  const teto0 = regras.tetoDescontoCentavos;
  if (teto0 !== null && (!Number.isSafeInteger(teto0) || teto0 < 1)) throw new Error("Teto do desconto inválido.");

  const nada = (motivo: MotivoSemDesconto, baseCentavos = 0): ResultadoDoDesconto => ({
    descontoCentavos: 0,
    baseCentavos,
    limitadoPeloTeto: false,
    motivo,
  });
  if (!regras.ligado || regras.descontoPb <= 0) return nada("clube_desligado");
  const h = regras.horarios.find((x) => x.dia === momento.dia);
  if (!h || h.modo === "sem_desconto") return nada("sem_desconto_no_dia");
  if (h.modo === "janela") {
    const ini = minutos(h.inicio ?? "");
    const fim = minutos(h.fim ?? "");
    if (ini === null || fim === null || agora < ini || agora >= fim) return nada("fora_do_horario");
  }
  const participa = new Set(regras.categorias);
  const base = itens
    .filter((i) => regras.todasAsCategorias || (i.categoriaId !== null && participa.has(i.categoriaId)))
    .reduce((s, i) => s + i.totalCentavos, 0);
  if (!Number.isSafeInteger(base * regras.descontoPb)) throw new Error("Valor do pedido grande demais.");
  if (base <= 0) return nada("sem_itens_do_clube");
  const bruto = Math.floor((base * regras.descontoPb) / 10_000);
  const teto = regras.tetoDescontoCentavos;
  const limitado = teto !== null && bruto > teto;
  return { descontoCentavos: limitado ? teto : bruto, baseCentavos: base, limitadoPeloTeto: limitado, motivo: null };
}

/** Pontos de um pedido pago: só reais inteiros contam (R$ 25,90 com 1 ponto por real = 25). */
export function pontosDoPagamento(regras: Pick<RegrasDoClube, "ligado" | "pontosPorReal">, pagoCentavos: number): number {
  if (!Number.isSafeInteger(pagoCentavos) || pagoCentavos < 0) throw new Error("Valor pago inválido.");
  if (!regras.ligado) return 0;
  return Math.floor(pagoCentavos / 100) * regras.pontosPorReal;
}

/** Frase do benefício para a tela: "10% de desconto", "R$ 5,00 de desconto", "50 pontos". */
export function textoDoBeneficio(p: Pick<Presente, "beneficio" | "valor">, nomeDoProduto?: string | null): string {
  switch (p.beneficio) {
    case "desconto_percentual":
      return `${textoDoPercentual(p.valor ?? 0)} de desconto`;
    case "desconto_valor":
      return `R$ ${((p.valor ?? 0) / 100).toFixed(2).replace(".", ",")} de desconto`;
    case "pontos":
      return `${p.valor ?? 0} pontos`;
    case "produto":
      return nomeDoProduto ? `${nomeDoProduto} grátis` : "Um produto grátis";
  }
}
