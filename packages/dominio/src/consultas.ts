/** Consultas de leitura: auditoria (RC-17, base). Avisos ficam em avisos.ts. */
import type { Banco } from "@erp/banco";
import { z } from "zod";
import { ErroDeRegra } from "./erros";
import { exigir, type Ator } from "./sessao";

const filtrosAuditoria = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  acao: z.string().max(60).optional(),
  resultado: z.enum(["permitido", "recusado", "falhou"]).optional(),
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  antesDe: z.coerce.number().int().positive().optional(), // paginação: id do último da página anterior
  limite: z.coerce.number().int().min(1).max(200).default(50),
});

export async function consultarAuditoria(db: Banco, ator: Ator | null, filtros: unknown) {
  await exigir(db, ator, "auditoria.ver", { tipo: "auditoria" });
  const parse = filtrosAuditoria.safeParse(filtros);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", "Filtro inválido.");
  const f = parse.data;
  let q = db
    .selectFrom("auditoria")
    .leftJoin("usuario", "usuario.id", "auditoria.usuario_id")
    .select([
      "auditoria.id",
      "auditoria.ocorrido_em as ocorridoEm",
      "auditoria.usuario_id as usuarioId",
      "usuario.nome as usuarioNome",
      "auditoria.acao",
      "auditoria.resultado",
      "auditoria.alvo_tipo as alvoTipo",
      "auditoria.alvo_id as alvoId",
      "auditoria.detalhes",
    ]);
  if (f.usuarioId) q = q.where("auditoria.usuario_id", "=", f.usuarioId);
  if (f.acao) q = q.where("auditoria.acao", "=", f.acao);
  if (f.resultado) q = q.where("auditoria.resultado", "=", f.resultado);
  if (f.de) q = q.where("auditoria.ocorrido_em", ">=", f.de);
  if (f.ate) q = q.where("auditoria.ocorrido_em", "<=", f.ate);
  if (f.antesDe) q = q.where("auditoria.id", "<", String(f.antesDe));
  return q.orderBy("auditoria.id", "desc").limit(f.limite).execute();
}
