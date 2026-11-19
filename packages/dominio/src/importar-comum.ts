/**
 * Parte da importação de planilha que a TELA também usa (sem banco, sem leitor de arquivo).
 * Decisão 0020. Campos de cada tipo, nomes de coluna aceitos, mapa sugerido, os tipos da
 * conferência e o relatório de erros em .csv.
 */
import { chaveDeBusca } from "./catalogo-ingredientes";

export const TIPOS_DE_IMPORTACAO = ["ingredientes", "produtos"] as const;
export type TipoDeImportacao = (typeof TIPOS_DE_IMPORTACAO)[number];
export const NOME_DO_TIPO: Readonly<Record<TipoDeImportacao, { um: string; varios: string }>> = {
  ingredientes: { um: "ingrediente", varios: "ingredientes" },
  produtos: { um: "produto", varios: "produtos" },
};

export const LIMITE_DE_BYTES = 2 * 1024 * 1024; // 2 MB
export const LIMITE_DE_LINHAS = 2000;
export const LIMITE_DE_COLUNAS = 50;
export const EXTENSOES_ACEITAS = ".xlsx,.csv,.txt,.html,.htm,.xls";

export type CampoDaPlanilha = {
  campo: string;
  rotulo: string;
  obrigatorio: boolean;
  /** Para que serve e como preencher (ajuda do campo na tela). */
  explicacao: string;
  exemplo: string;
  /** Nomes de coluna aceitos, já sem acento e em minúsculas (chaveDoCabecalho). */
  apelidos: readonly string[];
};

export const CAMPOS: Readonly<Record<TipoDeImportacao, readonly CampoDaPlanilha[]>> = {
  ingredientes: [
    {
      campo: "nome",
      rotulo: "Nome",
      obrigatorio: true,
      explicacao: "O nome do ingrediente, de 2 a 120 letras.",
      exemplo: "Farinha de trigo.",
      apelidos: ["nome", "ingrediente", "ingredientes", "insumo", "insumos", "item", "produto", "descricao", "nome do ingrediente", "nome do insumo"],
    },
    {
      campo: "unidade",
      rotulo: "Unidade do estoque",
      obrigatorio: true,
      explicacao: "Como o estoque conta: kg, g, L, ml, un ou dz. Vazia, só vale se o nome estiver no catálogo pronto.",
      exemplo: "kg para farinha; un para ovo; L para leite.",
      apelidos: ["unidade", "unidade do estoque", "unidade de estoque", "unidade de medida", "un", "und", "unid", "medida"],
    },
    {
      campo: "area",
      rotulo: "Área",
      obrigatorio: true,
      explicacao: "Quem cuida: Alimentos da cozinha, Bebidas do salão, Cafeteria ou Potes de sorvete. Vazia, só vale se o nome estiver no catálogo pronto.",
      exemplo: "Cozinha (ou Alimentos da cozinha).",
      apelidos: ["area", "area do estoque", "area de estoque", "setor", "local", "estoque"],
    },
    {
      campo: "fornecedor",
      rotulo: "Fornecedor",
      obrigatorio: false,
      explicacao: "Opcional. O nome de um fornecedor que já está cadastrado em Fornecedores.",
      exemplo: "Atacado Exemplo.",
      apelidos: ["fornecedor", "fornecedor padrao", "distribuidor"],
    },
    {
      campo: "embalagens",
      rotulo: "Embalagens",
      obrigatorio: false,
      explicacao: "Opcional. Como vem da compra; mais de uma separadas por ponto e vírgula (;).",
      exemplo: "saco 25 kg; pacote 1 kg",
      apelidos: ["embalagem", "embalagens", "unidade de compra", "unidades de compra", "como compra", "compra"],
    },
  ],
  produtos: [
    {
      campo: "nome",
      rotulo: "Nome",
      obrigatorio: true,
      explicacao: "Como aparece no cardápio, no caixa e na cozinha. De 2 a 60 letras.",
      exemplo: "X-Salada da casa.",
      apelidos: ["nome", "produto", "produtos", "item", "nome do produto"],
    },
    {
      campo: "categoria",
      rotulo: "Categoria",
      obrigatorio: true,
      explicacao: "O nome de uma categoria que já existe e está ativa. A importação nunca cria categoria.",
      exemplo: "Hambúrgueres.",
      apelidos: ["categoria", "categorias", "grupo", "secao", "categoria do cardapio"],
    },
    {
      campo: "tipo",
      rotulo: "Tipo de produção",
      obrigatorio: false,
      explicacao: "O nome de um tipo de produção ativo (a tela da cozinha). Vazio: não passa pela produção.",
      exemplo: "Hambúrgueres; vazio para refrigerante em lata.",
      apelidos: ["tipo", "tipo de producao", "producao", "tipo producao"],
    },
    {
      campo: "preco",
      rotulo: "Preço (R$)",
      obrigatorio: true,
      explicacao: "Em reais, com vírgula nos centavos. De R$ 0,01 a R$ 9.999,99.",
      exemplo: "25,90",
      apelidos: ["preco", "precos", "valor", "preco r", "valor r", "preco de venda", "valor de venda", "preco venda", "preco unitario", "valor unitario"],
    },
    {
      campo: "tempo",
      rotulo: "Tempo de preparo (min)",
      obrigatorio: false,
      explicacao: "Em minutos, de 1 a 180. Obrigatório quando há tipo de produção; vazio quando não há.",
      exemplo: "12",
      apelidos: ["tempo", "tempo de preparo", "tempo de preparo min", "tempo preparo", "tempo min", "preparo", "preparo min", "minutos"],
    },
    {
      campo: "descricao",
      rotulo: "Descrição",
      obrigatorio: false,
      explicacao: "Opcional. Aparece no site; até 300 letras.",
      exemplo: "Pão brioche, carne de 150 g, queijo, alface e tomate.",
      apelidos: ["descricao", "descricao do produto", "descricao do site", "detalhes", "ingredientes do prato"],
    },
  ],
};

/** Mapa de colunas: para cada campo, o número da coluna (0 = A) ou null (não usar). */
export type MapaDeColunas = Record<string, number | null>;

/** "Preço (R$)" -> "preco r"; "TEMPO DE PREPARO" -> "tempo de preparo". */
export const chaveDoCabecalho = (t: string): string => chaveDeBusca(t);

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function letraDaColuna(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Sugere o mapa pelos nomes do cabeçalho (sem ligar para acento nem maiúscula). Cada coluna serve a um campo só. */
export function sugerirMapa(tipo: TipoDeImportacao, cabecalhos: readonly string[]): MapaDeColunas {
  const chaves = cabecalhos.map(chaveDoCabecalho);
  const usadas = new Set<number>();
  const mapa: MapaDeColunas = {};
  for (const c of CAMPOS[tipo]) {
    // Os apelidos estão em ordem de preferência: "Nome" ganha de "Descrição" para o nome do ingrediente.
    let i = -1;
    for (const a of c.apelidos) {
      i = chaves.findIndex((k, idx) => !usadas.has(idx) && k === a);
      if (i >= 0) break;
    }
    mapa[c.campo] = i >= 0 ? i : null;
    if (i >= 0) usadas.add(i);
  }
  return mapa;
}

// ---------- resultado da conferência ----------

export type SituacaoDaLinha = "ok" | "erro" | "ja_existe";
export type ProblemaDaLinha = { coluna: string | null; texto: string };
export type LinhaConferida = {
  /** Número da linha na planilha (como a pessoa vê no Excel). */
  numero: number;
  situacao: SituacaoDaLinha;
  nome: string;
  /** O que foi entendido, em pedaços curtos ("Hambúrgueres", "R$ 25,90", "12 min"). */
  resumo: string[];
  problemas: ProblemaDaLinha[];
  avisos: string[];
  /** A pessoa marcou para pular (não grava, mesmo se estiver certa). */
  pulada: boolean;
};
export type ColunaLida = { indice: number; letra: string; texto: string };
export type Conferencia = {
  /** Chave desta conferência: vai junto no "Gravar" (clique duplo não importa duas vezes). */
  chave: string;
  tipo: TipoDeImportacao;
  arquivo: string;
  formato: "xlsx" | "csv" | "html";
  avisos: string[];
  linhaDoCabecalho: number;
  colunas: ColunaLida[];
  mapa: MapaDeColunas;
  /** Campos obrigatórios sem coluna escolhida (aí todas as linhas ficam com erro). */
  faltamColunas: string[];
  linhas: LinhaConferida[];
  resumo: Resumo;
};
export type Resumo = { total: number; prontas: number; erros: number; jaExistem: number; puladas: number };
export type ResultadoDaGravacao = { importacaoId: number; criados: number; jaExistiam: number; puladas: number; repetida: boolean };

/** Conta de novo (a tela usa ao marcar ou desmarcar "pular"; o servidor recalcula ao gravar). */
export function resumir(linhas: readonly Pick<LinhaConferida, "situacao" | "pulada">[]): Resumo {
  const r: Resumo = { total: linhas.length, prontas: 0, erros: 0, jaExistem: 0, puladas: 0 };
  for (const l of linhas) {
    if (l.situacao === "ja_existe") r.jaExistem++;
    else if (l.pulada) r.puladas++;
    else if (l.situacao === "ok") r.prontas++;
    else r.erros++;
  }
  return r;
}

/** Pode gravar: nenhuma linha com erro sem estar pulada e pelo menos uma pronta. */
export const podeGravar = (r: Resumo): boolean => r.erros === 0 && r.prontas > 0;

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** "40 prontas, 3 com erro, 2 já cadastradas" (só o que tem). */
export function textoDoResumo(r: Resumo): string {
  const partes = [plural(r.prontas, "pronta", "prontas")];
  if (r.erros) partes.push(`${r.erros.toLocaleString("pt-BR")} com erro`);
  if (r.jaExistem) partes.push(plural(r.jaExistem, "já cadastrada", "já cadastradas"));
  if (r.puladas) partes.push(plural(r.puladas, "pulada", "puladas"));
  return partes.join(", ");
}

export const NOME_DA_SITUACAO: Readonly<Record<SituacaoDaLinha | "pulada", string>> = {
  ok: "Pronta",
  erro: "Com erro",
  ja_existe: "Já cadastrada",
  pulada: "Pulada",
};

// ---------- .csv (relatório e modelo) ----------

/** Célula de .csv com ; e aspas; texto que começa com = + - @ ganha um apóstrofo (não vira fórmula no Excel). */
function celulaCsv(v: string): string {
  const seguro = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}
export const linhasParaCsv = (linhas: readonly (readonly string[])[]): string => "\ufeff" + linhas.map((l) => l.map(celulaCsv).join(";")).join("\r\n") + "\r\n";

/** Relatório para baixar: as linhas com erro e as já cadastradas, com o motivo. */
export function relatorioDeErros(c: Pick<Conferencia, "linhas">): string {
  const linhas = c.linhas.filter((l) => l.situacao !== "ok");
  return linhasParaCsv([
    ["Linha da planilha", "Situação", "Nome", "Coluna", "O que corrigir"],
    ...linhas.flatMap((l) => {
      const sit = l.pulada && l.situacao === "erro" ? `${NOME_DA_SITUACAO.erro} (pulada)` : NOME_DA_SITUACAO[l.situacao];
      if (l.situacao === "ja_existe") return [[String(l.numero), sit, l.nome, "", "Já existe um cadastro ativo com esse nome: a linha será pulada."]];
      return l.problemas.map((p) => [String(l.numero), sit, l.nome, p.coluna ?? "", p.texto]);
    }),
  ]);
}

/** Modelo para baixar: as colunas certas e 2 linhas de exemplo inventadas. */
export const MODELO: Readonly<Record<TipoDeImportacao, { cabecalhos: readonly string[]; linhas: readonly (readonly string[])[] }>> = {
  ingredientes: {
    cabecalhos: ["Nome", "Unidade do estoque", "Área", "Fornecedor", "Embalagens"],
    linhas: [
      ["Farinha de rosca (exemplo)", "kg", "Alimentos da cozinha", "", "saco 5 kg; pacote 500 g"],
      ["Leite condensado (exemplo)", "un", "Cafeteria", "", "caixa com 27"],
    ],
  },
  produtos: {
    cabecalhos: ["Nome", "Categoria", "Tipo de produção", "Preço (R$)", "Tempo de preparo (min)", "Descrição"],
    linhas: [
      ["X-Tudo da casa (exemplo)", "Hambúrgueres", "Hambúrgueres", "32,90", "15", "Pão, carne, ovo, queijo e salada (exemplo)."],
      ["Água com gás 500 ml (exemplo)", "Bebidas", "", "5,50", "", ""],
    ],
  },
};
