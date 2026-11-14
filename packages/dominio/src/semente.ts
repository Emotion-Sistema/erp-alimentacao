/**
 * Dados FICTÍCIOS para desenvolvimento e testes. Nunca roda em produção.
 * Cria a empresa de exemplo, uma unidade, setores e um usuário por cargo.
 */
import { banco, criarBanco, type Banco } from "@erp/banco";
import { CARGOS } from "./permissoes";
import { hashSenha } from "./senha";

export const SENHA_DE_TESTE = "senha-de-teste-123";

export async function semear(db: Banco): Promise<{ unidadeId: number }> {
  if (process.env.NODE_ENV === "production") throw new Error("Semente de dados fictícios não roda em produção.");
  const existente = await db.selectFrom("unidade").select("id").orderBy("id").executeTakeFirst();
  if (existente) return { unidadeId: existente.id };

  return db.transaction().execute(async (trx) => {
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
      .insertInto("setor")
      .values(["Cozinha", "Cafeteria", "Salão", "Caixa"].map((nome) => ({ unidade_id: unidade.id, nome })))
      .execute();
    const senhaHash = await hashSenha(SENHA_DE_TESTE);
    for (const cargo of CARGOS) {
      const u = await trx
        .insertInto("usuario")
        .values({ nome: `Teste ${cargo.replace("_", " ")}`, login: cargo.replace("_", "."), senha_hash: senhaHash })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx.insertInto("usuario_perfil").values({ usuario_id: u.id, perfil_codigo: cargo, unidade_id: unidade.id }).execute();
    }
    return { unidadeId: unidade.id };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = process.env.DATABASE_URL ? criarBanco() : banco();
  await semear(db);
  console.log(`dados fictícios prontos. Logins: um por cargo (ex.: administrador, gerente.geral, caixa). Senha: ${SENHA_DE_TESTE}`);
  await db.destroy();
}
