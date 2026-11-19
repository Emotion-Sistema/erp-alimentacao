/**
 * Importar fichas técnicas de uma planilha (E08; decisão 0025). Uma linha por item; as fichas
 * se agrupam pela coluna "ficha" (com o tipo). Dois passos, como a importação de cadastros:
 *  1. conferir (aplicar = falso): lê, monta cada ficha e mostra o que vai acontecer e os erros
 *     de cada linha. Nada é gravado.
 *  2. gravar (aplicar = verdadeiro): confere tudo de novo e, se não sobrar erro, grava TUDO numa
 *     transação só (ingredientes novos, preparos em ordem de dependência, depois os produtos),
 *     sob a trava das fichas. Ficha igual à versão atual não ganha versão nova (importar o mesmo
 *     arquivo duas vezes não muda nada).
 * Quantidade vazia vira pendência (a gosto, medida caseira); nunca se inventa peso.
 */
import { z } from "zod";
import { type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { chaveDeBusca } from "./catalogo-ingredientes";
import { ErroDeRegra } from "./erros";
import { Fracao, type UnidadeDaFicha } from "./fichas-comum";
import { gravarFichaNaTransacao, traduzirErroDaFicha, travarFichas, validarDadosDaFicha, type DadosDaFicha } from "./fichas";
import { LIMITE_DE_BYTES } from "./importar-comum";
import { lerArquivoDePlanilha } from "./planilha-ler";
import { nomeComparavel } from "./produtos-comum";
import { exigir, type Ator } from "./sessao";

/** Colunas aceitas (o cabeçalho é comparado sem acento e em minúsculas). */
const COLUNAS = {
  ficha: ["ficha", "nome da ficha", "produto", "receita"],
  tipo: ["tipo"],
  rende: ["rende", "rendimento"],
  unidadeRendimento: ["unidade do rendimento", "unidade rendimento"],
  porcao: ["porcao", "porcao servida"],
  unidadePorcao: ["unidade da porcao", "unidade porcao"],
  tempo: ["tempo (min)", "tempo", "tempo min", "tempo total"],
  validade: ["validade (dias)", "validade", "validade dias"],
  ingrediente: ["ingrediente", "item", "insumo"],
  quantidade: ["quantidade", "qtd", "qtde"],
  unidade: ["unidade", "un"],
  opcional: ["opcional"],
  medidaCaseira: ["medida caseira", "medida"],
  observacao: ["observacao", "obs"],
  pendencia: ["pendencia", "pendencias", "falta"],
  etapa: ["etapa", "modo de preparo", "preparo"],
} as const;
type Coluna = keyof typeof COLUNAS;
const OBRIGATORIAS: Coluna[] = ["ficha", "tipo", "ingrediente", "quantidade", "unidade"];

const FATOR: Record<string, { base: UnidadeDaFicha; fator: string }> = {
  g: { base: "g", fator: "1" },
  kg: { base: "g", fator: "1000" },
  ml: { base: "ml", fator: "1" },
  l: { base: "ml", fator: "1000" },
  un: { base: "un", fator: "1" },
  dz: { base: "un", fator: "12" },
};
const unidadeDoTexto = (t: string): string | null => {
  const k = chaveDeBusca(t).replace(/\s+/g, "");
  const apelidos: Record<string, string> = { gr: "g", grama: "g", gramas: "g", quilo: "kg", kilo: "kg", litro: "l", litros: "l", unidade: "un", unidades: "un", und: "un", duzia: "dz" };
  const u = apelidos[k] ?? k;
  return u in FATOR ? u : null;
};

export type FichaDaPlanilha = {
  nome: string;
  tipo: "produto" | "preparo";
  /** Linha da planilha onde a ficha começa. */
  linha: number;
  acao: "criar" | "nova_versao" | "sem_mudanca" | "erro";
  itens: number;
  pendencias: number;
  erros: { linha: number; texto: string }[];
};
export type ResultadoDaImportacao = {
  arquivo: string;
  aplicado: boolean;
  fichas: FichaDaPlanilha[];
  ingredientesNovos: { nome: string; unidade: UnidadeDaFicha }[];
  /** Erros que não são de uma ficha só (colunas faltando, arquivo). */
  erros: string[];
};

const esquemaPedido = z.object(
  {
    arquivo: z.object({ nome: z.string().min(1).max(200), conteudo: z.string().min(1) }, { error: "Arquivo em formato inválido." }),
    aplicar: z.boolean({ error: "Aplicar: sim ou não." }),
    criarIngredientes: z.boolean({ error: "Criar ingredientes: sim ou não." }).optional(),
    /** Gravar as fichas sem erro e deixar de fora as com erro (e as que usam um preparo com erro). */
    pularComErro: z.boolean({ error: "Pular fichas com erro: sim ou não." }).optional(),
  },
  { error: "Pedido em formato inválido." },
);

type Planejada = {
  chave: string;
  nome: string;
  tipo: "produto" | "preparo";
  linha: number;
  unidadeRendimento: UnidadeDaFicha | null;
  campos: Partial<Record<Coluna, string>>;
  itens: { linha: number; ingrediente: string; quantidade: string | null; unidade: string | null; opcional: boolean; medidaCaseira: string | null; observacao: string | null }[];
  pendencias: string[];
  etapas: string[];
  erros: { linha: number; texto: string }[];
};

/** Lê a planilha e monta as fichas (sem banco). */
function montar(linhas: { numero: number; celulas: string[] }[]): { fichas: Planejada[]; erros: string[] } {
  const [cab, ...dados] = linhas;
  if (!cab) return { fichas: [], erros: ["A planilha está vazia."] };
  const indice: Partial<Record<Coluna, number>> = {};
  cab.celulas.forEach((c, i) => {
    const k = chaveDeBusca(c).replace(/\s+/g, " ").trim();
    for (const [col, nomes] of Object.entries(COLUNAS) as [Coluna, readonly string[]][])
      if (indice[col] === undefined && nomes.includes(k)) indice[col] = i;
  });
  const faltam = OBRIGATORIAS.filter((c) => indice[c] === undefined);
  if (faltam.length) return { fichas: [], erros: [`Faltam colunas: ${faltam.join(", ")}.`] };
  const cel = (l: string[], c: Coluna) => (indice[c] === undefined ? "" : (l[indice[c]!] ?? "").trim());

  const fichas: Planejada[] = [];
  const porChave = new Map<string, Planejada>();
  let atual: Planejada | null = null;
  for (const { numero, celulas } of dados) {
    const nome = cel(celulas, "ficha");
    const tipoTxt = chaveDeBusca(cel(celulas, "tipo"));
    if (nome) {
      const tipo = tipoTxt === "preparo" || tipoTxt === "preparo da casa" ? "preparo" : tipoTxt === "produto" ? "produto" : null;
      if (!tipo) {
        const erro = { linha: numero, texto: `Tipo "${cel(celulas, "tipo")}" desconhecido: use produto ou preparo.` };
        if (atual && nomeComparavel(atual.nome) === nomeComparavel(nome)) atual.erros.push(erro);
        else {
          atual = { chave: `?${numero}`, nome, tipo: "produto", linha: numero, unidadeRendimento: null, campos: {}, itens: [], pendencias: [], etapas: [], erros: [erro] };
          fichas.push(atual);
        }
        continue;
      }
      const chave = `${tipo}:${nomeComparavel(nome)}`;
      const ja = porChave.get(chave);
      if (ja && ja !== atual) {
        ja.erros.push({ linha: numero, texto: `A ficha "${nome}" aparece em dois lugares da planilha; deixe as linhas dela juntas.` });
        atual = ja;
      } else if (!ja) {
        atual = { chave, nome, tipo, linha: numero, unidadeRendimento: null, campos: {}, itens: [], pendencias: [], etapas: [], erros: [] };
        porChave.set(chave, atual);
        fichas.push(atual);
      }
    }
    if (!atual) continue; // linhas antes da primeira ficha
    for (const c of ["rende", "unidadeRendimento", "porcao", "unidadePorcao", "tempo", "validade"] as Coluna[]) {
      const v = cel(celulas, c);
      if (!v) continue;
      if (atual.campos[c] !== undefined && atual.campos[c] !== v)
        atual.erros.push({ linha: numero, texto: `Valor diferente para "${COLUNAS[c][0]}" na mesma ficha.` });
      atual.campos[c] = v;
    }
    const ing = cel(celulas, "ingrediente");
    const qtd = cel(celulas, "quantidade");
    const un = cel(celulas, "unidade");
    if (ing)
      atual.itens.push({
        linha: numero,
        ingrediente: ing,
        quantidade: qtd || null,
        unidade: un || null,
        opcional: ["sim", "s", "x", "opcional"].includes(chaveDeBusca(cel(celulas, "opcional"))),
        medidaCaseira: cel(celulas, "medidaCaseira") || null,
        observacao: cel(celulas, "observacao") || null,
      });
    else if (qtd || un) atual.erros.push({ linha: numero, texto: "Quantidade sem ingrediente." });
    const pend = cel(celulas, "pendencia");
    if (pend) atual.pendencias.push(pend);
    const etapa = cel(celulas, "etapa");
    if (etapa) atual.etapas.push(etapa);
  }
  return { fichas, erros: [] };
}

type Contexto = {
  produtos: Map<string, { id: number; combo: boolean }[]>;
  preparos: Map<string, { id: number; unidade: UnidadeDaFicha }>;
  ingredientes: Map<string, { id: number | null; nome: string; unidade: UnidadeDaFicha }>;
  fichasDoProduto: Map<number, number>;
};

async function contexto(db: Banco): Promise<Contexto> {
  const [prods, preps, ings, fichas] = await Promise.all([
    db.selectFrom("produto").select(["id", "nome", "combo"]).where("ativo", "=", true).execute(),
    db.selectFrom("ficha").select(["id", "nome", "unidade_rendimento"]).where("tipo", "=", "preparo").where("ativo", "=", true).execute(),
    db.selectFrom("ingrediente").select(["id", "nome", "unidade_base"]).where("ativo", "=", true).execute(),
    db.selectFrom("ficha").select(["id", "produto_id"]).where("tipo", "=", "produto").where("ativo", "=", true).execute(),
  ]);
  const produtos = new Map<string, { id: number; combo: boolean }[]>();
  for (const p of prods) produtos.set(nomeComparavel(p.nome), [...(produtos.get(nomeComparavel(p.nome)) ?? []), { id: p.id, combo: p.combo }]);
  return {
    produtos,
    preparos: new Map(preps.map((p) => [nomeComparavel(p.nome!), { id: p.id, unidade: p.unidade_rendimento! }])),
    ingredientes: new Map(ings.map((g) => [nomeComparavel(g.nome), { id: g.id, nome: g.nome, unidade: g.unidade_base }])),
    fichasDoProduto: new Map(fichas.map((f) => [f.produto_id!, f.id])),
  };
}

const decimalOk = (t: string) => /^\d{1,10}([.,]\d{1,4})?$/.test(t.trim()) && /[1-9]/.test(t);
const decimal = (t: string) => t.trim().replace(",", ".");

type Montada = { planejada: Planejada; dados: DadosDaFicha | null; fichaId: number | null; preparoDaPlanilha: string[] };

/** Confere cada ficha contra o banco e monta os dados para `gravarFichaNaTransacao`. */
function conferir(fichas: Planejada[], ctx: Contexto, criarIngredientes: boolean, arquivo: string) {
  const novos = new Map<string, { nome: string; unidade: UnidadeDaFicha }>();
  const preparosDaPlanilha = new Map<string, Planejada>();
  // Unidade de cada preparo ANTES de conferir os itens (um produto pode vir antes do preparo).
  for (const f of fichas) {
    if (f.tipo !== "preparo" || f.erros.length) continue;
    const ja = ctx.preparos.get(nomeComparavel(f.nome));
    const u = f.campos.unidadeRendimento ? unidadeDoTexto(f.campos.unidadeRendimento) : null;
    f.unidadeRendimento = ja?.unidade ?? (u ? FATOR[u]!.base : null);
    preparosDaPlanilha.set(nomeComparavel(f.nome), f);
  }

  const montadas: Montada[] = fichas.map((f) => {
    const erros = f.erros;
    let fichaId: number | null = null;
    const base: Record<string, unknown> = {};
    if (f.tipo === "produto") {
      const achados = ctx.produtos.get(nomeComparavel(f.nome)) ?? [];
      if (achados.length !== 1)
        erros.push({ linha: f.linha, texto: achados.length ? `Há mais de um produto ativo chamado "${f.nome}".` : `Produto "${f.nome}" não encontrado no cardápio (cadastre ou importe os produtos antes).` });
      else if (achados[0]!.combo) erros.push({ linha: f.linha, texto: `"${f.nome}" é combo: combo não tem ficha própria.` });
      else {
        fichaId = ctx.fichasDoProduto.get(achados[0]!.id) ?? null;
        if (!fichaId) Object.assign(base, { tipo: "produto", produtoId: achados[0]!.id });
      }
    } else {
      const u = f.campos.unidadeRendimento ? unidadeDoTexto(f.campos.unidadeRendimento) : null;
      const unidade = u ? FATOR[u]!.base : null;
      const ja = ctx.preparos.get(nomeComparavel(f.nome));
      if (ja) {
        fichaId = ja.id;
        if (unidade && unidade !== ja.unidade) erros.push({ linha: f.linha, texto: `O preparo "${f.nome}" já existe e rende em ${ja.unidade}.` });
        f.unidadeRendimento = ja.unidade;
      } else if (!unidade) erros.push({ linha: f.linha, texto: `Informe a unidade do rendimento do preparo "${f.nome}" (g, ml ou un).` });
      else {
        f.unidadeRendimento = unidade;
        Object.assign(base, { tipo: "preparo", nome: f.nome, unidadeRendimento: unidade });
      }
    }

    // Campos da ficha.
    const num = (c: Coluna, rotulo: string) => {
      const v = f.campos[c];
      if (!v) return null;
      if (!decimalOk(v)) {
        erros.push({ linha: f.linha, texto: `${rotulo} "${v}" não é um número maior que zero.` });
        return null;
      }
      return decimal(v);
    };
    const inteiro = (c: Coluna, rotulo: string) => {
      const v = f.campos[c];
      if (!v) return null;
      if (!/^\d{1,4}$/.test(v)) {
        erros.push({ linha: f.linha, texto: `${rotulo} "${v}" precisa ser um número inteiro.` });
        return null;
      }
      return Number(v);
    };
    let rende = num("rende", "Rende");
    if (rende && f.tipo === "preparo" && f.campos.unidadeRendimento) {
      const u = unidadeDoTexto(f.campos.unidadeRendimento);
      if (u && FATOR[u]!.fator !== "1") rende = Fracao.decimal(rende).vezes(Fracao.decimal(FATOR[u]!.fator)).texto(4);
    }
    const porcao = num("porcao", "Porção");
    const up = f.campos.unidadePorcao ? unidadeDoTexto(f.campos.unidadePorcao) : null;
    if (porcao && !up) erros.push({ linha: f.linha, texto: "Informe a unidade da porção (g, ml ou un)." });
    const porcaoBase = porcao && up ? Fracao.decimal(porcao).vezes(Fracao.decimal(FATOR[up]!.fator)).texto(4) : null;

    // Itens.
    const usados: string[] = [];
    const itens = f.itens.flatMap((i) => {
      const chave = nomeComparavel(i.ingrediente);
      const prep = ctx.preparos.get(chave) ?? (preparosDaPlanilha.has(chave) ? { id: null, unidade: preparosDaPlanilha.get(chave)!.unidadeRendimento } : undefined);
      let alvo: { ingredienteId?: number; preparoId?: number; unidade: UnidadeDaFicha | null; novo?: string } | undefined;
      if (prep && chave !== nomeComparavel(f.nome)) {
        alvo = { preparoId: prep.id ?? -1, unidade: prep.unidade };
        if (prep.id === null) usados.push(chave);
      } else {
        const existente = ctx.ingredientes.get(chave);
        const novo = novos.get(chave);
        if (existente?.id) alvo = { ingredienteId: existente.id, unidade: existente.unidade };
        else if (novo) alvo = { ingredienteId: -1, unidade: novo.unidade, novo: chave };
        else if (criarIngredientes) {
          const u = i.unidade ? unidadeDoTexto(i.unidade) : null;
          if (!u) {
            erros.push({ linha: i.linha, texto: `Ingrediente "${i.ingrediente}" não existe; para criar, informe a unidade (g, kg, ml, l, un).` });
            return [];
          }
          novos.set(chave, { nome: i.ingrediente, unidade: FATOR[u]!.base });
          alvo = { ingredienteId: -1, unidade: FATOR[u]!.base, novo: chave };
        } else {
          erros.push({ linha: i.linha, texto: `Ingrediente "${i.ingrediente}" não está cadastrado.` });
          return [];
        }
      }
      if (!alvo) return [];
      let quantidade: string | null = null;
      if (i.quantidade) {
        const u = i.unidade ? unidadeDoTexto(i.unidade) : null;
        if (!decimalOk(i.quantidade)) erros.push({ linha: i.linha, texto: `Quantidade "${i.quantidade}" não é um número maior que zero (até 4 casas).` });
        else if (!u) erros.push({ linha: i.linha, texto: `Unidade "${i.unidade ?? ""}" desconhecida: use g, kg, ml, l, un ou dz.` });
        else if (!alvo.unidade) erros.push({ linha: i.linha, texto: `O preparo "${i.ingrediente}" está sem a unidade do rendimento.` });
        else if (FATOR[u]!.base !== alvo.unidade)
          erros.push({ linha: i.linha, texto: `"${i.ingrediente}" é contado em ${alvo.unidade}; a planilha diz ${u}.` });
        else {
          quantidade = Fracao.decimal(decimal(i.quantidade)).vezes(Fracao.decimal(FATOR[u]!.fator)).texto(4);
          if (!decimalOk(quantidade)) {
            erros.push({ linha: i.linha, texto: `Quantidade de "${i.ingrediente}" pequena demais.` });
            quantidade = null;
          }
        }
      }
      return [
        {
          ...(alvo.ingredienteId !== undefined ? { ingredienteId: alvo.ingredienteId } : { preparoId: alvo.preparoId }),
          quantidade,
          opcional: i.opcional,
          medidaCaseira: i.medidaCaseira?.slice(0, 60) ?? null,
          observacao: i.observacao?.slice(0, 120) ?? null,
          _chave: alvo.novo ?? (alvo.preparoId === -1 ? `p:${chave}` : null),
        },
      ];
    });

    const receita = {
      rende,
      porcaoQuantidade: porcaoBase,
      porcaoUnidade: porcaoBase ? FATOR[up!]!.base : null,
      tempoMin: inteiro("tempo", "Tempo"),
      validadeDias: inteiro("validade", "Validade"),
      etapas: f.etapas.map((texto) => ({ texto: texto.slice(0, 500) })),
      pendencias: [...new Set(f.pendencias.map((p) => p.slice(0, 200)))],
      motivo: `Importada da planilha ${arquivo}`.slice(0, 200),
      itens,
    };
    return { planejada: f, dados: erros.length ? null : ({ ...base, receita } as unknown as DadosDaFicha), fichaId, preparoDaPlanilha: usados };
  });
  return { montadas, novos };
}

/** Ordem de gravação: preparos antes de quem os usa (os da planilha), depois os produtos. */
function ordenar(montadas: Montada[]): Montada[] | string {
  const preps = montadas.filter((m) => m.planejada.tipo === "preparo");
  const feitos = new Set<string>();
  const ordem: Montada[] = [];
  while (ordem.length < preps.length) {
    const prox = preps.find((m) => !ordem.includes(m) && m.preparoDaPlanilha.every((c) => feitos.has(c) || c === nomeComparavel(m.planejada.nome)));
    if (!prox) return "Há preparos da planilha que usam um ao outro em círculo.";
    ordem.push(prox);
    feitos.add(nomeComparavel(prox.planejada.nome));
  }
  return [...ordem, ...montadas.filter((m) => m.planejada.tipo === "produto")];
}

/** Assinatura da receita para saber se mudou (ids, quantidades e textos). */
const assinatura = (r: Record<string, unknown>) => JSON.stringify(r);

export async function importarFichas(db: Banco, ator: Ator | null, dados: unknown): Promise<ResultadoDaImportacao> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "importacao_fichas" });
  const p = esquemaPedido.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  const bytes = Buffer.from(p.data.arquivo.conteudo, "base64");
  if (bytes.length > LIMITE_DE_BYTES) throw new ErroDeRegra("dados_invalidos", `Arquivo grande demais: o máximo é ${LIMITE_DE_BYTES / 1024 / 1024} MB.`);
  const tabela = await lerArquivoDePlanilha(bytes, p.data.arquivo.nome);
  const { fichas, erros } = montar(tabela.linhas);
  const nomeArq = p.data.arquivo.nome.slice(0, 120);
  const resultado = (aplicado: boolean, montadas: Montada[], novos: Map<string, { nome: string; unidade: UnidadeDaFicha }>, acoes = new Map<Planejada, FichaDaPlanilha["acao"]>()): ResultadoDaImportacao => ({
    arquivo: nomeArq,
    aplicado,
    erros,
    ingredientesNovos: [...novos.values()],
    fichas: montadas.map((m) => ({
      nome: m.planejada.nome,
      tipo: m.planejada.tipo,
      linha: m.planejada.linha,
      acao: m.planejada.erros.length ? "erro" : (acoes.get(m.planejada) ?? (m.fichaId ? "nova_versao" : "criar")),
      itens: m.planejada.itens.length,
      pendencias: m.planejada.pendencias.length,
      erros: m.planejada.erros,
    })),
  });
  if (erros.length) return resultado(false, [], new Map());

  const run = async (trx: Banco, aplicar: boolean) => {
    const ctx = await contexto(trx);
    const { montadas, novos } = conferir(fichas, ctx, p.data.criarIngredientes ?? false, nomeArq);
    const pular = p.data.pularComErro ?? false;
    if (pular) {
      // Quem usa um preparo da planilha que ficou de fora também fica de fora.
      let mudou = true;
      while (mudou) {
        mudou = false;
        const comErro = new Set(montadas.filter((m) => m.planejada.tipo === "preparo" && m.planejada.erros.length).map((m) => nomeComparavel(m.planejada.nome)));
        for (const m of montadas) {
          if (m.planejada.erros.length) continue;
          const ruim = m.preparoDaPlanilha.find((c) => comErro.has(c));
          if (ruim) {
            m.planejada.erros.push({ linha: m.planejada.linha, texto: "Usa um preparo da planilha que tem erro; fica de fora junto." });
            m.dados = null;
            mudou = true;
          }
        }
      }
    }
    const validas = pular ? montadas.filter((m) => !m.planejada.erros.length) : montadas;
    const ordem = ordenar(validas);
    if (typeof ordem === "string") erros.push(ordem);
    const temErro = erros.length > 0 || (!pular && montadas.some((m) => m.planejada.erros.length));
    if (!aplicar || temErro || typeof ordem === "string") return { r: resultado(false, montadas, novos), temErro };

    // Gravar: ingredientes novos, depois as fichas na ordem.
    const idsNovos = new Map<string, number>();
    for (const [chave, n] of novos) {
      const id = (await trx.insertInto("ingrediente").values({ nome: n.nome, unidade_base: n.unidade, area_estoque: "cozinha" }).returning("id").executeTakeFirstOrThrow()).id;
      idsNovos.set(chave, id);
      await auditar(trx, { usuarioId: quem.usuarioId, acao: "cadastros.gerenciar", resultado: "permitido", alvoTipo: "ingrediente", alvoId: id, detalhes: { operacao: "criar", origem: `importação de fichas (${nomeArq})`, nome: n.nome, unidade: n.unidade }, ip: quem.ip });
    }
    const idsPreparos = new Map<string, number>();
    const acoes = new Map<Planejada, FichaDaPlanilha["acao"]>();
    for (const m of ordem) {
      const d = m.dados as unknown as { receita: { itens: (Record<string, unknown> & { _chave: string | null })[] } & Record<string, unknown> } & Record<string, unknown>;
      const itens = d.receita.itens.map(({ _chave, ...i }) => {
        if (_chave?.startsWith("p:")) return { ...i, preparoId: idsPreparos.get(_chave.slice(2)) ?? ctx.preparos.get(_chave.slice(2))?.id };
        if (_chave) return { ...i, ingredienteId: idsNovos.get(_chave) };
        return i;
      });
      const receita = { ...d.receita, itens };
      let fichaId = m.fichaId;
      if (fichaId) {
        const atual = await trx
          .selectFrom("ficha as f")
          .innerJoin("ficha_versao as v", "v.id", "f.versao_atual_id")
          .select(["v.numero", "v.id"])
          .where("f.id", "=", fichaId)
          .executeTakeFirst();
        if (atual && (await mesmaReceita(trx, atual.id, receita))) {
          acoes.set(m.planejada, "sem_mudanca");
          if (m.planejada.tipo === "preparo") idsPreparos.set(nomeComparavel(m.planejada.nome), fichaId);
          continue;
        }
        const dadosFinais = validarDadosDaFicha({ id: fichaId, ...(atual ? { versaoBase: atual.numero } : {}), receita });
        await gravarFichaNaTransacao(trx, quem, dadosFinais);
        acoes.set(m.planejada, "nova_versao");
      } else {
        const { receita: _r, ...resto } = d;
        void _r;
        fichaId = await gravarFichaNaTransacao(trx, quem, validarDadosDaFicha({ ...resto, receita }));
        acoes.set(m.planejada, "criar");
      }
      if (m.planejada.tipo === "preparo") idsPreparos.set(nomeComparavel(m.planejada.nome), fichaId);
    }
    await auditar(trx, {
      usuarioId: quem.usuarioId,
      acao: "cadastros.gerenciar",
      resultado: "permitido",
      alvoTipo: "importacao_fichas",
      detalhes: { arquivo: nomeArq, fichas: ordem.length, ingredientesNovos: novos.size, acoes: Object.fromEntries([...acoes].map(([k, v]) => [k.nome, v])) },
      ip: quem.ip,
    });
    return { r: resultado(true, montadas, novos, acoes), temErro: false };
  };

  if (!p.data.aplicar) return (await run(db, false)).r;
  try {
    return await db.transaction().execute(async (trx) => {
      await travarFichas(trx);
      const { r } = await run(trx, true);
      return r;
    });
  } catch (e) {
    traduzirErroDaFicha(e);
  }
}

/** A versão gravada é igual à receita da planilha? (mesmos itens, quantidades e textos) */
async function mesmaReceita(trx: Banco, versaoId: number, r: Record<string, unknown>): Promise<boolean> {
  const v = await trx.selectFrom("ficha_versao").selectAll().where("id", "=", versaoId).executeTakeFirstOrThrow();
  const itens = await trx.selectFrom("ficha_item").selectAll().where("versao_id", "=", versaoId).orderBy("ordem").execute();
  const pend = await trx.selectFrom("ficha_pendencia").select("texto").where("versao_id", "=", versaoId).orderBy("id").execute();
  const dec = (x: string | null) => (x === null ? null : Fracao.decimal(x).texto(4));
  const gravada = {
    rende: dec(v.rende),
    porcao: dec(v.porcao_quantidade),
    porcaoUnidade: v.porcao_unidade,
    tempo: v.tempo_min,
    validade: v.validade_dias,
    etapas: v.etapas.map((e) => e.texto),
    pendencias: pend.map((x) => x.texto),
    itens: itens.map((i) => [i.ingrediente_id, i.preparo_id, dec(i.quantidade), i.opcional, i.medida_caseira, i.observacao]),
  };
  const ri = r as {
    rende: string | null;
    porcaoQuantidade: string | null;
    porcaoUnidade: string | null;
    tempoMin: number | null;
    validadeDias: number | null;
    etapas: { texto: string }[];
    pendencias: string[];
    itens: { ingredienteId?: number; preparoId?: number; quantidade: string | null; opcional: boolean; medidaCaseira: string | null; observacao: string | null }[];
  };
  const planilha = {
    rende: dec(ri.rende),
    porcao: dec(ri.porcaoQuantidade),
    porcaoUnidade: ri.porcaoUnidade,
    tempo: ri.tempoMin,
    validade: ri.validadeDias,
    etapas: ri.etapas.map((e) => e.texto.replace(/\s+/g, " ").trim()),
    pendencias: ri.pendencias.map((x) => x.replace(/\s+/g, " ").trim()),
    itens: ri.itens.map((i) => [i.ingredienteId ?? null, i.preparoId ?? null, dec(i.quantidade), i.opcional, i.medidaCaseira?.replace(/[ \t]+/g, " ").trim() || null, i.observacao?.replace(/[ \t]+/g, " ").trim() || null]),
  };
  return assinatura(gravada) === assinatura(planilha);
}
