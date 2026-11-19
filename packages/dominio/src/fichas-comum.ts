/**
 * Fichas técnicas: partes sem banco, usadas no servidor e nas telas (`@erp/dominio/fichas`).
 * E08; migração 0019; decisão 0025. Conta sempre EXATA: quantidades em decimal (texto vindo
 * do banco) viram frações de inteiros grandes (BigInt); dinheiro só é arredondado no fim, para
 * centavos. Nada de float na conta.
 *
 * `analisarFichas` é a regra única de consumo e custo. Dois consumos, de propósito (RC-01):
 *  - DIRETO: o que a receita tira do estoque — ingredientes e PREPAROS (o preparo tem estoque
 *    próprio: produzir o lote baixa os ingredientes dele; vender o prato baixa o preparo, nunca
 *    os ingredientes de novo). É este que a E11 usa, com a fração exata.
 *  - EXPANDIDO (ingredientes crus): abre os preparos pela versão atual; serve ao custo, aos
 *    alergênicos e para mostrar. Nunca para baixar estoque.
 */

export const TIPOS_DE_FICHA = ["produto", "tamanho", "adicional", "preparo"] as const;
export type TipoDeFicha = (typeof TIPOS_DE_FICHA)[number];
export const NOME_DO_TIPO_DE_FICHA: Readonly<Record<TipoDeFicha, string>> = {
  produto: "Produto",
  tamanho: "Tamanho",
  adicional: "Adicional",
  preparo: "Preparo da casa",
};
export const UNIDADES_DA_FICHA = ["g", "ml", "un"] as const;
export type UnidadeDaFicha = (typeof UNIDADES_DA_FICHA)[number];

export const ITENS_POR_FICHA = 80;
export const PENDENCIAS_POR_FICHA = 30;
export const ETAPAS_POR_FICHA = 40;
export const EQUIPAMENTOS_POR_FICHA = 20;
/** Preparo dentro de preparo: no máximo esta profundidade (protege contra receita sem fim). */
export const PROFUNDIDADE_MAXIMA = 8;

// ---------------------------------------------------------------- frações exatas

/** Fração de inteiros grandes, sempre reduzida e com denominador positivo. */
export class Fracao {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint, d: bigint = 1n) {
    if (d === 0n) throw new Error("Divisão por zero.");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = mdc(n < 0n ? -n : n, d);
    this.n = g > 1n ? n / g : n;
    this.d = g > 1n ? d / g : d;
  }
  static readonly ZERO = new Fracao(0n);
  static readonly UM = new Fracao(1n);
  static inteiro(v: number): Fracao {
    if (!Number.isSafeInteger(v)) throw new Error("Número inteiro inválido.");
    return new Fracao(BigInt(v));
  }
  /** "12.3400", "0,5", "3" -> fração exata. Só decimal simples (sem expoente). */
  static decimal(texto: string): Fracao {
    const t = texto.trim().replace(",", ".");
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(t);
    if (!m) throw new Error(`Número inválido: ${texto}`);
    const casas = m[3] ?? "";
    const n = BigInt(m[2]! + casas) * (m[1] === "-" ? -1n : 1n);
    return new Fracao(n, 10n ** BigInt(casas.length));
  }
  mais(o: Fracao): Fracao {
    return new Fracao(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  vezes(o: Fracao): Fracao {
    return new Fracao(this.n * o.n, this.d * o.d);
  }
  dividido(o: Fracao): Fracao {
    if (o.n === 0n) throw new Error("Divisão por zero.");
    return new Fracao(this.n * o.d, this.d * o.n);
  }
  ehZero(): boolean {
    return this.n === 0n;
  }
  /** Arredonda para o inteiro mais próximo (meio para cima, em módulo). */
  arredondado(): bigint {
    const neg = this.n < 0n;
    const a = neg ? -this.n : this.n;
    const q = (2n * a + this.d) / (2n * this.d);
    return neg ? -q : q;
  }
  /** Texto decimal com `casas` casas (arredondado), sem zeros sobrando: "12.5", "0.3333". */
  texto(casas = 4): string {
    const fator = 10n ** BigInt(casas);
    const v = new Fracao(this.n * fator, this.d).arredondado();
    const neg = v < 0n;
    const s = (neg ? -v : v).toString().padStart(casas + 1, "0");
    const inteiro = s.slice(0, s.length - casas);
    const resto = s.slice(s.length - casas).replace(/0+$/, "");
    return `${neg ? "-" : ""}${inteiro}${resto ? `.${resto}` : ""}`;
  }
}
function mdc(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

// ---------------------------------------------------------------- tipos

export type Etapa = { texto: string; minutos: number | null };

export type ItemDaFicha = {
  ordem: number;
  ingredienteId: number | null;
  preparoId: number | null;
  /** Nome do ingrediente ou do preparo (para mostrar). */
  nome: string;
  /** Unidade em que a quantidade está (a do estoque do ingrediente ou a de rendimento do preparo). */
  unidade: UnidadeDaFicha;
  /** Decimal em texto ("20.5"); nulo = pendência. */
  quantidade: string | null;
  opcional: boolean;
  medidaCaseira: string | null;
  observacao: string | null;
};

export type VersaoDaFicha = {
  id: number;
  numero: number;
  rende: string | null;
  porcaoQuantidade: string | null;
  porcaoUnidade: UnidadeDaFicha | null;
  tempoMin: number | null;
  validadeDias: number | null;
  etapas: Etapa[];
  equipamentos: string[];
  observacoes: string | null;
  motivo: string | null;
  criadaPor: string;
  criadaEm: string;
  itens: ItemDaFicha[];
  /** Pendências anotadas pela equipe. */
  pendencias: string[];
};

export type FichaParaConta = {
  id: number;
  tipo: TipoDeFicha;
  nome: string;
  ativo: boolean;
  unidadeRendimento: UnidadeDaFicha | null;
  versao: Pick<VersaoDaFicha, "rende" | "itens" | "pendencias"> | null;
};

export type IngredienteParaConta = {
  id: number;
  nome: string;
  ativo: boolean;
  custoCentavos: number | null;
  /** Decimal em texto, na unidade do estoque. */
  custoQuantidade: string | null;
};

export type TipoDePendencia =
  | "sem_versao"
  | "sem_itens"
  | "sem_rendimento"
  | "item_sem_quantidade"
  | "ingrediente_inativo"
  | "preparo_inativo"
  | "preparo_incompleto"
  | "receita_circular"
  | "profunda_demais"
  | "anotada";

export type Pendencia = { tipo: TipoDePendencia; texto: string };

export type AnaliseDaFicha = {
  /** Sem pendência: pode baixar estoque (E11). */
  completa: boolean;
  pendencias: Pendencia[];
  /**
   * Ingredientes CRUS por unidade do rendimento (uma porção, ou 1 g/ml/un do preparo), abrindo
   * os preparos. Só para mostrar e para o custo. Vazio se a ficha não está completa.
   * `quantidade` arredondada a 4 casas; `exata` = "numerador/denominador".
   */
  consumo: { ingredienteId: number; nome: string; quantidade: string; exata: string }[];
  /**
   * O que UMA unidade do rendimento tira do estoque: ingredientes e preparos (sem abrir), com a
   * fração exata ("n/d"). A E11 multiplica pela quantidade vendida e só então arredonda.
   */
  consumoDireto: { ingredienteId: number | null; preparoId: number | null; nome: string; quantidade: string; exata: string }[];
  /** Custo de uma porção (ou de 1 unidade do preparo) em centavos, arredondado. Nulo sem dado nenhum. */
  custoCentavos: number | null;
  /** Custo de uma unidade do rendimento, exato (para quem soma preparos). */
  custoExato: Fracao | null;
  /** Algum item ficou fora da conta (sem preço, sem quantidade, preparo parcial): custo parcial. */
  custoParcial: boolean;
  /** Ingredientes sem custo de referência (para a tela pedir o preço). */
  semCusto: { ingredienteId: number; nome: string }[];
};

type Interna = {
  pendencias: Pendencia[];
  consumo: Map<number, Fracao> | null;
  direto: Map<string, { ingredienteId: number | null; preparoId: number | null; nome: string; q: Fracao }> | null;
  /** Níveis abaixo desta ficha (0 = sem preparo dentro). */
  altura?: number;
  custo: Fracao;
  custoTemDado: boolean;
  /** Todos os itens entraram no custo (nenhum sem quantidade, sem preço ou de preparo parcial). */
  custoCompleto: boolean;
  semCusto: Map<number, string>;
};

/**
 * Analisa as fichas pedidas, abrindo os preparos (com a versão atual de cada um). `fichas` e
 * `ingredientes` precisam conter tudo o que é alcançável a partir delas (quem chama carrega).
 */
export function analisarFichas(
  fichas: ReadonlyMap<number, FichaParaConta>,
  ingredientes: ReadonlyMap<number, IngredienteParaConta>,
  ids: readonly number[],
): Map<number, AnaliseDaFicha> {
  const memo = new Map<number, Interna>();
  const caminho: number[] = [];

  const custoUnitario = (ing: IngredienteParaConta): Fracao | null =>
    ing.custoCentavos === null || ing.custoQuantidade === null
      ? null
      : Fracao.inteiro(ing.custoCentavos).dividido(Fracao.decimal(ing.custoQuantidade));

  function analisar(id: number): Interna {
    const ficha = fichas.get(id);
    const ja = memo.get(id);
    if (ja && caminho.length + (ja.altura ?? 0) < PROFUNDIDADE_MAXIMA) return ja;
    if (ja && ficha)
      return {
        pendencias: [{ tipo: "profunda_demais", texto: `Preparo dentro de preparo passou de ${PROFUNDIDADE_MAXIMA} níveis.` }],
        consumo: null,
        direto: null,
        custo: Fracao.ZERO,
        custoTemDado: false,
        custoCompleto: false,
        semCusto: new Map(),
      };
    const pend: Pendencia[] = [];
    const semCusto = new Map<number, string>();
    if (!ficha) {
      return { pendencias: [{ tipo: "sem_versao", texto: "Ficha não encontrada." }], consumo: null, direto: null, custo: Fracao.ZERO, custoTemDado: false, custoCompleto: false, semCusto };
    }
    if (caminho.includes(id)) {
      return {
        pendencias: [{ tipo: "receita_circular", texto: `O preparo "${ficha.nome}" acaba usando a si mesmo.` }],
        consumo: null,
        direto: null,
        custo: Fracao.ZERO,
        custoTemDado: false,
        custoCompleto: false,
        semCusto,
      };
    }
    if (caminho.length >= PROFUNDIDADE_MAXIMA) {
      return {
        pendencias: [{ tipo: "profunda_demais", texto: `Preparo dentro de preparo passou de ${PROFUNDIDADE_MAXIMA} níveis.` }],
        consumo: null,
        direto: null,
        custo: Fracao.ZERO,
        custoTemDado: false,
        custoCompleto: false,
        semCusto,
      };
    }
    caminho.push(id);
    try {
      const v = ficha.versao;
      if (!v) {
        const r: Interna = { pendencias: [{ tipo: "sem_versao", texto: "A ficha ainda não tem receita." }], consumo: null, direto: null, custo: Fracao.ZERO, custoTemDado: false, custoCompleto: false, semCusto };
        memo.set(id, r);
        return r;
      }
      for (const t of v.pendencias) pend.push({ tipo: "anotada", texto: t });
      if (!v.itens.length) pend.push({ tipo: "sem_itens", texto: "Nenhum ingrediente na receita." });
      if (v.rende === null)
        pend.push({
          tipo: "sem_rendimento",
          texto: ficha.tipo === "preparo" ? "Falta quanto o preparo rende." : "Falta quantas porções a receita rende.",
        });
      const rende = v.rende === null ? null : Fracao.decimal(v.rende);
      const consumo = new Map<number, Fracao>();
      const direto = new Map<string, { ingredienteId: number | null; preparoId: number | null; nome: string; q: Fracao }>();
      const somarDireto = (k: string, ingredienteId: number | null, preparoId: number | null, nome: string, q: Fracao) =>
        direto.set(k, { ingredienteId, preparoId, nome, q: (direto.get(k)?.q ?? Fracao.ZERO).mais(q) });
      let custo = Fracao.ZERO;
      let custoTemDado = false;
      let custoCompleto = rende !== null && v.itens.length > 0;
      let consumoOk = rende !== null && v.itens.length > 0;
      let altura = 0;

      for (const item of v.itens) {
        if (item.quantidade === null) {
          pend.push({
            tipo: "item_sem_quantidade",
            texto: `${item.nome}: falta a quantidade${item.medidaCaseira ? ` (está "${item.medidaCaseira}")` : ""}.`,
          });
          consumoOk = false;
          custoCompleto = false;
          continue;
        }
        const q = Fracao.decimal(item.quantidade);
        if (item.ingredienteId !== null) {
          const ing = ingredientes.get(item.ingredienteId);
          if (!ing || !ing.ativo) {
            pend.push({ tipo: "ingrediente_inativo", texto: `${item.nome}: ingrediente desativado no cadastro.` });
            consumoOk = false;
            custoCompleto = false;
            continue;
          }
          consumo.set(ing.id, (consumo.get(ing.id) ?? Fracao.ZERO).mais(q));
          somarDireto(`i${ing.id}`, ing.id, null, ing.nome, q);
          const cu = custoUnitario(ing);
          if (cu) {
            custo = custo.mais(q.vezes(cu));
            custoTemDado = true;
          } else {
            semCusto.set(ing.id, ing.nome);
            custoCompleto = false;
          }
        } else if (item.preparoId !== null) {
          const prep = fichas.get(item.preparoId);
          if (!prep || !prep.ativo) {
            pend.push({ tipo: "preparo_inativo", texto: `${item.nome}: preparo desativado.` });
            consumoOk = false;
            custoCompleto = false;
            continue;
          }
          somarDireto(`p${prep.id}`, null, prep.id, prep.nome, q);
          const sub = analisar(item.preparoId);
          altura = Math.max(altura, (sub.altura ?? 0) + 1);
          for (const [k, nome] of sub.semCusto) semCusto.set(k, nome);
          if (!sub.custoCompleto) custoCompleto = false;
          if (sub.custoTemDado) {
            custo = custo.mais(q.vezes(sub.custo));
            custoTemDado = true;
          }
          if (!sub.consumo) {
            const circular = sub.pendencias.find((p) => p.tipo === "receita_circular" || p.tipo === "profunda_demais");
            pend.push(circular ?? { tipo: "preparo_incompleto", texto: `${item.nome}: o preparo tem pendências.` });
            consumoOk = false;
            continue;
          }
          for (const [k, porUnidade] of sub.consumo) consumo.set(k, (consumo.get(k) ?? Fracao.ZERO).mais(q.vezes(porUnidade)));
        }
      }
      // Tudo por unidade do rendimento.
      const porUnidade = new Map<number, Fracao>();
      if (consumoOk && rende) for (const [k, q] of consumo) porUnidade.set(k, q.dividido(rende));
      const diretoPorUnidade = new Map<string, { ingredienteId: number | null; preparoId: number | null; nome: string; q: Fracao }>();
      if (consumoOk && rende) for (const [k, x] of direto) diretoPorUnidade.set(k, { ...x, q: x.q.dividido(rende) });
      const ok = consumoOk && pend.length === 0;
      const r: Interna = {
        pendencias: pend,
        consumo: ok ? porUnidade : null,
        direto: ok ? diretoPorUnidade : null,
        altura,
        custo: rende ? custo.dividido(rende) : Fracao.ZERO,
        custoTemDado: custoTemDado && rende !== null,
        custoCompleto,
        semCusto,
      };
      // "Profunda demais" depende do caminho até aqui: não guarda, para cada raiz ser julgada inteira.
      if (!pend.some((p) => p.tipo === "profunda_demais")) memo.set(id, r);
      return r;
    } finally {
      caminho.pop();
    }
  }

  const saida = new Map<number, AnaliseDaFicha>();
  for (const id of ids) {
    // Cada ficha pedida é julgada a partir dela mesma (o limite de profundidade conta dali).
    for (const [k, v] of memo) if (v.pendencias.some((p) => p.tipo === "profunda_demais")) memo.delete(k);
    const r = analisar(id);
    const nomes = (k: number) => ingredientes.get(k)?.nome ?? `#${k}`;
    saida.set(id, {
      completa: r.pendencias.length === 0 && r.consumo !== null,
      pendencias: r.pendencias,
      consumo: r.consumo
        ? [...r.consumo]
            .map(([k, q]) => ({ ingredienteId: k, nome: nomes(k), quantidade: q.texto(4), exata: `${q.n}/${q.d}` }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        : [],
      consumoDireto: r.direto
        ? [...r.direto.values()].map((x) => ({ ingredienteId: x.ingredienteId, preparoId: x.preparoId, nome: x.nome, quantidade: x.q.texto(4), exata: `${x.q.n}/${x.q.d}` }))
        : [],
      custoCentavos: centavosSeguros(r),
      custoExato: centavosSeguros(r) === null ? null : r.custo,
      custoParcial: r.custoTemDado && !r.custoCompleto,
      semCusto: [...r.semCusto].map(([ingredienteId, nome]) => ({ ingredienteId, nome })),
    });
  }
  return saida;
}

/** Custo arredondado em centavos, ou nulo sem dado ou grande demais para um número exato. */
function centavosSeguros(r: Interna): number | null {
  if (!r.custoTemDado) return null;
  const c = r.custo.arredondado();
  return c > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(c);
}

/** Percentual do custo sobre o preço, em pontos-base (3125 = 31,25%). Nulo sem custo ou preço. */
export function custoSobrePreco(custoCentavos: number | null, precoCentavos: number | null): number | null {
  if (custoCentavos === null || precoCentavos === null || precoCentavos <= 0) return null;
  return Number(new Fracao(BigInt(custoCentavos) * 10_000n, BigInt(precoCentavos)).arredondado());
}

/** Multiplica a receita ("fazer 2x") sem float: "20.5" x 3 = "61.5". */
export function escalarQuantidade(quantidade: string, vezes: string): string {
  return Fracao.decimal(quantidade).vezes(Fracao.decimal(vezes)).texto(4);
}

// ---------------------------------------------------------------- comparar versões

export type MudancaDaFicha = { tipo: "entrou" | "saiu" | "mudou"; texto: string };

const chaveDoItem = (i: ItemDaFicha) => (i.ingredienteId !== null ? `i${i.ingredienteId}` : `p${i.preparoId}`);
const qtd = (i: ItemDaFicha) => (i.quantidade === null ? "sem quantidade" : `${Fracao.decimal(i.quantidade).texto(4)} ${i.unidade}`);

/** O que mudou de `antes` para `depois`, em frases curtas para a tela. */
export function compararVersoes(antes: VersaoDaFicha, depois: VersaoDaFicha): MudancaDaFicha[] {
  const m: MudancaDaFicha[] = [];
  const a = new Map(antes.itens.map((i) => [chaveDoItem(i), i]));
  const d = new Map(depois.itens.map((i) => [chaveDoItem(i), i]));
  for (const [k, i] of d) {
    const x = a.get(k);
    if (!x) {
      m.push({ tipo: "entrou", texto: `${i.nome}: ${qtd(i)}${i.opcional ? " (opcional)" : ""}` });
      continue;
    }
    const mesmaQtd =
      (x.quantidade === null && i.quantidade === null) ||
      (x.quantidade !== null && i.quantidade !== null && Fracao.decimal(x.quantidade).texto(4) === Fracao.decimal(i.quantidade).texto(4));
    if (!mesmaQtd) m.push({ tipo: "mudou", texto: `${i.nome}: ${qtd(x)} → ${qtd(i)}` });
    if (x.opcional !== i.opcional) m.push({ tipo: "mudou", texto: `${i.nome}: ${i.opcional ? "passou a ser opcional" : "deixou de ser opcional"}` });
    if ((x.medidaCaseira ?? "") !== (i.medidaCaseira ?? ""))
      m.push({ tipo: "mudou", texto: `${i.nome}: medida caseira "${x.medidaCaseira ?? "—"}" → "${i.medidaCaseira ?? "—"}"` });
  }
  for (const [k, x] of a) if (!d.has(k)) m.push({ tipo: "saiu", texto: `${x.nome} (${qtd(x)})` });
  const campo = (rotulo: string, va: string | null, vd: string | null) => {
    if ((va ?? "") !== (vd ?? "")) m.push({ tipo: "mudou", texto: `${rotulo}: ${va ?? "—"} → ${vd ?? "—"}` });
  };
  const dec = (v: string | null) => (v === null ? null : Fracao.decimal(v).texto(4));
  campo("Rende", dec(antes.rende), dec(depois.rende));
  campo(
    "Porção",
    antes.porcaoQuantidade ? `${dec(antes.porcaoQuantidade)} ${antes.porcaoUnidade}` : null,
    depois.porcaoQuantidade ? `${dec(depois.porcaoQuantidade)} ${depois.porcaoUnidade}` : null,
  );
  campo("Tempo (min)", antes.tempoMin?.toString() ?? null, depois.tempoMin?.toString() ?? null);
  campo("Validade (dias)", antes.validadeDias?.toString() ?? null, depois.validadeDias?.toString() ?? null);
  if (JSON.stringify(antes.etapas) !== JSON.stringify(depois.etapas)) m.push({ tipo: "mudou", texto: "Modo de preparo alterado" });
  if (antes.equipamentos.join("|") !== depois.equipamentos.join("|")) m.push({ tipo: "mudou", texto: "Equipamentos alterados" });
  if ((antes.observacoes ?? "") !== (depois.observacoes ?? "")) m.push({ tipo: "mudou", texto: "Observações alteradas" });
  const pa = new Set(antes.pendencias);
  const pd = new Set(depois.pendencias);
  for (const p of pd) if (!pa.has(p)) m.push({ tipo: "entrou", texto: `Pendência: ${p}` });
  for (const p of pa) if (!pd.has(p)) m.push({ tipo: "saiu", texto: `Pendência resolvida: ${p}` });
  return m;
}
