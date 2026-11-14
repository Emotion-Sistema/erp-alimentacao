import { hash, verify } from "@node-rs/argon2";

// Argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB, 2 passagens).
const OPCOES = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const SENHA_MINIMO = 10;

export function hashSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES);
}

export async function conferirSenha(hashGravado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashGravado, senha);
  } catch {
    return false;
  }
}

// Usado quando o login não existe, para a resposta levar o mesmo tempo (não revela quem existe).
let hashFalso: Promise<string> | undefined;
export function hashParaTempoConstante(): Promise<string> {
  hashFalso ??= hashSenha("senha-que-nao-existe-" + Math.random());
  return hashFalso;
}
