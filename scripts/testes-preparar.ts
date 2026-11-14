// Prepara o banco de TESTE antes da suíte: apaga tudo, aplica as migrações e cria os dados
// fictícios com turnos cobrindo o dia todo (os testes rodam a qualquer hora).
import { criarBanco } from "../packages/banco/src/index";
import { recriarBancoDeTeste } from "../packages/banco/src/migrar";
import { semear, turnosDoDiaTodo } from "../packages/dominio/src/semente";

export default async function preparar() {
  const url = process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste";
  process.env.DATABASE_URL_TESTE = url;
  await recriarBancoDeTeste(url);
  const db = criarBanco(url, 2);
  try {
    const { unidadeId } = await semear(db);
    await turnosDoDiaTodo(db, unidadeId);
  } finally {
    await db.destroy();
  }
}
