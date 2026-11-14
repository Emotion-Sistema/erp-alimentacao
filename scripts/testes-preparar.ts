// Prepara o banco de TESTE antes da suíte: apaga tudo e aplica as migrações.
import { recriarBancoDeTeste } from "../packages/banco/src/migrar";

export default async function preparar() {
  const url = process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste";
  process.env.DATABASE_URL_TESTE = url;
  await recriarBancoDeTeste(url);
}
