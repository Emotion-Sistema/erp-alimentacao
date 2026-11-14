import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const PASTA = join(dirname(fileURLToPath(import.meta.url)), "..", "migracoes");
const TRAVA = 4815162342; // trava consultiva: duas execuções ao mesmo tempo esperam uma a outra

interface Migracao {
  versao: string;
  nome: string;
  subir: string;
  descer: string | null;
}

export async function listarMigracoes(): Promise<Migracao[]> {
  const arquivos = (await readdir(PASTA)).sort();
  const lista: Migracao[] = [];
  for (const arq of arquivos) {
    const m = /^(\d{4})_(.+)\.up\.sql$/.exec(arq);
    if (!m) continue;
    const [, versao, nome] = m as unknown as [string, string, string];
    const descerArq = `${versao}_${nome}.down.sql`;
    lista.push({
      versao,
      nome,
      subir: await readFile(join(PASTA, arq), "utf8"),
      descer: arquivos.includes(descerArq) ? await readFile(join(PASTA, descerArq), "utf8") : null,
    });
  }
  return lista;
}

async function comTrava<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("SELECT pg_advisory_lock($1)", [TRAVA]);
    await c.query(`CREATE TABLE IF NOT EXISTS migracao_aplicada (
      versao text PRIMARY KEY, nome text NOT NULL, aplicada_em timestamptz NOT NULL DEFAULT now())`);
    return await fn(c);
  } finally {
    await c.query("SELECT pg_advisory_unlock($1)", [TRAVA]).catch(() => undefined);
    await c.end();
  }
}

/** Aplica, em ordem, as migrações ainda não aplicadas. Cada uma em sua transação. */
export async function migrar(url: string, log = console.log): Promise<string[]> {
  const todas = await listarMigracoes();
  return comTrava(url, async (c) => {
    const feitas = new Set((await c.query("SELECT versao FROM migracao_aplicada")).rows.map((r) => r.versao));
    const aplicadas: string[] = [];
    for (const m of todas) {
      if (feitas.has(m.versao)) continue;
      await c.query("BEGIN");
      try {
        await c.query(m.subir);
        await c.query("INSERT INTO migracao_aplicada (versao, nome) VALUES ($1, $2)", [m.versao, m.nome]);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw new Error(`Migração ${m.versao}_${m.nome} falhou: ${(e as Error).message}`, { cause: e });
      }
      log(`migração aplicada: ${m.versao}_${m.nome}`);
      aplicadas.push(m.versao);
    }
    return aplicadas;
  });
}

/** Reverte a última migração aplicada. Recusado em produção. */
export async function reverterUltima(url: string, log = console.log): Promise<string | null> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Reversão de migração em produção exige procedimento manual (skill migracao-segura).");
  }
  const todas = await listarMigracoes();
  return comTrava(url, async (c) => {
    const r = await c.query("SELECT versao FROM migracao_aplicada ORDER BY versao DESC LIMIT 1");
    const versao: string | undefined = r.rows[0]?.versao;
    if (!versao) return null;
    const m = todas.find((x) => x.versao === versao);
    if (!m?.descer) throw new Error(`Migração ${versao} não tem arquivo de reversão.`);
    await c.query("BEGIN");
    try {
      if (process.env.ERP_CONFIRMO_APAGAR_AUDITORIA === "sim") {
        await c.query("SET LOCAL erp.confirmo_apagar_auditoria = 'sim'");
      }
      await c.query(m.descer);
      await c.query("DELETE FROM migracao_aplicada WHERE versao = $1", [versao]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
    log(`migração revertida: ${m.versao}_${m.nome}`);
    return versao;
  });
}

/** Apaga TUDO e recria o esquema. Só aceita banco cujo nome termina em _teste. */
/** Cria o banco de teste se ele ainda não existe (ex.: no CI). Só para nomes terminados em _teste. */
async function criarBancoSeFaltar(url: string): Promise<void> {
  const endereco = new URL(url);
  const nome = decodeURIComponent(endereco.pathname.slice(1));
  if (!/^[a-z0-9_]+_teste$/.test(nome)) throw new Error("Nome de banco de teste inválido.");
  endereco.pathname = "/postgres";
  const c = new pg.Client({ connectionString: endereco.toString() });
  await c.connect();
  try {
    const existe = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [nome]);
    if (existe.rowCount === 0) await c.query(`CREATE DATABASE "${nome}"`);
  } finally {
    await c.end();
  }
}

export async function recriarBancoDeTeste(url: string): Promise<void> {
  if (!/_teste(\?|$)/.test(url)) throw new Error("Por segurança, o banco de teste precisa terminar em _teste.");
  await criarBancoSeFaltar(url);
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  } finally {
    await c.end();
  }
  await migrar(url, () => undefined);
}
