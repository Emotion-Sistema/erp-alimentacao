/**
 * Dados FICTÍCIOS para desenvolvimento e testes. Nunca roda em produção.
 * Cria a empresa de exemplo, uma unidade, setores e um usuário por cargo.
 */
import { banco, criarBanco, sql, type Banco } from "@erp/banco";
import { CARGOS, CARGOS_DA_ESTACAO } from "./permissoes";
import { hashSenha } from "./senha";

export const SENHA_DE_TESTE = "senha-de-teste-123";
/** Código pessoal fictício de quem trabalha na cozinha (tablet da estação). */
export const CODIGO_DE_TESTE = "2580";

export async function semear(db: Banco): Promise<{ unidadeId: number }> {
  if (process.env.NODE_ENV === "production") throw new Error("Semente de dados fictícios não roda em produção.");
  const existente = await db.selectFrom("unidade").select("id").orderBy("id").executeTakeFirst();
  if (existente) {
    await semearCadastros(db);
    return { unidadeId: existente.id };
  }

  const r = await db.transaction().execute(async (trx) => {
    const empresa = await trx
      .insertInto("empresa")
      .values({ razao_social: "Empresa Exemplo Ltda (fictícia)", nome_fantasia: "Casa Exemplo", cnpj: null })
      .returning("id")
      .executeTakeFirstOrThrow();
    const unidade = await trx
      .insertInto("unidade")
      .values({ empresa_id: empresa.id, nome: "Loja principal" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("turno")
      .values([
        { unidade_id: unidade.id, nome: "Turno 1", inicio: "08:00", fim: "15:30" },
        { unidade_id: unidade.id, nome: "Turno 2", inicio: "15:30", fim: "23:30" },
      ])
      .execute();
    await trx
      .insertInto("setor")
      .values(["Cozinha", "Cafeteria", "Salão", "Caixa"].map((nome) => ({ unidade_id: unidade.id, nome })))
      .execute();
    const senhaHash = await hashSenha(SENHA_DE_TESTE);
    const codigoHash = await hashSenha(CODIGO_DE_TESTE);
    for (const cargo of CARGOS) {
      const daCozinha = (CARGOS_DA_ESTACAO as readonly string[]).includes(cargo);
      const u = await trx
        .insertInto("usuario")
        .values({ nome: `Teste ${cargo.replace("_", " ")}`, login: cargo.replace("_", "."), senha_hash: senhaHash, codigo_hash: daCozinha ? codigoHash : null })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx.insertInto("usuario_perfil").values({ usuario_id: u.id, perfil_codigo: cargo, unidade_id: unidade.id }).execute();
    }
    return { unidadeId: unidade.id };
  });
  await semearCadastros(db);
  return r;
}

/** Fornecedores e ingredientes FICTÍCIOS (sem CPF/CNPJ). Pode rodar de novo: o que já existe pelo nome fica como está. */
async function semearCadastros(db: Banco): Promise<void> {
  const fornecedores = [
    { nome: "Atacado Exemplo (fictício)", contato: "Contato de teste", prazo: 2 },
    { nome: "Laticínios Exemplo (fictício)", contato: "Contato de teste", prazo: 1 },
  ];
  for (const f of fornecedores) {
    await db
      .insertInto("fornecedor")
      .values({ nome: f.nome, contato: f.contato, prazo_entrega_dias: f.prazo })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
  const idDe = async (nome: string) =>
    (await db.selectFrom("fornecedor").select("id").where(sql`lower(btrim(nome))`, "=", nome.toLowerCase()).executeTakeFirstOrThrow()).id;
  const atacado = await idDe(fornecedores[0]!.nome);
  const laticinios = await idDe(fornecedores[1]!.nome);

  type Area = "cozinha" | "bebidas_salao" | "cafeteria";
  const ingredientes: { nome: string; base: "g" | "ml" | "un"; area: Area; fornecedor: number; conversoes: [string, string][] }[] = [
    { nome: "Ovo", base: "un", area: "cozinha", fornecedor: atacado, conversoes: [["caixa", "30"]] },
    { nome: "Leite integral", base: "ml", area: "cafeteria", fornecedor: laticinios, conversoes: [["caixa 12 L", "12000"]] },
    { nome: "Farinha de trigo", base: "g", area: "cozinha", fornecedor: atacado, conversoes: [["saco 25 kg", "25000"]] },
    { nome: "Queijo mussarela", base: "g", area: "cozinha", fornecedor: laticinios, conversoes: [["peça", "3500"]] },
    { nome: "Pão de hambúrguer", base: "un", area: "cozinha", fornecedor: atacado, conversoes: [["pacote", "8"], ["caixa", "48"]] },
    { nome: "Café em grãos", base: "g", area: "cafeteria", fornecedor: atacado, conversoes: [["pacote 1 kg", "1000"]] },
    { nome: "Refrigerante lata", base: "un", area: "bebidas_salao", fornecedor: atacado, conversoes: [["fardo", "12"]] },
    { nome: "Açúcar", base: "g", area: "cafeteria", fornecedor: atacado, conversoes: [["pacote 5 kg", "5000"]] },
  ];
  for (const i of ingredientes) {
    await db
      .insertInto("ingrediente")
      .values({ nome: i.nome, unidade_base: i.base, area_estoque: i.area, fornecedor_id: i.fornecedor })
      .onConflict((oc) => oc.doNothing())
      .execute();
    const { id } = await db.selectFrom("ingrediente").select("id").where(sql`lower(btrim(nome))`, "=", i.nome.toLowerCase()).executeTakeFirstOrThrow();
    for (const [nome, quantidade] of i.conversoes) {
      await db
        .insertInto("ingrediente_conversao")
        .values({ ingrediente_id: id, nome, quantidade_base: quantidade })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }
  await semearProdutos(db);
}

/**
 * Produtos INVENTADOS (nada do cardápio real), nas categorias e tipos que as migrações 0010 e 0011
 * criam. Pode rodar de novo: produto que já existe pelo nome (ativo ou não) fica como está; se a
 * categoria ou o tipo foi renomeado ou desativado, o produto é pulado.
 */
async function semearProdutos(db: Banco): Promise<void> {
  const produtos: { nome: string; categoria: string; tipo: string | null; preco: number; tempo: number | null; descricao: string | null; ordem: number }[] = [
    { nome: "Café expresso", categoria: "Cafeteria", tipo: "Cafeteria", preco: 600, tempo: 3, descricao: "Café curto e encorpado (exemplo).", ordem: 10 },
    { nome: "Pão de queijo", categoria: "Cafeteria", tipo: "Cafeteria", preco: 550, tempo: 5, descricao: null, ordem: 20 },
    { nome: "Prato executivo de frango", categoria: "Almoço", tipo: "Pratos e grelhados", preco: 3290, tempo: 20, descricao: "Arroz, feijão, frango grelhado e salada (exemplo).", ordem: 10 },
    { nome: "Porção de batata frita", categoria: "Porções", tipo: "Pratos e grelhados", preco: 3490, tempo: 15, descricao: null, ordem: 10 },
    { nome: "X-Salada", categoria: "Hambúrgueres", tipo: "Hambúrgueres", preco: 2590, tempo: 12, descricao: "Pão, carne, queijo, alface e tomate (exemplo).", ordem: 10 },
    { nome: "X-Bacon", categoria: "Hambúrgueres", tipo: "Hambúrgueres", preco: 2990, tempo: 14, descricao: null, ordem: 20 },
    { nome: "Coxinha de frango", categoria: "Salgados", tipo: "Cafeteria", preco: 800, tempo: 4, descricao: null, ordem: 10 },
    { nome: "Refrigerante lata", categoria: "Bebidas", tipo: null, preco: 650, tempo: null, descricao: "Gelado, da geladeira (exemplo).", ordem: 10 },
    { nome: "Água mineral 500 ml", categoria: "Bebidas", tipo: null, preco: 400, tempo: null, descricao: null, ordem: 20 },
  ];
  for (const p of produtos) {
    const existe = await db.selectFrom("produto").select("id").where(sql`lower(btrim(nome))`, "=", p.nome.toLowerCase()).executeTakeFirst();
    if (existe) continue;
    const categoria = await db.selectFrom("categoria").select("id").where("nome", "=", p.categoria).where("ativo", "=", true).executeTakeFirst();
    const tipo = p.tipo === null ? null : await db.selectFrom("tipo_producao").select("id").where("nome", "=", p.tipo).where("ativo", "=", true).executeTakeFirst();
    if (!categoria || tipo === undefined) continue;
    await db
      .insertInto("produto")
      .values({ nome: p.nome, descricao: p.descricao, categoria_id: categoria.id, tipo_producao_id: tipo?.id ?? null, preco_centavos: p.preco, tempo_preparo_min: tipo ? p.tempo : null, ordem: p.ordem })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
}

/**
 * SÓ PARA BANCOS DE TESTE (confere o nome do banco; não é exportada pelo pacote): turnos cobrindo o dia todo, para os testes que entregam avisos
 * não dependerem da hora em que rodam. As regras de horário são testadas com horas fixas.
 */
export async function turnosDoDiaTodo(db: Banco, unidadeId: number): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Só para testes.");
  const banco = await sql<{ nome: string }>`SELECT current_database() AS nome`.execute(db);
  if (!/_teste$/.test(banco.rows[0]?.nome ?? "")) throw new Error("turnosDoDiaTodo só roda em banco terminado em _teste.");
  await db.deleteFrom("turno").where("unidade_id", "=", unidadeId).execute();
  await db
    .insertInto("turno")
    .values([
      { unidade_id: unidadeId, nome: "Teste manhã", inicio: "00:00", fim: "12:00" },
      { unidade_id: unidadeId, nome: "Teste tarde", inicio: "12:00", fim: "24:00" },
    ])
    .execute();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = process.env.DATABASE_URL ? criarBanco() : banco();
  await semear(db);
  console.log(`dados fictícios prontos. Logins: um por cargo (ex.: administrador, gerente.geral, caixa). Senha: ${SENHA_DE_TESTE}`);
  console.log(`Cozinha: código pessoal ${CODIGO_DE_TESTE}. Dono e administrador configuram o segundo fator no primeiro acesso.`);
  await db.destroy();
}
