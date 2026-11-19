/**
 * Contas da tela do Clube, sem banco e sem React. A regra que vale é a do servidor
 * (`packages/dominio/src/clube.ts`); aqui só: converter o que a pessoa digita, conferir o básico
 * antes de mandar (para explicar cedo) e montar a prévia com a mesma função do servidor
 * (`descontoDoClube`). Dinheiro em centavos e percentual em pontos-base: nada de float.
 */
import {
  descontoDoClube,
  PB_MAXIMO_DO_DESCONTO,
  percentualDoTexto,
  textoDoPercentual,
  TETO_MAXIMO_CENTAVOS,
  type Campanha,
  type ModoDoHorario,
  type Premio,
  type Presente,
  type RegrasDoClube,
} from "@erp/dominio/clube";
import { horaValida } from "@erp/dominio/horarios";
import { centavosDoTexto, textoDosCentavos } from "@erp/dominio/produtos";
import { reaisDoCampo, TC } from "./textos";

export type PainelDoClube = {
  regras: RegrasDoClube;
  premios: Premio[];
  presentes: Presente[];
  campanhas: Campanha[];
  categorias: { id: number; nome: string; ativo: boolean }[];
  produtos: { id: number; nome: string; ativo: boolean }[];
  unidades: { id: number; nome: string }[];
};

/** Um dia do horário do desconto como a tela edita (horas em texto). */
export type DiaDoDesconto = {
  dia: number;
  modo: ModoDoHorario;
  inicio: string;
  fim: string;
};

/** O formulário da aba "Desconto do app". */
export type FormDoDesconto = {
  ligado: boolean;
  percentual: string;
  todas: boolean;
  categorias: number[];
  teto: string;
  dias: DiaDoDesconto[];
};

export function formDoDesconto(r: RegrasDoClube): FormDoDesconto {
  return {
    ligado: r.ligado,
    percentual: textoDoPercentual(r.descontoPb).replace("%", ""),
    todas: r.todasAsCategorias,
    categorias: [...r.categorias],
    teto:
      r.tetoDescontoCentavos === null
        ? ""
        : reaisDoCampo(r.tetoDescontoCentavos),
    dias: [1, 2, 3, 4, 5, 6, 7].map((dia) => {
      const h = r.horarios.find((x) => x.dia === dia);
      return {
        dia,
        modo: h?.modo ?? "todo_horario",
        inicio: h?.inicio ?? "",
        fim: h?.fim ?? "",
      };
    }),
  };
}

/** Problema de um dia (null = certo). */
export function problemaDoDia(d: DiaDoDesconto): boolean {
  if (d.modo !== "janela") return false;
  return !horaValida(d.inicio) || !horaValida(d.fim) || d.inicio >= d.fim;
}

export type CorpoDasRegras = Pick<
  RegrasDoClube,
  | "ligado"
  | "descontoPb"
  | "todasAsCategorias"
  | "categorias"
  | "tetoDescontoCentavos"
  | "horarios"
>;

/** Confere e monta o corpo de POST /api/clube/regras (só a aba do desconto). Devolve o erro em texto. */
export function corpoDoDesconto(
  f: FormDoDesconto,
  ativas: readonly number[],
  nomeDoDia: (dia: number) => string,
): { corpo: CorpoDasRegras } | { erro: string } {
  const pb = percentualDoTexto(f.percentual);
  if (pb === null || pb > PB_MAXIMO_DO_DESCONTO)
    return { erro: TC.desconto.erroPercentual };
  let teto: number | null = null;
  if (f.teto.trim()) {
    teto = centavosDoTexto(f.teto);
    if (teto === null || teto < 1 || teto > TETO_MAXIMO_CENTAVOS)
      return { erro: TC.desconto.erroTeto };
  }
  // Só as categorias em uso vão na lista (a que não vier sai do Clube no servidor).
  const categorias = f.categorias.filter((c) => ativas.includes(c));
  if (!f.todas && categorias.length === 0)
    return { erro: TC.desconto.erroCategorias };
  const ruim = f.dias.find(problemaDoDia);
  if (ruim) return { erro: TC.desconto.erroHora(nomeDoDia(ruim.dia)) };
  return {
    corpo: {
      ligado: f.ligado,
      descontoPb: pb,
      todasAsCategorias: f.todas,
      categorias,
      tetoDescontoCentavos: teto,
      horarios: f.dias.map((d) => ({
        dia: d.dia,
        modo: d.modo,
        inicio: d.modo === "janela" ? d.inicio : null,
        fim: d.modo === "janela" ? d.fim : null,
      })),
    },
  };
}

/** Dia da semana de 1 (segunda) a 7 (domingo) e "HH:MM" de uma data, no relógio deste aparelho. */
export function momentoDe(agora: Date): { dia: number; hora: string } {
  const dia = agora.getDay() === 0 ? 7 : agora.getDay();
  const hora = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  return { dia, hora };
}

/**
 * Frase da prévia: "Num pedido de R$ 50,00 agora: desconto de R$ 5,00". Usa o formulário (mesmo
 * antes de salvar) e a regra única do servidor. O pedido de exemplo é todo de uma categoria que
 * participa. Com o Clube desligado, mostra quanto daria quando for ligado.
 */
export function fraseDaPrevia(
  f: FormDoDesconto,
  exemploCentavos: number,
  momento: { dia: number; hora: string },
): string {
  const pb = percentualDoTexto(f.percentual);
  if (pb === null || pb > PB_MAXIMO_DO_DESCONTO)
    return TC.desconto.erroPercentual;
  const teto = f.teto.trim() ? centavosDoTexto(f.teto) : null;
  if (f.teto.trim() && (teto === null || teto < 1)) return TC.desconto.erroTeto;
  const categoria = f.todas ? null : (f.categorias[0] ?? null);
  let r: ReturnType<typeof descontoDoClube>;
  try {
    r = descontoDoClube(
      {
        ligado: true,
        descontoPb: pb,
        todasAsCategorias: f.todas,
        categorias: f.categorias,
        tetoDescontoCentavos: teto,
        horarios: f.dias.map((d) => ({
          dia: d.dia,
          modo: d.modo,
          inicio: d.inicio || null,
          fim: d.fim || null,
        })),
      },
      [{ categoriaId: categoria, totalCentavos: exemploCentavos }],
      momento,
    );
  } catch {
    // A regra recusa valor fora do permitido: a tela só não mostra a conta.
    return TC.desconto.erroExemplo;
  }
  const inicio = `Num pedido de ${textoDosCentavos(exemploCentavos)} agora`;
  const depois = f.ligado ? "" : " (quando o Clube for ligado)";
  switch (r.motivo) {
    case "sem_desconto_no_dia":
      return `${inicio}: sem desconto, hoje o desconto não vale.`;
    case "fora_do_horario":
      return `${inicio}: sem desconto, agora está fora do horário do desconto.`;
    case "sem_itens_do_clube":
      return `${inicio}: sem desconto, nenhuma categoria escolhida.`;
    case "clube_desligado":
      return `${inicio}: sem desconto (desconto de 0%).`;
    default:
      return `${inicio}: desconto de ${textoDosCentavos(r.descontoCentavos)}${r.limitadoPeloTeto ? " (limitado pelo teto)" : ""}${depois}`;
  }
}

/** Agendadas primeiro (a mais próxima no alto); depois enviadas e canceladas (a mais recente no alto). */
export function ordenarCampanhas(lista: readonly Campanha[]): Campanha[] {
  const agendadas = lista
    .filter((c) => c.situacao === "agendada")
    .sort((a, b) => a.enviarEm.localeCompare(b.enviarEm) || a.id - b.id);
  const outras = lista
    .filter((c) => c.situacao !== "agendada")
    .sort((a, b) => b.enviarEm.localeCompare(a.enviarEm) || b.id - a.id);
  return [...agendadas, ...outras];
}

/** Inteiro digitado entre `min` e `max` (só dígitos), ou null. */
export function inteiroDoTexto(
  texto: string,
  min: number,
  max: number,
): number | null {
  const t = texto.trim().replace(/\./g, "");
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}
