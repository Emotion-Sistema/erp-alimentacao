import type { Banco } from "@erp/banco";

export interface RegistroAuditoria {
  usuarioId: number | null;
  acao: string;
  resultado: "permitido" | "recusado" | "falhou";
  alvoTipo?: string;
  alvoId?: string | number;
  detalhes?: Record<string, unknown>;
  ip?: string | null;
}

/** Grava na auditoria (só inserção; o banco recusa alterar ou apagar). */
export async function auditar(db: Banco, r: RegistroAuditoria): Promise<void> {
  await db
    .insertInto("auditoria")
    .values({
      usuario_id: r.usuarioId,
      acao: r.acao,
      resultado: r.resultado,
      alvo_tipo: r.alvoTipo ?? null,
      alvo_id: r.alvoId === undefined ? null : String(r.alvoId),
      detalhes: JSON.stringify(r.detalhes ?? {}),
      ip: r.ip ?? null,
    })
    .execute();
}
