// Recria o banco de teste de TELA (erp_tela_teste), aplica migrações e dados fictícios.
// Roda antes de subir o app (veja playwright.config.ts). Nunca mexe em outro banco.
import { criarBanco } from "../../../packages/banco/src/index";
import { recriarBancoDeTeste } from "../../../packages/banco/src/migrar";
import { semear } from "../../../packages/dominio/src/semente";

const url = process.env.DATABASE_URL ?? "";
if (!/_teste(\?|$)/.test(url)) throw new Error("DATABASE_URL precisa apontar para um banco que termina em _teste.");
await recriarBancoDeTeste(url);
const db = criarBanco();
await semear(db);
await db.destroy();
console.log("banco de tela pronto");
