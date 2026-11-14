import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { BancoTabelas } from "./tabelas";

// bigint (int8) volta como string no pg; convertemos para number só onde é seguro (ids).
// Dinheiro nunca usa float: colunas de valor são bigint em centavos e são tratadas como string/BigInt.
pg.types.setTypeParser(20, (v) => v);

export type Banco = Kysely<BancoTabelas>;

export function urlDoBanco(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL não definida.");
  }
  return "postgres://erp:erp@localhost:5432/erp";
}

export function criarBanco(url = urlDoBanco(), max = 10): Banco {
  const pool = new pg.Pool({ connectionString: url, max });
  return new Kysely<BancoTabelas>({ dialect: new PostgresDialect({ pool }) });
}

const global = globalThis as unknown as { __erpBanco?: Banco };

/** Conexão única por processo (o Next recarrega módulos em desenvolvimento). */
export function banco(): Banco {
  global.__erpBanco ??= criarBanco();
  return global.__erpBanco;
}
