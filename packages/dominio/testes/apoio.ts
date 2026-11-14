import { criarBanco, type Banco } from "@erp/banco";
import { entrar, semear, SENHA_DE_TESTE, type Ator } from "../src/index";

export function bancoDeTeste(): Banco {
  return criarBanco(process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste", 5);
}

export async function prepararDados(db: Banco) {
  return semear(db);
}

/** Entra como o usuário fictício do cargo (logins da semente: cargo com "_" trocado por "."). */
export async function atorDoCargo(db: Banco, cargo: string): Promise<Ator> {
  const r = await entrar(db, { login: cargo.replace("_", "."), senha: SENHA_DE_TESTE }, { ip: "127.0.0.1", agente: "teste" });
  return r.ator;
}
