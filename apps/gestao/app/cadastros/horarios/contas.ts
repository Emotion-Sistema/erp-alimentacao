/**
 * Contas das telas de horário, sem banco e sem React (testes em apps/gestao/testes/horarios-contas.teste.ts).
 * O que vale de verdade é decidido no banco (`situacao_de_venda`, migração 0010). Aqui só:
 * arrumar a hora digitada, conferir a ordem antes de mandar e mostrar o horário que vai valer
 * (a interseção das camadas) ao lado de cada dia. O servidor confere tudo de novo.
 */
import { DIAS, horaCurta, horaValida, NOME_DO_CANAL, type Canal } from "@erp/dominio/horarios";
import type { Categoria, DataDaUnidade, DataDeVenda, DiaDaUnidade, Horarios, JanelaDeVenda, ModoDoDia, Pausa } from "@erp/dominio";

export type { Categoria, DataDaUnidade, DataDeVenda, DiaDaUnidade, Horarios, JanelaDeVenda, ModoDoDia, Pausa };

/** Um dia na grade do canal ou da categoria (como a tela edita: horas em texto). */
export type DiaDeVenda = { dia: number; modo: ModoDoDia; inicio: string; fim: string };
/** Um dia na semana da loja (como a tela edita). */
export type DiaDaLoja = { dia: number; aberta: boolean; abre: string; ultimoPedido: string; fecha: string };

/** "HH:MM" em minutos do dia ("24:00" = 1440). */
export const minutosDe = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const deMinutos = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Arruma o que a pessoa digitou: "11" -> "11:00", "11h" -> "11:00", "11h30", "1130", "11.30" e
 * "11:30" -> "11:30", "9:5" fica como está (inválido). Devolve o texto original se não entender.
 */
export function arrumarHora(v: string): string {
  const t = v.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return "";
  let m = /^(\d{1,2})(?:h|:|\.)?$/.exec(t);
  if (m) return `${m[1]!.padStart(2, "0")}:00`;
  m = /^(\d{1,2})(?:h|:|\.)(\d{2})$/.exec(t);
  if (m) return `${m[1]!.padStart(2, "0")}:${m[2]}`;
  m = /^(\d{1,2})(\d{2})$/.exec(t);
  if (m) return `${m[1]!.padStart(2, "0")}:${m[2]}`;
  return v.trim();
}

// ---------- semana da loja ----------
export function semanaParaEditar(semana: DiaDaUnidade[]): DiaDaLoja[] {
  return DIAS.map((dia) => {
    const s = semana.find((x) => x.dia === dia);
    return { dia, aberta: !!s?.aberta, abre: s?.abre ?? "", ultimoPedido: s?.ultimoPedido ?? "", fecha: s?.fecha ?? "" };
  });
}

/** Problema de um dia da loja (texto pronto) ou null. */
export function problemaDoDiaDaLoja(d: DiaDaLoja): string | null {
  if (!d.aberta) return null;
  if (!d.abre || !d.ultimoPedido || !d.fecha) return "Preencha abre, último pedido e fecha.";
  if (!horaValida(d.abre)) return "Abre: use o formato 11:00.";
  if (!horaValida(d.ultimoPedido, true)) return "Último pedido: use o formato 23:00.";
  if (!horaValida(d.fecha, true)) return "Fecha: use o formato 23:30.";
  if (minutosDe(d.abre) >= minutosDe(d.ultimoPedido)) return "O último pedido precisa ser depois de abrir.";
  if (minutosDe(d.ultimoPedido) > minutosDe(d.fecha)) return "O último pedido não pode ser depois de fechar.";
  return null;
}

export const corpoDaSemana = (dias: DiaDaLoja[]) => ({
  dias: dias.map((d) => (d.aberta ? { dia: d.dia, aberta: true, abre: d.abre, ultimoPedido: d.ultimoPedido, fecha: d.fecha } : { dia: d.dia, aberta: false, abre: null, ultimoPedido: null, fecha: null })),
});

/** Para o botão "Salvar" só acender com mudança: compara o que vai ser gravado. */
export const mesmaSemana = (a: DiaDaLoja[], b: DiaDaLoja[]) => JSON.stringify(corpoDaSemana(a)) === JSON.stringify(corpoDaSemana(b));

// ---------- semana de venda (canal ou categoria) ----------
export function vendaParaEditar(venda: JanelaDeVenda[], canal: Canal, categoriaId: number | null): DiaDeVenda[] {
  return DIAS.map((dia) => {
    const v = venda.find((x) => x.canal === canal && x.categoriaId === categoriaId && x.dia === dia);
    return { dia, modo: v?.modo ?? "segue", inicio: v?.inicio ?? "", fim: v?.fim ?? "" };
  });
}

export function problemaDoDiaDeVenda(d: DiaDeVenda): string | null {
  if (d.modo !== "aberto") return null;
  if (!d.inicio || !d.fim) return "Preencha início e fim.";
  if (!horaValida(d.inicio)) return "Início: use o formato 11:00.";
  if (!horaValida(d.fim, true)) return "Fim: use o formato 15:00.";
  if (minutosDe(d.inicio) >= minutosDe(d.fim)) return "O início precisa ser antes do fim.";
  return null;
}

export const corpoDaVenda = (canal: Canal, categoriaId: number | null, dias: DiaDeVenda[]) => ({
  canal,
  categoriaId,
  dias: dias.map((d) => (d.modo === "aberto" ? { dia: d.dia, modo: d.modo, inicio: d.inicio, fim: d.fim } : { dia: d.dia, modo: d.modo, inicio: null, fim: null })),
});

export const mesmaVenda = (a: DiaDeVenda[], b: DiaDeVenda[]) => JSON.stringify(corpoDaVenda("loja", null, a).dias) === JSON.stringify(corpoDaVenda("loja", null, b).dias);

// ---------- o que vale de fato (só para mostrar) ----------
export type Efetivo = { vende: true; inicio: string; fim: string } | { vende: false; texto: string };

type Camada = { modo: ModoDoDia; inicio: string | null; fim: string | null };

/**
 * Mesma conta da `situacao_de_venda`, para um dia da semana: começa no horário da loja (abre até o
 * último pedido da cozinha) e cada camada de dentro pode fechar o dia ou estreitar a janela.
 */
export function efetivoDoDia(loja: DiaDaUnidade | undefined, camadas: { camada: Camada; fechadoTexto: string }[]): Efetivo {
  if (!loja?.aberta || !loja.abre || !loja.ultimoPedido) return { vende: false, texto: "Loja fechada" };
  let ini = minutosDe(loja.abre);
  let fim = minutosDe(loja.ultimoPedido);
  for (const { camada, fechadoTexto } of camadas) {
    if (camada.modo === "fechado") return { vende: false, texto: fechadoTexto };
    if (camada.modo === "aberto" && camada.inicio && camada.fim && horaValida(camada.inicio) && horaValida(camada.fim, true)) {
      ini = Math.max(ini, minutosDe(camada.inicio));
      fim = Math.min(fim, minutosDe(camada.fim));
    }
  }
  if (ini >= fim) return { vende: false, texto: "Não sobra horário" };
  return { vende: true, inicio: deMinutos(ini), fim: deMinutos(fim) };
}

export const textoDoEfetivo = (e: Efetivo) => (e.vende ? `${horaCurta(e.inicio)} às ${horaCurta(e.fim)}` : e.texto);

/** Camada do canal num dia (do que está gravado). */
export function camadaDoCanal(venda: JanelaDeVenda[], canal: Canal, dia: number): Camada {
  const v = venda.find((x) => x.canal === canal && x.categoriaId === null && x.dia === dia);
  return v ? { modo: v.modo, inicio: v.inicio, fim: v.fim } : { modo: "segue", inicio: null, fim: null };
}

// ---------- datas e nomes ----------
/** "2026-12-25" -> "sex, 25/12" (o dia da semana pela data, sem fuso: é uma data de calendário). */
export function dataCurta(data: string): string {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  const siglas = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return `${siglas[dia]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "AAAA-MM-DD" daqui a `dias` dias (a partir de outra data "AAAA-MM-DD"). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export const nomeDaCategoria = (categorias: Categoria[], id: number | null) => (id === null ? null : categorias.find((c) => c.id === id)?.nome ?? `Categoria ${id}`);

/** "Loja inteira", "Delivery", "Hambúrgueres no delivery", "Tudo" (pausa sem canal). */
export function nomeDoAlvo(canal: Canal | null, categoriaId: number | null, categorias: Categoria[]): string {
  const cat = nomeDaCategoria(categorias, categoriaId);
  if (canal === null) return cat ? `${cat} (loja e delivery)` : "Tudo (loja e delivery)";
  if (!cat) return NOME_DO_CANAL[canal];
  return `${cat} ${canal === "delivery" ? "no delivery" : "na loja"}`;
}

/** Hora local da unidade de um instante (ISO): "12h40"; se não for hoje, "sex, 25/12 às 12h40". */
export function quandoLocal(iso: string, fuso: string, hoje: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  const data = `${p("year")}-${p("month")}-${p("day")}`;
  const hora = horaCurta(`${p("hour")}:${p("minute")}`);
  return data === hoje ? hora : `${dataCurta(data)} às ${hora}`;
}

export type ItemDeData =
  | { tipo: "unidade"; id: number; data: string; item: DataDaUnidade }
  | { tipo: "venda"; id: number; data: string; item: DataDeVenda };

/** Datas especiais da loja inteira e de canal ou categoria, juntas e em ordem de data. */
export function datasEmOrdem(h: Pick<Horarios, "datas" | "datasVenda">): ItemDeData[] {
  const todas: ItemDeData[] = [
    ...h.datas.map((d) => ({ tipo: "unidade" as const, id: d.id, data: d.data, item: d })),
    ...h.datasVenda.map((d) => ({ tipo: "venda" as const, id: d.id, data: d.data, item: d })),
  ];
  return todas.sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === b.tipo ? 0 : a.tipo === "unidade" ? -1 : 1));
}

export const DURACOES = [
  { valor: "15", texto: "15 min", minutos: 15 },
  { valor: "30", texto: "30 min", minutos: 30 },
  { valor: "60", texto: "1 h", minutos: 60 },
  { valor: "120", texto: "2 h", minutos: 120 },
  { valor: "ate-retomar", texto: "Até eu retomar", minutos: null },
] as const;
