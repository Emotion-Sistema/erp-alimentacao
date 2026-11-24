/**
 * Foto da nota de compra (E09 parte 2; migração 0022; decisão 0027). A nota é digitada à mão na
 * entrada (fornecedor, número, data); a foto fica junto para conferência. Como na foto do produto,
 * o servidor nunca guarda o arquivo como chegou: refaz em WebP, sem dados escondidos. Os limites
 * são outros: nota é comprida e tem letra miúda (até 2000 px, um lado até 10 vezes o outro, 2 MB).
 * Até 5 fotos por entrada; nada se apaga. Vê e anexa quem cuida de uma área tocada pela entrada.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { ErroDeRegra } from "./erros";
import { exigirEntradaVisivel } from "./estoque";
import { decodificarFoto, refazerFoto, QUALIDADES } from "./fotos";
import { type Ator } from "./sessao";

export const FOTOS_POR_NOTA = 5;
const LIMITES_DA_NOTA = {
  ladoMaximo: 2000,
  ladoMinimo: 200,
  proporcaoMaxima: 10,
  gravadaMaxima: 2 * 1024 * 1024,
  detalheDemais: "Foto da nota pesada demais (mais de 2 MB mesmo reduzida). Tire a foto de novo, mais de perto.",
};

const esquema = z.object(
  {
    movimentoId: z
      .union([z.string(), z.number()], { error: "Entrada não encontrada." })
      .transform((v) => String(v))
      .refine((v) => /^[1-9][0-9]{0,17}$/.test(v), "Entrada não encontrada."),
    arquivo: z.string({ error: "Envie a foto da nota." }).min(1, "Envie a foto da nota."),
  },
  { error: "Foto da nota em formato inválido." },
);

export type FotoDaNota = { id: number; movimentoId: string; largura: number; altura: number; bytes: number; repetida: boolean };

/** Anexa a foto da nota a uma entrada. A mesma foto de novo não duplica (devolve a que já está). */
export async function anexarFotoDaNota(db: Banco, ator: Ator | null, dados: unknown): Promise<FotoDaNota> {
  const p = esquema.safeParse(dados);
  if (!p.success) {
    // Permissão antes do formato: quem não cuida de nenhuma área é recusado (e auditado) igual.
    await exigirEntradaVisivel(db, ator, "0").catch((e: unknown) => {
      if (!(e instanceof ErroDeRegra && e.codigo === "nao_encontrado")) throw e;
    });
    throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  }
  const { ator: quem } = await exigirEntradaVisivel(db, ator, p.data.movimentoId);
  // Refaz fora da transação (trabalho pesado não segura trava do banco).
  const foto = await refazerFoto(decodificarFoto(p.data.arquivo), QUALIDADES, LIMITES_DA_NOTA);
  const sha256 = createHash("sha256").update(foto.conteudo).digest("hex");
  return db.transaction().execute(async (trx) => {
    // Uma foto por vez por entrada (o limite de 5 vale com envios ao mesmo tempo).
    await sql`SELECT pg_advisory_xact_lock(hashtext(${"estoque_nota_foto:" + p.data.movimentoId}))`.execute(trx);
    const ja = await trx.selectFrom("estoque_nota_foto").select(["id", "largura", "altura", "conteudo"]).where("movimento_id", "=", p.data.movimentoId).where("sha256", "=", sha256).executeTakeFirst();
    if (ja) return { id: ja.id, movimentoId: p.data.movimentoId, largura: ja.largura, altura: ja.altura, bytes: ja.conteudo.length, repetida: true };
    const n = await trx.selectFrom("estoque_nota_foto").select(sql<number>`count(*)::int`.as("n")).where("movimento_id", "=", p.data.movimentoId).executeTakeFirstOrThrow();
    if (n.n >= FOTOS_POR_NOTA) throw new ErroDeRegra("conflito", `Esta entrada já tem ${FOTOS_POR_NOTA} fotos da nota.`);
    const r = await trx
      .insertInto("estoque_nota_foto")
      .values({ movimento_id: p.data.movimentoId, conteudo: foto.conteudo, largura: foto.largura, altura: foto.altura, sha256, enviada_por: quem.usuarioId })
      .returning("id")
      .executeTakeFirstOrThrow();
    return { id: r.id, movimentoId: p.data.movimentoId, largura: foto.largura, altura: foto.altura, bytes: foto.conteudo.length, repetida: false };
  });
}

/** O arquivo de uma foto de nota, para quem pode ver a entrada. */
export async function arquivoDaFotoDaNota(db: Banco, ator: Ator | null, idDaFoto: unknown): Promise<{ conteudo: Buffer; tipo: "image/webp"; sha256: string }> {
  const texto = typeof idDaFoto === "number" ? String(idDaFoto) : idDaFoto;
  const fotoId = typeof texto === "string" && /^[1-9][0-9]{0,9}$/.test(texto) ? Number(texto) : 0;
  const f = fotoId && fotoId <= 2_147_483_647 ? await db.selectFrom("estoque_nota_foto").select(["movimento_id", "conteudo", "tipo", "sha256"]).where("id", "=", fotoId).executeTakeFirst() : undefined;
  // Sem foto: a permissão é conferida igual (quem não pode não descobre que o número existe).
  await exigirEntradaVisivel(db, ator, f ? String(f.movimento_id) : "0").catch((e: unknown) => {
    if (e instanceof ErroDeRegra && e.codigo === "nao_encontrado") throw new ErroDeRegra("nao_encontrado", "Foto não encontrada.");
    throw e;
  });
  if (!f) throw new ErroDeRegra("nao_encontrado", "Foto não encontrada.");
  return { conteudo: f.conteudo, tipo: f.tipo, sha256: f.sha256 };
}
