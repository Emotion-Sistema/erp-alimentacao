/**
 * Papéis separados do PostgreSQL (decisão 0014; pendência da decisão 0010). Roda dentro da
 * imagem a cada implantação (infra/homologacao/migrar.sh): (1) cria ou acerta os papéis, como superusuário;
 * (2) aplica as migrações como dono do esquema; (3) dá as permissões. Tudo idempotente.
 *   erp_dono:   dono do esquema; só as migrações usam.
 *   erp_app:    telas e API; lê, grava e altera, NÃO apaga (RC-17) nem muda o esquema.
 *   erp_worker: o mesmo, mais o esquema "fila" (pg-boss), que é dele.
 * As senhas vêm do servidor (/opt/erp/segredos/erp.env) por variável; nunca do Git.
 */
import pg from "pg";
import { migrar } from "./migrar";

const exigir = (nome: string): string => {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não definida.`);
  return v;
};

const PAPEIS = { erp_dono: exigir("ERP_SENHA_DONO"), erp_app: exigir("ERP_SENHA_APP"), erp_worker: exigir("ERP_SENHA_WORKER") };

async function comoAdmin(fn: (c: pg.Client) => Promise<void>) {
  const c = new pg.Client({ connectionString: exigir("URL_ADMIN") });
  await c.connect();
  try {
    await fn(c);
  } finally {
    await c.end();
  }
}

await comoAdmin(async (c) => {
  for (const [papel, senha] of Object.entries(PAPEIS)) {
    const existe = await c.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [papel]);
    // format(%I, %L) no próprio banco: nome e senha nunca são colados no texto pelo script.
    const { rows } = await c.query<{ cmd: string }>(
      "SELECT format('%s ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', $1::text, $2::text, $3::text) AS cmd",
      [existe.rowCount ? "ALTER" : "CREATE", papel, senha],
    );
    await c.query(rows[0]!.cmd);
  }
  await c.query(`
    ALTER DATABASE erp OWNER TO erp_dono;
    ALTER SCHEMA public OWNER TO erp_dono;
    REVOKE ALL ON DATABASE erp FROM PUBLIC;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT CONNECT ON DATABASE erp TO erp_app, erp_worker;
    CREATE SCHEMA IF NOT EXISTS fila AUTHORIZATION erp_worker;`);
});

const feitas = await migrar(exigir("URL_DONO"), () => undefined);
console.log(feitas.length ? `migrações aplicadas: ${feitas.join(", ")}` : "banco já estava na última versão.");

await comoAdmin(async (c) => {
  await c.query(`
    GRANT USAGE ON SCHEMA public TO erp_app, erp_worker;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO erp_app, erp_worker;
    REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM erp_app, erp_worker;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app, erp_worker;
    REVOKE ALL ON migracao_aplicada FROM erp_app, erp_worker;`);
});
console.log("banco pronto: papéis, migrações e permissões conferidos.");
