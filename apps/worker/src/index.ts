/**
 * Worker: processo separado das telas (decisão 0003). Usa fila durável dentro do
 * PostgreSQL (pg-boss), sem Redis. Nesta etapa só sobe, confere o banco e mantém
 * uma fila de verificação; as filas reais (outbox, tickets, avisos) vêm com as
 * etapas E05 e E11.
 */
import { PgBoss } from "pg-boss";
import { urlDoBanco } from "@erp/banco";

const log = (nivel: string, mensagem: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ quando: new Date().toISOString(), processo: "worker", nivel, mensagem, ...extra }));

// No servidor o esquema "fila" já vem criado pela implantação (dono: erp_worker; decisão
// 0014) e o worker não tem permissão de criar esquemas. No desenvolvimento ele cria.
const boss = new PgBoss({ connectionString: urlDoBanco(), schema: "fila", createSchema: process.env.NODE_ENV !== "production" });
boss.on("error", (e) => log("erro", e.message));

await boss.start();
await boss.createQueue("verificacao");
await boss.work("verificacao", async ([tarefa]) => {
  log("info", "verificação recebida", { id: tarefa?.id });
});
await boss.send("verificacao", { em: new Date().toISOString() });
log("info", "worker no ar");

let saindo = false;
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, async () => {
    if (saindo) return;
    saindo = true;
    log("info", `encerrando (${sinal}); terminando o que está em andamento`);
    await boss.stop({ graceful: true, timeout: 20000 });
    process.exit(0);
  });
}
