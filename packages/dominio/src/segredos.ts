/**
 * Cifra segredos que precisam ser lidos de volta (ex.: semente do segundo fator).
 * AES-256-GCM do próprio Node; nenhuma criptografia escrita à mão.
 * A chave vem do cofre (ERP_CHAVE_SEGREDOS, 32 bytes em base64). Sem ela, em produção,
 * nada funciona; em desenvolvimento e teste usa uma chave fixa de mentira.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSAO = "v1";

function chave(): Buffer {
  const texto = process.env.ERP_CHAVE_SEGREDOS;
  if (texto) {
    const k = Buffer.from(texto, "base64");
    if (k.length !== 32) throw new Error("ERP_CHAVE_SEGREDOS precisa ter 32 bytes em base64.");
    return k;
  }
  if (process.env.NODE_ENV === "production") throw new Error("ERP_CHAVE_SEGREDOS não configurada (cofre).");
  return createHash("sha256").update("chave-de-desenvolvimento-nao-usar-em-producao").digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [VERSAO, iv.toString("base64"), c.getAuthTag().toString("base64"), dados.toString("base64")].join(".");
}

export function decifrar(guardado: string): string {
  const [versao, iv, tag, dados] = guardado.split(".");
  if (versao !== VERSAO || !iv || !tag || !dados) throw new Error("Segredo guardado em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64")), d.final()]).toString("utf8");
}
