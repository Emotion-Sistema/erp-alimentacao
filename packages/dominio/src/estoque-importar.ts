/**
 * Saldo inicial por planilha (E09 parte 2; decisão 0027): o que já há na loja ao começar a usar o
 * sistema. Uma linha por item (ingrediente ou preparo, pelo nome), com quantidade, unidade, local,
 * área, validade, lote e valor (opcionais). Dois passos, como as outras importações:
 *  1. conferir (aplicar = falso): lê, acha cada item e mostra o que vai entrar e os erros de cada
 *     linha, com as células para corrigir ali mesmo no painel (ideia nº 13). Nada é gravado.
 *  2. gravar (aplicar = verdadeiro, com a chave da conferência): confere tudo de novo no servidor e
 *     grava UM movimento "saldo inicial" com todas as linhas boas (ou nada). A mesma chave não
 *     grava duas vezes.
 * Permissão: cuidar da área de cada linha; informar valor exige `custos.ver`.
 */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { AREAS_ESTOQUE, converterParaBase, NOME_DA_AREA, type AreaEstoque } from "./cadastros";
import { chaveDeBusca } from "./catalogo-ingredientes";
import { ErroDeRegra } from "./erros";
import { areasDoAtor, exigirEntradaVisivel, registrarSaldoInicialDaPlanilha } from "./estoque";
import { q4, textoQ4 } from "./estoque-comum";
import { Fracao } from "./fichas-comum";
import { LIMITE_DE_BYTES, letraDaColuna } from "./importar-comum";
import { aplicarCorrecoes, assinaturaDasCorrecoes, correcoesQueValem, esquemaCorrecoes, limitadorDeCelulas, tabelaParaDevolver, type CelulasDevolvidas } from "./planilha-corrigir";
import { lerArquivoDePlanilha } from "./planilha-ler";
import { pode } from "./permissoes";
import { centavosDoTexto } from "./produtos-comum";
import { exigir, type Ator } from "./sessao";

/** Campos da planilha, com os nomes de coluna aceitos (sem acento, minúsculas). */
export const CAMPOS_DO_SALDO_INICIAL = [
  { campo: "item", rotulo: "Item", obrigatorio: true, explicacao: "O nome do ingrediente ou do preparo, como está no cadastro.", exemplo: "Farinha de trigo", apelidos: ["item", "nome", "ingrediente", "insumo", "produto", "preparo", "descricao"] },
  { campo: "quantidade", rotulo: "Quantidade", obrigatorio: true, explicacao: "Quanto há, maior que zero, com até 4 casas depois da vírgula. Sem ponto de milhar.", exemplo: "12,5", apelidos: ["quantidade", "qtd", "qtde", "saldo", "estoque", "quanto tem"] },
  { campo: "unidade", rotulo: "Unidade", obrigatorio: false, explicacao: "kg, g, L, ml, un, dz ou uma embalagem cadastrada no ingrediente (ex.: caixa). Vazia: a unidade do estoque do item.", exemplo: "kg", apelidos: ["unidade", "un", "und", "medida", "unidade de medida"] },
  { campo: "local", rotulo: "Local", obrigatorio: false, explicacao: "Em uso (na cozinha ou no balcão) ou Guardado (depósito, freezer). Vazio: Guardado.", exemplo: "Guardado", apelidos: ["local", "onde", "em uso ou guardado", "nivel"] },
  { campo: "area", rotulo: "Área", obrigatorio: false, explicacao: "Alimentos da cozinha, Bebidas do salão, Cafeteria ou Potes de sorvete. Vazia: a área do cadastro do item.", exemplo: "Cozinha", apelidos: ["area", "area do estoque", "setor"] },
  { campo: "validade", rotulo: "Validade", obrigatorio: false, explicacao: "Último dia em que pode ser usado (dd/mm/aaaa). Vazia: sem validade.", exemplo: "31/12/2026", apelidos: ["validade", "vence", "vencimento", "data de validade"] },
  { campo: "lote", rotulo: "Lote", obrigatorio: false, explicacao: "Código do lote do fabricante (opcional).", exemplo: "L2611", apelidos: ["lote", "codigo do lote"] },
  { campo: "valor", rotulo: "Valor total (R$)", obrigatorio: false, explicacao: "Quanto vale a linha inteira, em reais. Só para quem vê custos. Preencha este OU o preço por unidade.", exemplo: "137,70", apelidos: ["valor", "valor total", "total", "valor r", "valor total r"] },
  { campo: "preco", rotulo: "Preço por unidade (R$)", obrigatorio: false, explicacao: "Preço de 1 unidade da coluna Unidade (ex.: o kg). Só para quem vê custos.", exemplo: "45,90", apelidos: ["preco", "preco unitario", "custo", "custo unitario", "valor unitario", "preco por unidade"] },
] as const;
type Campo = (typeof CAMPOS_DO_SALDO_INICIAL)[number]["campo"];

const TAMANHO_MAXIMO_BASE64 = Math.ceil(LIMITE_DE_BYTES / 3) * 4;
const esquemaPedido = z.object(
  {
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
          .max(TAMANHO_MAXIMO_BASE64, `Arquivo grande demais: o máximo é ${LIMITE_DE_BYTES / 1024 / 1024} MB.`)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/, "Arquivo em formato inválido. Escolha o arquivo de novo."),
      },
      { error: "Escolha o arquivo." },
    ),
    aplicar: z.boolean({ error: "Gravar: sim ou não." }).default(false),
    /** A chave que a conferência devolveu (obrigatória para gravar). */
    chave: z.uuid({ error: "Confira a planilha antes de gravar." }).optional(),
    pular: z.array(z.number().int().min(1).max(1_048_576)).max(2000).default([]),
    correcoes: esquemaCorrecoes,
    devolverTabela: z.boolean({ error: "Devolver a tabela: sim ou não." }).optional(),
  },
  { error: "Pedido em formato inválido." },
);

export type LinhaDoSaldoInicial = {
  numero: number;
  nome: string;
  situacao: "ok" | "erro";
  pulada: boolean;
  /** O que vai entrar ("12,5 kg em Guardado, Cozinha"). */
  resumo: string | null;
  avisos: string[];
  problemas: { coluna: number | null; texto: string }[];
} & Partial<CelulasDevolvidas>;

export type ConferenciaDoSaldoInicial = {
  chave: string;
  arquivo: string;
  aplicado: boolean;
  colunas: { indice: number; letra: string; texto: string }[];
  mapa: Partial<Record<Campo, number>>;
  faltamColunas: string[];
  linhas: LinhaDoSaldoInicial[];
  resumo: { total: number; prontas: number; erros: number; puladas: number };
  /** Opções de cada coluna de escolha (índice da coluna -> valores), para corrigir no painel. */
  opcoes: Record<string, string[]>;
  correcoes: number;
  avisoDasCelulas: string | null;
  /** Já houve saldo inicial antes: gravar de novo SOMA ao estoque. */
  avisoDeRepeticao: string | null;
  tabela?: string[][];
  movimentoId?: string;
  repetido?: boolean;
};

const LOCAIS_POR_TEXTO: Record<string, "em_uso" | "guardado"> = {
  "em uso": "em_uso",
  uso: "em_uso",
  "em_uso": "em_uso",
  linha: "em_uso",
  bancada: "em_uso",
  balcao: "em_uso",
  guardado: "guardado",
  deposito: "guardado",
  reserva: "guardado",
  estoque: "guardado",
  freezer: "guardado",
  camara: "guardado",
};
const AREAS_POR_TEXTO: Record<string, AreaEstoque> = { alimentos: "cozinha", bebidas: "bebidas_salao", salao: "bebidas_salao", "bebidas salao": "bebidas_salao", cafe: "cafeteria", sorvetes: "sorvete", "60 sabores": "sorvete", "potes de sorvete": "sorvete" };
for (const a of AREAS_ESTOQUE) {
  AREAS_POR_TEXTO[chaveDeBusca(a)] = a;
  AREAS_POR_TEXTO[chaveDeBusca(NOME_DA_AREA[a])] = a;
}

/** "31/12/2026", "31/12/26" ou "2026-12-31" -> "2026-12-31"; data que não existe: null. */
function dataDoTexto(t: string): string | null {
  let a: number, m: number, d: number;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t))) [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3]!.length === 2 ? `20${r[3]}` : r[3])];
  else if ((r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Mesmo teto do lançamento (R$ 100 milhões por linha). */
const VALOR_MAXIMO = 10_000_000_000;

const milharAmbiguo = (t: string) => /^\d{1,3}(\.\d{3})+$/.test(t);

type Item = { tipo: "ingrediente" | "preparo"; id: number; nome: string; unidade: string; area: AreaEstoque; ativo: boolean };
type Pronta = { numero: number; item: Item; quantidade: string; unidade?: string; local: "em_uso" | "guardado"; area: AreaEstoque; validade?: string; lote?: string; valorCentavos?: number };

async function carregarItens(db: Banco): Promise<Map<string, Item[]>> {
  const r = await sql<Item>`
    SELECT 'ingrediente' AS tipo, i.id, i.nome, i.unidade_base AS unidade, i.area_estoque AS area, i.ativo FROM ingrediente i
    UNION ALL
    SELECT 'preparo', f.id, f.nome, f.unidade_rendimento, coalesce(e.area_preparo, 'cozinha'), f.ativo
    FROM ficha f LEFT JOIN estoque_item e ON e.preparo_id = f.id WHERE f.tipo = 'preparo'`.execute(db);
  const mapa = new Map<string, Item[]>();
  for (const i of r.rows) mapa.set(chaveDeBusca(i.nome), [...(mapa.get(chaveDeBusca(i.nome)) ?? []), i]);
  return mapa;
}

/** Saldo inicial por planilha: conferir (aplicar = falso) ou gravar (aplicar = verdadeiro). */
export async function importarSaldoInicial(db: Banco, ator: Ator | null, dados: unknown): Promise<ConferenciaDoSaldoInicial> {
  const areasDaPessoa = areasDoAtor(ator);
  if (!ator || areasDaPessoa.length === 0 || ator.segundoFator === "pendente") await exigir(db, ator, "estoque.cozinha", { tipo: "estoque_saldo_inicial" });
  const p = esquemaPedido.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  const d = p.data;
  if (d.aplicar && !d.chave) throw new ErroDeRegra("dados_invalidos", "Confira a planilha antes de gravar.");
  // Resumo do pedido (arquivo, correções e linhas puladas): o reenvio só é "o mesmo" se bater.
  const resumoDoPedido = createHash("sha256")
    .update(createHash("sha256").update(d.arquivo.conteudo).digest("hex"))
    .update(`\n${assinaturaDasCorrecoes(d.correcoes)}\n${[...new Set(d.pular)].sort((a, b) => a - b).join(",")}`)
    .digest("hex")
    .slice(0, 60);
  // Reenvio de uma gravação que já aconteceu (a resposta se perdeu): devolve a gravada, mesmo que o
  // cadastro tenha mudado desde então. Só quem cuida de uma área tocada por ela recebe.
  if (d.aplicar) {
    const ja = await db.selectFrom("estoque_movimento").select(["id", "origem_id"]).where("chave", "=", `planilha:${d.chave}`).executeTakeFirst();
    if (ja && ja.origem_id !== resumoDoPedido) throw new ErroDeRegra("conflito", "Esta conferência já foi gravada com outra planilha ou outras correções. Confira de novo.");
    if (ja) {
      await exigirEntradaVisivel(db, ator, String(ja.id));
      return {
        chave: d.chave!,
        arquivo: d.arquivo.nome.slice(0, 120),
        aplicado: true,
        colunas: [],
        mapa: {},
        faltamColunas: [],
        linhas: [],
        resumo: { total: 0, prontas: 0, erros: 0, puladas: 0 },
        opcoes: {},
        correcoes: 0,
        avisoDasCelulas: null,
        avisoDeRepeticao: null,
        movimentoId: String(ja.id),
        repetido: true,
      };
    }
  }
  const bytes = Buffer.from(d.arquivo.conteudo, "base64");
  if (bytes.length > LIMITE_DE_BYTES) throw new ErroDeRegra("dados_invalidos", `Arquivo grande demais: o máximo é ${LIMITE_DE_BYTES / 1024 / 1024} MB.`);
  const tabela = aplicarCorrecoes(await lerArquivoDePlanilha(bytes, d.arquivo.nome), d.correcoes);
  const [cabecalho, ...dadosDaTabela] = tabela.linhas;
  const largura = Math.max(...tabela.linhas.map((l) => l.celulas.length));
  const cabecalhos = Array.from({ length: largura }, (_, i) => cabecalho?.celulas[i] ?? "");
  // Mapa pelos nomes do cabeçalho: cada coluna para um campo só.
  const mapa: Partial<Record<Campo, number>> = {};
  const usadas = new Set<number>();
  for (const c of CAMPOS_DO_SALDO_INICIAL) {
    const i = cabecalhos.findIndex((h, k) => !usadas.has(k) && [chaveDeBusca(h), chaveDeBusca(h).replace(/ r$/, "")].some((k) => (c.apelidos as readonly string[]).includes(k)));
    if (i >= 0) {
      mapa[c.campo] = i;
      usadas.add(i);
    }
  }
  const faltamColunas = CAMPOS_DO_SALDO_INICIAL.filter((c) => c.obrigatorio && mapa[c.campo] === undefined).map((c) => c.rotulo);
  const comValor = pode(ator!.cargoAtivo, "custos.ver");
  const itens = await carregarItens(db);
  const hoje = (await sql<{ d: string }>`SELECT to_char(hoje_na_loja(), 'YYYY-MM-DD') AS d`.execute(db)).rows[0]!.d;
  const pulando = new Set(d.pular);
  const limitador = limitadorDeCelulas();
  const prontas: Pronta[] = [];
  const linhas: LinhaDoSaldoInicial[] = [];

  for (const l of faltamColunas.length ? [] : dadosDaTabela) {
    const v = (c: Campo) => (mapa[c] === undefined ? "" : (l.celulas[mapa[c]!] ?? "").replace(/\s+/g, " ").trim());
    const problemas: LinhaDoSaldoInicial["problemas"] = [];
    const avisos: string[] = [];
    const erro = (c: Campo | null, texto: string) => problemas.push({ coluna: c === null ? null : (mapa[c] ?? null), texto });
    const nome = v("item");
    let item: Item | undefined;
    if (!nome) erro("item", "Falta o nome do item.");
    else {
      const achados = itens.get(chaveDeBusca(nome)) ?? [];
      const ativos = achados.filter((x) => x.ativo);
      if (ativos.length > 1) erro("item", `"${nome.slice(0, 60)}" é o nome de um ingrediente e de um preparo. Mude o nome de um deles no cadastro.`);
      else if (ativos.length === 1) item = ativos[0];
      else if (achados.length > 1) erro("item", `"${nome.slice(0, 60)}" está desativado e tem mais de um cadastro com esse nome. Reative o certo no cadastro.`);
      else if (achados.length === 1) {
        // O que está na loja tem de ser contado, mesmo desativado no cadastro (decisão 0027).
        item = achados[0];
        avisos.push(`"${achados[0]!.nome}" está desativado no cadastro; o saldo entra assim mesmo.`);
      }
      else erro("item", `Não existe ingrediente nem preparo "${nome.slice(0, 60)}". Cadastre antes ou corrija o nome.`);
    }
    const qTexto = v("quantidade");
    let quantidade: string | null = null;
    if (!qTexto) erro("quantidade", "Falta a quantidade.");
    else if (milharAmbiguo(qTexto)) erro("quantidade", `Quantidade "${qTexto}": escreva sem ponto de milhar (ex.: 1000 ou 1,5).`);
    else {
      const q = q4(qTexto);
      if (q === null || q <= 0n) erro("quantidade", `Quantidade "${qTexto.slice(0, 20)}": use um número maior que zero, com até 4 casas depois da vírgula.`);
      else quantidade = textoQ4(q);
    }
    const unidade = v("unidade") || undefined;
    let base: string | null = null;
    if (item && quantidade) {
      if (!unidade || chaveDeBusca(unidade) === item.unidade) base = quantidade;
      else if (item.tipo === "preparo") erro("unidade", `O preparo "${item.nome}" conta em ${item.unidade}. Use essa unidade.`);
      else
        try {
          base = await converterParaBase(db, item.id, quantidade, unidade);
        } catch (e) {
          if (!(e instanceof ErroDeRegra)) throw e;
          erro("unidade", e.message);
        }
    }
    const lTexto = v("local");
    let local: "em_uso" | "guardado" = "guardado";
    if (lTexto) {
      const achado = LOCAIS_POR_TEXTO[chaveDeBusca(lTexto)];
      if (!achado) erro("local", `Local "${lTexto.slice(0, 30)}": use Em uso ou Guardado.`);
      else local = achado;
    } else avisos.push("Local vazio: entra como Guardado.");
    const aTexto = v("area");
    let area: AreaEstoque | undefined = item?.area;
    if (aTexto) {
      area = AREAS_POR_TEXTO[chaveDeBusca(aTexto)];
      if (!area) erro("area", `Área "${aTexto.slice(0, 30)}": use Alimentos da cozinha, Bebidas do salão, Cafeteria ou Potes de sorvete.`);
    }
    if (area && !areasDaPessoa.includes(area)) erro(aTexto ? "area" : "item", `Você não cuida da área ${NOME_DA_AREA[area]}.`);
    const vTexto = v("validade");
    let validade: string | undefined;
    if (vTexto) {
      const dt = dataDoTexto(vTexto);
      if (!dt) erro("validade", `Validade "${vTexto.slice(0, 20)}": use dd/mm/aaaa.`);
      else {
        if (dt < hoje) avisos.push(`Validade ${vTexto} já passou: entra BLOQUEADO (dê baixa como perda depois).`);
        validade = dt;
      }
    }
    const lote = v("lote") || undefined;
    if (lote && lote.length > 60) erro("lote", "Lote com mais de 60 letras.");
    const valorTexto = v("valor");
    const precoTexto = v("preco");
    let valorCentavos: number | undefined;
    if ((valorTexto || precoTexto) && !comValor) erro(valorTexto ? "valor" : "preco", "Só quem vê custos informa valor. Deixe vazio (o custo fica estimado).");
    else if (valorTexto && precoTexto) erro("preco", "Preencha o valor total OU o preço por unidade, não os dois.");
    else if (valorTexto) {
      const c = centavosDoTexto(valorTexto);
      if (c === null) erro("valor", `Valor "${valorTexto.slice(0, 20)}": em reais, como 137,70.`);
      else if (c > VALOR_MAXIMO) erro("valor", "Valor grande demais (máximo R$ 100 milhões por linha).");
      else valorCentavos = c;
    } else if (precoTexto) {
      const c = centavosDoTexto(precoTexto);
      if (c === null) erro("preco", `Preço "${precoTexto.slice(0, 20)}": em reais, como 45,90.`);
      else if (quantidade) {
        const total = new Fracao(BigInt(c)).vezes(Fracao.decimal(quantidade)).arredondado();
        if (total > BigInt(VALOR_MAXIMO)) erro("preco", "Preço vezes quantidade passa de R$ 100 milhões.");
        else valorCentavos = Number(total);
      }
    }
    const situacao = problemas.length ? "erro" : "ok";
    const unidadeMostrada = unidade ?? item?.unidade ?? "";
    const linha: LinhaDoSaldoInicial = {
      numero: l.numero,
      nome: nome.slice(0, 120),
      situacao,
      pulada: pulando.has(l.numero),
      resumo: situacao === "ok" && item && area ? `${quantidade} ${unidadeMostrada}${base && base !== quantidade ? ` (${base} ${item.unidade})` : ""} em ${local === "em_uso" ? "Em uso" : "Guardado"}, ${NOME_DA_AREA[area]}` : null,
      avisos,
      problemas,
      ...(situacao === "erro" ? limitador.devolver(l.celulas, largura) : {}),
    };
    linhas.push(linha);
    if (situacao === "ok" && !linha.pulada && item && quantidade && area)
      prontas.push({ numero: l.numero, item, quantidade, unidade, local, area, validade, lote, valorCentavos });
  }

  const anterior = await db
    .selectFrom("estoque_movimento as m")
    .innerJoin("usuario as u", "u.id", "m.autor_id")
    .select([sql<string>`to_char(m.criado_em AT TIME ZONE coalesce((SELECT fuso_horario FROM unidade ORDER BY id LIMIT 1), 'America/Sao_Paulo'), 'DD/MM/YYYY')`.as("dia"), "u.nome"])
    .where("m.tipo", "=", "saldo_inicial")
    .orderBy("m.id", "desc")
    .limit(1)
    .executeTakeFirst();
  const indiceDe = (c: Campo) => mapa[c];
  const opcoes: Record<string, string[]> = {};
  if (indiceDe("local") !== undefined) opcoes[String(indiceDe("local"))] = ["Em uso", "Guardado"];
  if (indiceDe("area") !== undefined) opcoes[String(indiceDe("area"))] = AREAS_ESTOQUE.map((a) => NOME_DA_AREA[a]);
  const resumo = {
    total: linhas.length,
    prontas: linhas.filter((x) => x.situacao === "ok" && !x.pulada).length,
    erros: linhas.filter((x) => x.situacao === "erro" && !x.pulada).length,
    puladas: linhas.filter((x) => x.pulada).length,
  };
  const conferencia: ConferenciaDoSaldoInicial = {
    chave: d.chave ?? randomUUID(),
    arquivo: d.arquivo.nome.slice(0, 120),
    aplicado: false,
    colunas: cabecalhos.map((texto, indice) => ({ indice, letra: letraDaColuna(indice), texto: texto.slice(0, 80) })),
    mapa,
    faltamColunas,
    linhas,
    resumo,
    opcoes,
    correcoes: correcoesQueValem(d.correcoes).length,
    avisoDasCelulas: limitador.aviso(),
    avisoDeRepeticao: anterior ? `Já houve saldo inicial em ${anterior.dia} (${anterior.nome}). Gravar de novo SOMA ao estoque que já está no sistema.` : null,
    ...(d.devolverTabela && !d.aplicar ? { tabela: tabelaParaDevolver(tabela) } : {}),
  };
  if (!d.aplicar) return conferencia;

  if (faltamColunas.length) throw new ErroDeRegra("dados_invalidos", `Nada foi gravado: faltam as colunas ${faltamColunas.join(", ")}.`);
  const comErro = linhas.filter((x) => x.situacao === "erro" && !x.pulada);
  if (comErro.length)
    throw new ErroDeRegra(
      "dados_invalidos",
      `Nada foi gravado: ${comErro.length} linha(s) com erro. ${comErro
        .slice(0, 3)
        .map((x) => `Linha ${x.numero}: ${x.problemas[0]?.texto ?? "com erro"}`)
        .join(" ")} Corrija ou pule e grave de novo.`,
    );
  if (!prontas.length) throw new ErroDeRegra("dados_invalidos", "Nada para gravar: nenhuma linha pronta.");
  const r = await registrarSaldoInicialDaPlanilha(db, ator, {
    chave: `planilha:${d.chave}`,
    observacao: `Planilha ${d.arquivo.nome.slice(0, 120)}`,
    itens: prontas.map((x) => ({
      ...(x.item.tipo === "ingrediente" ? { ingredienteId: x.item.id } : { preparoId: x.item.id }),
      quantidade: x.quantidade,
      ...(x.unidade && chaveDeBusca(x.unidade) !== x.item.unidade ? { unidade: x.unidade } : {}),
      local: x.local,
      area: x.area,
      ...(x.validade ? { validade: x.validade } : {}),
      ...(x.lote ? { lote: x.lote } : {}),
      ...(x.valorCentavos !== undefined ? { valorCentavos: x.valorCentavos } : {}),
    })),
  }, resumoDoPedido);
  return { ...conferencia, aplicado: true, movimentoId: r.movimentoId, repetido: r.repetido };
}
