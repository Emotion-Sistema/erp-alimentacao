/**
 * Worker: processo separado das telas (decisão 0003). Usa fila durável dentro do
 * PostgreSQL (pg-boss), sem Redis. Sobe, confere o banco e mantém uma fila de
 * verificação; as filas reais (outbox, tickets, avisos) vêm com as etapas E05 e E11.
 * Tarefa agendada (pg-boss `schedule`, que também mora no PostgreSQL): a reavaliação
 * da reposição na virada do dia (E10; decisão 0029), de hora em hora no fuso da loja,
 * com a primeira logo depois da meia-noite dela; e, a cada 5 minutos, o aviso urgente do
 * estoque que ninguém viu sobe para o superior (E10 parte 2, migração 0028); e, de hora em hora, os
 * avisos de validade por lote: "perto do vencimento" e "vencido sem perda" (ideia nº 15, migração 0029).
 */
import { PgBoss } from "pg-boss";
import { criarBanco, urlDoBanco } from "@erp/banco";
import { avisarValidades, reavaliarReposicao, subirAvisosNaoVistos } from "@erp/dominio";

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

// Reposição: lote que vence sem movimento muda a situação do item (decisão 0029). Minuto 1 de toda
// hora, no fuso da loja: 00:01 é logo depois da virada; as outras horas cobrem o worker que estava
// fora (e `missed: once` manda uma só pelas que passaram com ele parado). Duas execuções juntas não
// repetem aviso (a avaliação trava o item); a fila "stately" evita acumular.
const FILA_REPOSICAO = "estoque-reposicao-virada";
const db = criarBanco(urlDoBanco(), 2);
const unidade = await db.selectFrom("unidade").select("fuso_horario").orderBy("id").limit(1).executeTakeFirst();
const fuso = unidade?.fuso_horario ?? "America/Sao_Paulo";
await boss.createQueue(FILA_REPOSICAO, { policy: "stately" });
await boss.work(FILA_REPOSICAO, async () => {
  const r = await reavaliarReposicao(db);
  log("info", "reposição reavaliada (virada do dia)", r);
});
await boss.schedule(FILA_REPOSICAO, "1 * * * *", null, { tz: fuso, missed: "once" });
// Ao subir também (depois de uma implantação ou de uma queda).
await boss.send(FILA_REPOSICAO, null);

// Urgente do estoque não visto em 15 minutos sobe para o superior (RC-18). Cada aviso sobe uma vez
// só (chave primária de aviso_subida, sob uma trava): duas execuções juntas não repetem.
const FILA_SUBIR = "estoque-avisos-subir";
await boss.createQueue(FILA_SUBIR, { policy: "stately" });
await boss.work(FILA_SUBIR, async () => {
  const r = await subirAvisosNaoVistos(db);
  if (r.subiram > 0) log("info", "avisos urgentes subiram para o superior", r);
});
await boss.schedule(FILA_SUBIR, "*/5 * * * *", null, { tz: fuso });
// Validade por lote (D1 e D7): minuto 10 de toda hora. Só avisa com a loja em turno (o aviso vale até o
// fim do turno); cada lote avisa uma vez por área e tipo (chave primária de estoque_lote_aviso, sob uma trava).
const FILA_VALIDADE = "estoque-avisos-validade";
await boss.createQueue(FILA_VALIDADE, { policy: "stately" });
await boss.work(FILA_VALIDADE, async () => {
  const r = await avisarValidades(db);
  if (r.perto + r.vencidos > 0) log("info", "avisos de validade enviados", r);
});
await boss.schedule(FILA_VALIDADE, "10 * * * *", null, { tz: fuso });
await boss.send(FILA_VALIDADE, null);
log("info", "worker no ar", { fuso });

let saindo = false;
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, async () => {
    if (saindo) return;
    saindo = true;
    log("info", `encerrando (${sinal}); terminando o que está em andamento`);
    await boss.stop({ graceful: true, timeout: 20000 });
    await db.destroy();
    process.exit(0);
  });
}
