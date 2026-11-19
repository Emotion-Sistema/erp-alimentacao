/**
 * Importação de planilha (E07 parte 3; migração 0014; decisão 0020).
 * Dois passos, os dois com `cadastros.gerenciar`:
 *  1. conferirPlanilha: lê o arquivo, entende as colunas e diz, linha por linha, "pronta",
 *     "com erro" (com o motivo e a coluna) ou "já cadastrada". NÃO grava nada.
 *  2. gravarPlanilha: lê o MESMO arquivo de novo, confere tudo de novo no servidor (não confia no
 *     que a tela mostrou) e grava tudo numa transação só: ou tudo, ou nada. A chave da
 *     conferência faz o clique duplo (ou o reenvio) não importar duas vezes.
 * Ingredientes usam a regra do cadastro em lote (gravarLoteDeIngredientes) e da lista colada
 * (lerEmbalagemDoTexto); produtos usam a regra do cadastro de produto (gravarProdutoNaTransacao).
 * A importação nunca cria categoria, tipo de produção nem fornecedor: o que não existe é erro.
 */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import ExcelJS from "exceljs";
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { AREAS_ESTOQUE, NOME_DA_AREA, gravarLoteDeIngredientes, itemDoLote, type AreaEstoque, type ItemDoLote, type UnidadeBase } from "./cadastros";
import { CATALOGO_INGREDIENTES, chaveDeBusca } from "./catalogo-ingredientes";
import { ErroDeRegra } from "./erros";
import {
  CAMPOS,
  LIMITE_DE_BYTES,
  MODELO,
  NOME_DO_TIPO,
  TIPOS_DE_IMPORTACAO,
  letraDaColuna,
  linhasParaCsv,
  resumir,
  sugerirMapa,
  type Conferencia,
  type LinhaConferida,
  type MapaDeColunas,
  type ProblemaDaLinha,
  type ResultadoDaGravacao,
  type TipoDeImportacao,
} from "./importar-comum";
import { lerEmbalagemDoTexto, MAXIMO_POR_LINHA } from "./lista-colada";
import { lerArquivoDePlanilha, type TabelaLida } from "./planilha-ler";
import { travarLista } from "./posicao";
import { gravarProdutoNaTransacao, textoDosCentavos, centavosDoTexto, traduzirErroDoProduto, validarDadosDoProduto, PRECO_MAXIMO_CENTAVOS, TEMPO_DE_PREPARO_MAXIMO, type DadosDoProduto } from "./produtos";
import { exigir, type Ator } from "./sessao";
import { baseDaUnidade, opcaoDeUnidade, type UnidadeParaMostrar } from "./unidades-do-estoque";

export * from "./importar-comum";

// ---------- pedido da tela ----------

const TAMANHO_MAXIMO_BASE64 = Math.ceil(LIMITE_DE_BYTES / 3) * 4;
const esquemaPedido = z.object(
  {
    tipo: z.enum(TIPOS_DE_IMPORTACAO, { error: "Escolha o que vai importar: ingredientes ou produtos." }),
    arquivo: z.object(
      {
        nome: z
          .string({ error: "Falta o nome do arquivo." })
          .trim()
          .min(1, "Falta o nome do arquivo.")
          .max(200, "Nome do arquivo longo demais (máximo 200 letras).")
          .refine((v) => !/\p{Cc}/u.test(v), "Nome do arquivo com caractere inválido."),
        conteudo: z
          .string({ error: "Escolha o arquivo." })
          .max(TAMANHO_MAXIMO_BASE64, `Arquivo grande demais: o máximo é ${LIMITE_DE_BYTES / 1024 / 1024} MB. Divida a planilha em partes.`)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/, "Arquivo em formato inválido. Escolha o arquivo de novo."),
      },
      { error: "Escolha o arquivo." },
    ),
    /** Sem mapa: o servidor sugere pelos nomes do cabeçalho. */
    mapa: z.record(z.string().max(20), z.number().int().min(0).max(49).nullable()).optional(),
    /** Números das linhas da planilha que a pessoa mandou pular. */
    pular: z.array(z.number().int().min(1).max(1_048_576)).max(2000).default([]),
    chave: z.uuid({ error: "Confira a planilha antes de gravar." }).optional(),
  },
  { error: "Pedido em formato inválido." },
);
type Pedido = z.output<typeof esquemaPedido>;

function validarPedido(dados: unknown): Pedido {
  const p = esquemaPedido.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

// ---------- referências do banco ----------

/** Igual à função nome_de_unidade do banco (nome único de produto, categoria e tipo). */
const chaveDoBanco = (t: string) =>
  chaveDeBusca(t)
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/^1 /, "");

type Ref = { id: number; nome: string; ativo: boolean };
type Referencias = {
  categorias: Ref[];
  tipos: (Ref & { area: string })[];
  fornecedores: Ref[];
  /** Chaves dos nomes ATIVOS que já existem no tipo importado. */
  existentes: Set<string>;
};

async function referencias(db: Banco, tipo: TipoDeImportacao): Promise<Referencias> {
  if (tipo === "produtos") {
    const [categorias, tipos, produtos] = await Promise.all([
      db.selectFrom("categoria").select(["id", "nome", "ativo"]).orderBy("ativo", "desc").orderBy("id").execute(),
      db.selectFrom("tipo_producao").select(["id", "nome", "ativo", "area"]).orderBy("ativo", "desc").orderBy("id").execute(),
      db.selectFrom("produto").select("nome").where("ativo", "=", true).execute(),
    ]);
    return { categorias, tipos, fornecedores: [], existentes: new Set(produtos.map((p) => chaveDoBanco(p.nome))) };
  }
  const [fornecedores, ingredientes] = await Promise.all([
    db.selectFrom("fornecedor").select(["id", "nome", "ativo"]).orderBy("ativo", "desc").orderBy("id").execute(),
    db.selectFrom("ingrediente").select("nome").where("ativo", "=", true).execute(),
  ]);
  return { categorias: [], tipos: [], fornecedores, existentes: new Set(ingredientes.map((i) => chaveDeBusca(i.nome))) };
}

/** Acha pelo nome: o ativo primeiro; se só houver desativado, diz isso. */
function acharPeloNome<T extends Ref>(lista: readonly T[], texto: string, chave: (t: string) => string): { achado?: T; desativado?: T } {
  const k = chave(texto);
  const iguais = lista.filter((r) => chave(r.nome) === k);
  const achado = iguais.find((r) => r.ativo);
  return achado ? { achado } : { desativado: iguais[0] };
}

// ---------- leitura de cada campo ----------

const UNIDADES_POR_TEXTO: Record<string, UnidadeParaMostrar> = {};
for (const [codigo, jeitos] of [
  ["kg", ["kg", "kgs", "quilo", "quilos", "kilo", "kilos", "quilograma", "quilogramas", "quilos kg"]],
  ["g", ["g", "gr", "grs", "grama", "gramas", "gramas g"]],
  ["l", ["l", "lt", "lts", "litro", "litros", "litros l"]],
  ["ml", ["ml", "mls", "mililitro", "mililitros", "mililitros ml"]],
  ["un", ["un", "und", "unid", "unidade", "unidades", "unidades un", "pc", "pca", "peca", "pecas"]],
  ["dz", ["dz", "duzia", "duzias", "duzias dz"]],
] as const)
  for (const j of jeitos) UNIDADES_POR_TEXTO[j] = codigo;

function unidadeDoTexto(t: string): UnidadeParaMostrar | null {
  const k = chaveDeBusca(t);
  const dentro = /\(([^)]+)\)/.exec(t)?.[1];
  return UNIDADES_POR_TEXTO[k] ?? (dentro ? (UNIDADES_POR_TEXTO[chaveDeBusca(dentro)] ?? null) : null);
}

const AREAS_POR_TEXTO: Record<string, AreaEstoque> = {};
for (const a of AREAS_ESTOQUE) {
  AREAS_POR_TEXTO[chaveDeBusca(a)] = a;
  AREAS_POR_TEXTO[chaveDeBusca(NOME_DA_AREA[a])] = a;
}
for (const [j, a] of [
  ["alimentos", "cozinha"],
  ["bebidas", "bebidas_salao"],
  ["bebidas salao", "bebidas_salao"],
  ["salao", "bebidas_salao"],
  ["cafe", "cafeteria"],
  ["sorvetes", "sorvete"],
  ["potes de sorvete", "sorvete"],
  ["60 sabores", "sorvete"],
] as const)
  AREAS_POR_TEXTO[j] = a;

/** Escritas que querem dizer "não passa pela produção". */
const SEM_TIPO = new Set(["nao", "nao passa", "nao passa pela producao", "sem producao", "nenhum", "nenhuma", "sem tipo"]);

/** "12", "12 min", "12 minutos" -> 12. Número com vírgula ou outra coisa: null. */
function minutosDoTexto(t: string): number | null {
  const m = /^(\d{1,4})(?:,0+)?\s*(?:min|mins|minuto|minutos)?\.?$/i.exec(t.trim());
  return m ? Number(m[1]) : null;
}

// ---------- conferência de cada linha ----------

type Contexto = {
  tipo: TipoDeImportacao;
  refs: Referencias;
  cabecalhos: string[];
  mapa: MapaDeColunas;
};

/** "Coluna C (Preço)" para a mensagem. */
function nomeDaColuna(ctx: Contexto, campo: string): string | null {
  const i = ctx.mapa[campo];
  if (i === null || i === undefined) return null;
  const cab = ctx.cabecalhos[i]?.slice(0, 40);
  return cab ? `Coluna ${letraDaColuna(i)} (${cab})` : `Coluna ${letraDaColuna(i)}`;
}

type Avaliada = { linha: LinhaConferida; produto?: DadosDoProduto; ingrediente?: ItemDoLote };

function avaliarProduto(ctx: Contexto, celulas: string[], vistos: Map<string, number>, numero: number): Avaliada {
  const valor = (campo: string) => {
    const i = ctx.mapa[campo];
    return i === null || i === undefined ? "" : (celulas[i] ?? "");
  };
  const problemas: ProblemaDaLinha[] = [];
  const erro = (campo: string | null, texto: string) => problemas.push({ coluna: campo ? nomeDaColuna(ctx, campo) : null, texto });
  const nome = valor("nome").replace(/\s+/g, " ");
  const base = { numero, nome: nome.slice(0, 120), avisos: [] as string[], pulada: false };
  if (!nome) erro("nome", "Falta o nome do produto.");
  else if (nome.length < 2) erro("nome", "Nome curto demais (pelo menos 2 letras).");
  else if (nome.length > 60) erro("nome", `Nome com ${nome.length} letras; o máximo é 60.`);
  const chave = chaveDoBanco(nome);
  if (nome && ctx.refs.existentes.has(chave)) return { linha: { ...base, situacao: "ja_existe", resumo: ["Já existe um produto ativo com esse nome"], problemas: [] } };
  if (nome.length >= 2) {
    const antes = vistos.get(chave);
    if (antes) erro("nome", `Repetido: o mesmo produto já está na linha ${antes} da planilha.`);
    else vistos.set(chave, numero);
  }

  const resumo: string[] = [];
  const textoCategoria = valor("categoria");
  let categoriaId: number | undefined;
  if (!textoCategoria) erro("categoria", "Falta a categoria.");
  else {
    const c = acharPeloNome(ctx.refs.categorias, textoCategoria, chaveDoBanco);
    if (c.achado) {
      categoriaId = c.achado.id;
      resumo.push(c.achado.nome);
    } else if (c.desativado) erro("categoria", `A categoria "${c.desativado.nome}" está desativada. Reative em Categorias ou use outra.`);
    else erro("categoria", `Não existe a categoria "${textoCategoria.slice(0, 40)}". Cadastre primeiro em Categorias (a importação não cria categoria).`);
  }

  const textoPreco = valor("preco");
  let precoCentavos: number | undefined;
  if (!textoPreco) erro("preco", "Falta o preço.");
  else {
    const c = centavosDoTexto(textoPreco);
    if (c === null) erro("preco", `Preço inválido: "${textoPreco.slice(0, 20)}". Escreva em reais, com vírgula nos centavos (ex.: 12,50).`);
    else if (c < 1 || c > PRECO_MAXIMO_CENTAVOS) erro("preco", `O preço precisa ser de R$ 0,01 até ${textoDosCentavos(PRECO_MAXIMO_CENTAVOS)}.`);
    else {
      precoCentavos = c;
      resumo.push(textoDosCentavos(c));
    }
  }

  const textoTipo = valor("tipo");
  let tipoProducaoId: number | null = null;
  let tipoOk = true;
  if (textoTipo && !SEM_TIPO.has(chaveDeBusca(textoTipo))) {
    const t = acharPeloNome(ctx.refs.tipos, textoTipo, chaveDoBanco);
    if (t.achado) {
      tipoProducaoId = t.achado.id;
      resumo.push(`Tipo: ${t.achado.nome}`);
    } else {
      tipoOk = false;
      if (t.desativado) erro("tipo", `O tipo de produção "${t.desativado.nome}" está desativado. Reative em Tipos de produção ou use outro.`);
      else erro("tipo", `Não existe o tipo de produção "${textoTipo.slice(0, 40)}". Use um que já existe em Tipos de produção, ou deixe vazio se não passa pela produção.`);
    }
  } else resumo.push("Não passa pela produção");

  const textoTempo = valor("tempo");
  let tempoPreparoMin: number | null = null;
  if (tipoProducaoId !== null || !tipoOk) {
    if (!textoTempo) {
      if (tipoOk) erro("tempo", "Falta o tempo de preparo (o produto passa pela produção).");
    } else {
      const m = minutosDoTexto(textoTempo);
      if (m === null || m < 1 || m > TEMPO_DE_PREPARO_MAXIMO) erro("tempo", `Tempo de preparo inválido: "${textoTempo.slice(0, 20)}". Escreva os minutos, de 1 a ${TEMPO_DE_PREPARO_MAXIMO} (ex.: 12).`);
      else {
        tempoPreparoMin = m;
        resumo.push(`${m} min`);
      }
    }
  } else if (textoTempo) erro("tempo", "Sem tipo de produção não há tempo de preparo. Apague o tempo ou informe o tipo.");

  const descricao = valor("descricao");
  if (descricao.length > 300) erro("descricao", `Descrição com ${descricao.length} letras; o máximo é 300.`);

  if (problemas.length) return { linha: { ...base, situacao: "erro", resumo, problemas } };
  const dados = { nome, categoriaId, precoCentavos, tipoProducaoId, tempoPreparoMin, descricao: descricao || null };
  try {
    return { linha: { ...base, situacao: "ok", resumo, problemas: [] }, produto: validarDadosDoProduto(dados) };
  } catch (e) {
    if (!(e instanceof ErroDeRegra)) throw e;
    return { linha: { ...base, situacao: "erro", resumo, problemas: [{ coluna: null, texto: e.message }] } };
  }
}

function avaliarIngrediente(ctx: Contexto, celulas: string[], vistos: Map<string, number>, numero: number): Avaliada {
  const valor = (campo: string) => {
    const i = ctx.mapa[campo];
    return i === null || i === undefined ? "" : (celulas[i] ?? "");
  };
  const problemas: ProblemaDaLinha[] = [];
  const avisos: string[] = [];
  const erro = (campo: string | null, texto: string) => problemas.push({ coluna: campo ? nomeDaColuna(ctx, campo) : null, texto });
  const nome = valor("nome").replace(/\s+/g, " ");
  const base = { numero, nome: nome.slice(0, 120), pulada: false };
  if (!nome) erro("nome", "Falta o nome do ingrediente.");
  else if (nome.length < 2) erro("nome", "Nome curto demais (pelo menos 2 letras).");
  else if (nome.length > 120) erro("nome", `Nome com ${nome.length} letras; o máximo é 120.`);
  const chave = chaveDeBusca(nome);
  if (nome && ctx.refs.existentes.has(chave)) return { linha: { ...base, avisos: [], situacao: "ja_existe", resumo: ["Já existe um ingrediente ativo com esse nome"], problemas: [] } };
  if (nome.length >= 2) {
    const antes = vistos.get(chave);
    if (antes) erro("nome", `Repetido: o mesmo ingrediente já está na linha ${antes} da planilha.`);
    else vistos.set(chave, numero);
  }
  const doCatalogo = nome ? CATALOGO_INGREDIENTES.find((c) => [c.nome, ...(c.sinonimos ?? [])].some((n) => chaveDeBusca(n) === chave)) : undefined;
  const resumo: string[] = [];

  const textoUnidade = valor("unidade");
  let exibicao: UnidadeParaMostrar | null = null;
  if (textoUnidade) {
    exibicao = unidadeDoTexto(textoUnidade);
    if (!exibicao) erro("unidade", `Unidade "${textoUnidade.slice(0, 20)}" desconhecida. Use kg, g, L, ml, un ou dz.`);
  } else if (doCatalogo) {
    exibicao = doCatalogo.unidadeBase;
    avisos.push(`Unidade vazia: usei a do catálogo (${opcaoDeUnidade(exibicao)?.nome ?? exibicao}).`);
  } else erro("unidade", "Falta a unidade do estoque (kg, g, L, ml, un ou dz).");
  const unidadeBase: UnidadeBase | null = exibicao ? ((baseDaUnidade(exibicao) as UnidadeBase | undefined) ?? null) : null;
  if (exibicao) resumo.push(opcaoDeUnidade(exibicao)?.nome ?? exibicao);

  const textoArea = valor("area");
  let area: AreaEstoque | null = null;
  if (textoArea) {
    area = AREAS_POR_TEXTO[chaveDeBusca(textoArea)] ?? null;
    if (!area) erro("area", `Área "${textoArea.slice(0, 30)}" desconhecida. Use: Alimentos da cozinha, Bebidas do salão, Cafeteria ou Potes de sorvete.`);
  } else if (doCatalogo) {
    area = doCatalogo.area;
    avisos.push(`Área vazia: usei a do catálogo (${NOME_DA_AREA[area]}).`);
  } else erro("area", "Falta a área (Alimentos da cozinha, Bebidas do salão, Cafeteria ou Potes de sorvete).");
  if (area) resumo.push(NOME_DA_AREA[area]);

  const textoFornecedor = valor("fornecedor");
  let fornecedorId: number | null = null;
  if (textoFornecedor) {
    const f = acharPeloNome(ctx.refs.fornecedores, textoFornecedor, chaveDeBusca);
    if (f.achado) {
      fornecedorId = f.achado.id;
      resumo.push(`Fornecedor: ${f.achado.nome}`);
    } else if (f.desativado) erro("fornecedor", `O fornecedor "${f.desativado.nome}" está desativado. Reative em Fornecedores, troque ou deixe vazio.`);
    else erro("fornecedor", `Não existe o fornecedor "${textoFornecedor.slice(0, 40)}". Cadastre primeiro em Fornecedores ou deixe vazio.`);
  }

  const embalagens: { nome: string; quantidadeBase: string }[] = [];
  const pedacos = valor("embalagens")
    .split(/[;|\n]/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (pedacos.length > 10) erro("embalagens", `São ${pedacos.length} embalagens; o máximo é 10 por ingrediente.`);
  else if (unidadeBase) {
    const nomes = new Set<string>();
    for (const p of pedacos) {
      if (p.length > MAXIMO_POR_LINHA) {
        erro("embalagens", `Embalagem longa demais (máximo ${MAXIMO_POR_LINHA} letras).`);
        continue;
      }
      const r = lerEmbalagemDoTexto(p, unidadeBase, nome);
      for (const t of r.erros) erro("embalagens", `"${p.slice(0, 40)}": ${t}`);
      if (r.erros.length) continue;
      if (!r.embalagem) {
        avisos.push(`"${p.slice(0, 40)}" não é embalagem (o sistema já converte sozinho); ignorei.`);
        continue;
      }
      if (r.embalagem.quantidadeBase === null) {
        erro("embalagens", `"${p.slice(0, 40)}": não dá para saber quantas ${unidadeBase} tem. Tire da planilha e cadastre depois na tela do ingrediente.`);
        continue;
      }
      const k = chaveDoBanco(r.embalagem.nome);
      if (nomes.has(k)) {
        erro("embalagens", `A embalagem "${r.embalagem.nome}" aparece duas vezes.`);
        continue;
      }
      nomes.add(k);
      embalagens.push({ nome: r.embalagem.nome, quantidadeBase: r.embalagem.quantidadeBase });
    }
    if (embalagens.length) resumo.push(`Embalagens: ${embalagens.map((e) => e.nome).join(", ")}`);
  }

  if (problemas.length || !unidadeBase || !area) return { linha: { ...base, avisos, situacao: "erro", resumo, problemas } };
  const p = itemDoLote.safeParse({ nome, unidadeBase, unidadeExibicao: exibicao, area, fornecedorId, embalagens });
  if (!p.success) return { linha: { ...base, avisos, situacao: "erro", resumo, problemas: [{ coluna: null, texto: [...new Set(p.error.issues.map((i) => i.message))].join(" ") }] } };
  return { linha: { ...base, avisos, situacao: "ok", resumo, problemas: [] }, ingrediente: p.data };
}

// ---------- conferir (não grava) ----------

type Avaliacao = { conferencia: Omit<Conferencia, "chave">; avaliadas: Avaliada[] };

function conferirMapa(tipo: TipoDeImportacao, mapa: MapaDeColunas | undefined, colunas: number, cabecalhos: string[]): MapaDeColunas {
  if (!mapa) return sugerirMapa(tipo, cabecalhos);
  const campos = CAMPOS[tipo].map((c) => c.campo);
  const usados = new Map<number, string>();
  const saida: MapaDeColunas = {};
  for (const campo of Object.keys(mapa)) if (!campos.includes(campo)) throw new ErroDeRegra("dados_invalidos", `Campo desconhecido no mapa de colunas: ${campo.slice(0, 20)}.`);
  for (const campo of campos) {
    const i = mapa[campo] ?? null;
    if (i !== null && i >= colunas) throw new ErroDeRegra("dados_invalidos", `A coluna ${letraDaColuna(i)} não existe nesta planilha. Escolha de novo.`);
    if (i !== null && usados.has(i)) {
      const rotulo = (c: string) => CAMPOS[tipo].find((x) => x.campo === c)!.rotulo;
      throw new ErroDeRegra("dados_invalidos", `A coluna ${letraDaColuna(i)} foi escolhida para "${rotulo(usados.get(i)!)}" e para "${rotulo(campo)}". Cada coluna vale para um campo só.`);
    }
    if (i !== null) usados.set(i, campo);
    saida[campo] = i;
  }
  return saida;
}

function avaliar(tipo: TipoDeImportacao, tabela: TabelaLida, nomeDoArquivo: string, refs: Referencias, mapaPedido: MapaDeColunas | undefined, pular: readonly number[]): Avaliacao {
  const [cabecalho, ...dados] = tabela.linhas;
  const colunas = Math.max(...tabela.linhas.map((l) => l.celulas.length));
  const cabecalhos = Array.from({ length: colunas }, (_, i) => cabecalho!.celulas[i] ?? "");
  const mapa = conferirMapa(tipo, mapaPedido, colunas, cabecalhos);
  const faltamColunas = CAMPOS[tipo].filter((c) => c.obrigatorio && mapa[c.campo] === null && !(tipo === "ingredientes" && c.campo !== "nome")).map((c) => c.rotulo);
  const ctx: Contexto = { tipo, refs, cabecalhos, mapa };
  const vistos = new Map<string, number>();
  const pulando = new Set(pular);
  const avaliadas = dados.map((l) => {
    const a = tipo === "produtos" ? avaliarProduto(ctx, l.celulas, vistos, l.numero) : avaliarIngrediente(ctx, l.celulas, vistos, l.numero);
    a.linha.pulada = pulando.has(l.numero) && a.linha.situacao !== "ja_existe";
    return a;
  });
  const linhas = avaliadas.map((a) => a.linha);
  return {
    avaliadas,
    conferencia: {
      tipo,
      arquivo: nomeDoArquivo,
      formato: tabela.formato,
      avisos: tabela.avisos,
      linhaDoCabecalho: cabecalho!.numero,
      colunas: cabecalhos.map((texto, indice) => ({ indice, letra: letraDaColuna(indice), texto: texto.slice(0, 80) })),
      mapa,
      faltamColunas,
      linhas,
      resumo: resumir(linhas),
    },
  };
}

function bytesDoPedido(p: Pedido): Uint8Array {
  const b = Buffer.from(p.arquivo.conteudo, "base64");
  if (b.length > LIMITE_DE_BYTES) throw new ErroDeRegra("dados_invalidos", `Arquivo grande demais: o máximo é ${LIMITE_DE_BYTES / 1024 / 1024} MB. Divida a planilha em partes.`);
  return b;
}

/** Passo 1: lê e confere. NADA é gravado (nem a chave: ela só vale quando a gravação acontece). */
export async function conferirPlanilha(db: Banco, ator: Ator | null, dados: unknown): Promise<Conferencia> {
  await exigir(db, ator, "cadastros.gerenciar", { tipo: "importacao_planilha" });
  const p = validarPedido(dados);
  const tabela = await lerArquivoDePlanilha(bytesDoPedido(p), p.arquivo.nome);
  const refs = await referencias(db, p.tipo);
  const { conferencia } = avaliar(p.tipo, tabela, p.arquivo.nome, refs, p.mapa, p.pular);
  return { chave: randomUUID(), ...conferencia };
}

// ---------- gravar (tudo ou nada) ----------

function assinaturaDe(p: Pedido, bytes: Uint8Array, mapa: MapaDeColunas): string {
  const arquivo = createHash("sha256").update(bytes).digest("hex");
  const mapaOrdenado = Object.keys(mapa)
    .sort()
    .map((k) => `${k}=${mapa[k] ?? ""}`)
    .join(",");
  const pular = [...new Set(p.pular)].sort((a, b) => a - b).join(",");
  return createHash("sha256").update(`${p.tipo}\n${arquivo}\n${mapaOrdenado}\n${pular}`).digest("hex");
}

const resultadoDe = (r: { id: number; criados: number; ja_existiam: number; puladas: number }, repetida: boolean): ResultadoDaGravacao => ({
  importacaoId: r.id,
  criados: r.criados,
  jaExistiam: r.ja_existiam,
  puladas: r.puladas,
  repetida,
});

/**
 * Passo 2: grava. Confere tudo de novo (o banco pode ter mudado desde a conferência) e, se
 * sobrar alguma linha com erro que a pessoa não mandou pular, recusa sem gravar nada.
 * A mesma chave com o mesmo pedido devolve o resultado da primeira vez (não importa de novo).
 */
export async function gravarPlanilha(db: Banco, ator: Ator | null, dados: unknown): Promise<ResultadoDaGravacao> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "importacao_planilha" });
  const p = validarPedido(dados);
  if (!p.chave) throw new ErroDeRegra("dados_invalidos", "Confira a planilha antes de gravar.");
  const chave = p.chave;
  const bytes = bytesDoPedido(p);
  const tabela = await lerArquivoDePlanilha(bytes, p.arquivo.nome);
  const jaFeita = async (trx: Banco, assinatura: string) => {
    const ja = await trx.selectFrom("importacao_planilha").select(["id", "assinatura", "criados", "ja_existiam", "puladas"]).where("chave", "=", chave).executeTakeFirst();
    if (ja && ja.assinatura !== assinatura) throw new ErroDeRegra("conflito", "Esta conferência já foi usada para outra importação. Confira a planilha de novo.");
    return ja ? resultadoDe(ja, true) : null;
  };
  try {
    return await db.transaction().execute(async (trx) => {
      // Produtos: a trava da lista vem primeiro, como em toda gravação de produto (posicao.ts).
      if (p.tipo === "produtos") await travarLista(trx, "produto");
      // Mesma chave ao mesmo tempo (clique duplo): a segunda espera a primeira terminar.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${"importacao_planilha:" + chave}))`.execute(trx);
      const refs = await referencias(trx, p.tipo);
      const { conferencia, avaliadas } = avaliar(p.tipo, tabela, p.arquivo.nome, refs, p.mapa, p.pular);
      const assinatura = assinaturaDe(p, bytes, conferencia.mapa);
      const anterior = await jaFeita(trx, assinatura);
      if (anterior) return anterior;

      const comErro = conferencia.linhas.filter((l) => l.situacao === "erro" && !l.pulada);
      if (comErro.length) {
        const exemplos = comErro
          .slice(0, 3)
          .map((l) => `linha ${l.numero}: ${l.problemas[0]?.texto ?? "com erro"}`)
          .join(" ");
        throw new ErroDeRegra("dados_invalidos", `Nada foi gravado: ${comErro.length} linha(s) com erro. ${exemplos} Confira de novo.`);
      }
      const prontas = avaliadas.filter((a) => a.linha.situacao === "ok" && !a.linha.pulada);
      if (!prontas.length) throw new ErroDeRegra("dados_invalidos", `Nada para gravar: nenhuma linha pronta (todas já cadastradas ou puladas).`);

      const extra = { operacao: "importar_planilha", detalhes: { importacao: chave } };
      const ids: number[] = [];
      for (const a of prontas) {
        try {
          if (a.produto) ids.push((await gravarProdutoNaTransacao(trx, quem, a.produto, { ...extra, detalhes: { ...extra.detalhes, linha: a.linha.numero } })).id);
          else ids.push(...(await gravarLoteDeIngredientes(trx, quem, [a.ingrediente!], { ...extra, detalhes: { ...extra.detalhes, linha: a.linha.numero } })));
        } catch (e) {
          let motivo: string;
          try {
            if (p.tipo === "produtos") traduzirErroDoProduto(e);
            throw e;
          } catch (t) {
            if (!(t instanceof ErroDeRegra)) throw t;
            motivo = t.message.replace(/ Nada foi gravado; corrija e tente de novo\.$/, "");
          }
          throw new ErroDeRegra("dados_invalidos", `Nada foi gravado. Linha ${a.linha.numero} (${a.linha.nome}): ${motivo} Confira de novo.`);
        }
      }
      const r = await trx
        .insertInto("importacao_planilha")
        .values({
          chave,
          assinatura,
          tipo: p.tipo,
          arquivo: p.arquivo.nome,
          formato: tabela.formato,
          linhas_lidas: conferencia.resumo.total,
          criados: ids.length,
          ja_existiam: conferencia.resumo.jaExistem,
          puladas: conferencia.resumo.puladas,
          ids,
          usuario_id: quem.usuarioId,
        })
        .returning(["id", "criados", "ja_existiam", "puladas"])
        .executeTakeFirstOrThrow();
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "importacao_planilha",
        alvoId: r.id,
        detalhes: {
          operacao: "importar_planilha",
          tipo: p.tipo,
          arquivo: p.arquivo.nome,
          formato: tabela.formato,
          chave,
          linhasLidas: conferencia.resumo.total,
          criados: r.criados,
          jaExistiam: r.ja_existiam,
          puladas: r.puladas,
          ids,
        },
        ip: quem.ip,
      });
      return resultadoDe(r, false);
    });
  } catch (e) {
    // Garantia final: duas gravações com a mesma chave que passaram juntas pela trava.
    if ((e as { code?: string; constraint?: string }).code === "23505" && (e as { constraint?: string }).constraint === "importacao_planilha_chave") {
      const ja = await db.selectFrom("importacao_planilha").select(["id", "assinatura", "criados", "ja_existiam", "puladas"]).where("chave", "=", chave).executeTakeFirst();
      if (ja) return resultadoDe(ja, true);
    }
    throw e;
  }
}

// ---------- modelo para baixar ----------

export type ArquivoDoModelo = { nome: string; tipoDeConteudo: string; bytes: Uint8Array };

/** Modelo (.xlsx ou .csv) com as colunas certas e 2 linhas de exemplo inventadas. */
export async function modeloDePlanilha(db: Banco, ator: Ator | null, tipo: unknown, formato: unknown): Promise<ArquivoDoModelo> {
  await exigir(db, ator, "cadastros.gerenciar", { tipo: "importacao_planilha" });
  const t = z.enum(TIPOS_DE_IMPORTACAO).safeParse(tipo);
  const f = z.enum(["xlsx", "csv"]).safeParse(formato);
  if (!t.success || !f.success) throw new ErroDeRegra("dados_invalidos", "Escolha o modelo: ingredientes ou produtos, em .xlsx ou .csv.");
  const m = MODELO[t.data];
  const nome = `modelo-${NOME_DO_TIPO[t.data].varios}.${f.data}`;
  if (f.data === "csv") return { nome, tipoDeConteudo: "text/csv; charset=utf-8", bytes: new TextEncoder().encode(linhasParaCsv([m.cabecalhos, ...m.linhas])) };
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet(NOME_DO_TIPO[t.data].varios === "produtos" ? "Produtos" : "Ingredientes");
  aba.addRow([...m.cabecalhos]);
  aba.getRow(1).font = { bold: true };
  // Preço como texto ("32,90"), como a pessoa escreve; o tempo como número inteiro.
  const iTempo = m.cabecalhos.indexOf("Tempo de preparo (min)");
  for (const l of m.linhas) aba.addRow(l.map((v, i) => (i === iTempo && v ? Number(v) : v)));
  m.cabecalhos.forEach((c, i) => (aba.getColumn(i + 1).width = Math.max(14, Math.min(48, c.length + 6, Math.max(...m.linhas.map((l) => (l[i] ?? "").length)) + 4))));
  const b = await livro.xlsx.writeBuffer();
  return { nome, tipoDeConteudo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: new Uint8Array(b as ArrayBuffer) };
}

