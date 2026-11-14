import { criarBanco, type Banco } from "@erp/banco";
import { TOTP } from "otpauth";
import { confirmarSegundoFator, entrar, exigeSegundoFator, iniciarSegundoFator, semear, SENHA_DE_TESTE, type Ator } from "../src/index";

export function bancoDeTeste(): Banco {
  return criarBanco(process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste", 5);
}

export async function prepararDados(db: Banco) {
  return semear(db);
}

/** Segredos do segundo fator dos usuários de teste (configurados na primeira entrada). */
const segredos = new Map<number, string>();

export const codigoAgora = (segredo: string) => TOTP.generate({ secret: segredoDe(segredo) });
const segredoDe = (base32: string) => new TOTP({ secret: base32 }).secret;

/**
 * Passa pelo segundo fator como a pessoa faria. Em teste, a mesma pessoa entra várias vezes
 * no mesmo intervalo de 30 s; por isso o "último código usado" é zerado direto no banco
 * (só aqui; no sistema, código repetido é recusado).
 */
export async function passarSegundoFator(db: Banco, ator: Ator): Promise<Ator> {
  let segredo = segredos.get(ator.usuarioId);
  if (!ator.segundoFatorConfigurado || !segredo) {
    if (ator.segundoFatorConfigurado) {
      await db.updateTable("usuario").set({ totp_segredo: null, totp_ultimo_passo: null }).where("id", "=", ator.usuarioId).execute();
      ator = { ...ator, segundoFatorConfigurado: false };
    }
    segredo = (await iniciarSegundoFator(db, ator)).segredo;
    segredos.set(ator.usuarioId, segredo);
  }
  await db.updateTable("usuario").set({ totp_ultimo_passo: null }).where("id", "=", ator.usuarioId).execute();
  return confirmarSegundoFator(db, ator, { codigo: codigoAgora(segredo) });
}

export function segredoDoTeste(usuarioId: number): string | undefined {
  return segredos.get(usuarioId);
}

/** Entra como o usuário fictício do cargo (logins da semente: cargo com "_" trocado por "."). */
export async function atorDoCargo(db: Banco, cargo: string, login = cargo.replace("_", ".")): Promise<Ator> {
  const r = await entrar(db, { login, senha: SENHA_DE_TESTE }, { ip: "127.0.0.1", agente: "teste" });
  return exigeSegundoFator(r.ator.cargos) ? passarSegundoFator(db, r.ator) : r.ator;
}
