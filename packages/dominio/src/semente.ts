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
