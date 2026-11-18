/**
 * Tipos de produção (RC-10 seção 1; migração 0011; decisão 0017).
 * Cada produto terá um tipo; as telas da cozinha (E14) filtram por tipo. Cada tipo é de uma
 * área (cozinha ou cafeteria) e tem uma capacidade (itens ao mesmo tempo, para a estimativa).
 * Quem vê: `cadastros.ver`. Quem cria e altera: `cadastros.gerenciar`.
 * Tudo na auditoria com antes e depois; nada se apaga (tipo fora de uso fica inativo).
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { reposicionar } from "./posicao";
import { exigir, type Ator } from "./sessao";
import { AREAS_DE_PRODUCAO, CAPACIDADE_MAXIMA, type TipoDeProducao } from "./tipos-producao-comum";

export * from "./tipos-producao-comum";

const esquemaTipo = z.object({
  id: z.number().int().positive().optional(),
  nome: z
    .string({ error: "Informe o nome do tipo." })
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(2, "Nome com pelo menos 2 letras.").max(40, "Nome com no máximo 40 letras.").refine((v) => !/\p{Cc}/u.test(v), "Nome com caractere inválido."))
    .optional(),
  area: z.enum(AREAS_DE_PRODUCAO, { error: "Área: cozinha ou cafeteria." }).optional(),
  capacidade: z
    .number({ error: "Capacidade: um número inteiro." })
    .int("Capacidade: um número inteiro.")
    .min(1, "Capacidade de pelo menos 1 item ao mesmo tempo.")
    .max(CAPACIDADE_MAXIMA, `Capacidade de até ${CAPACIDADE_MAXIMA} itens ao mesmo tempo.`)
    .optional(),
  ordem: z.number().int().min(0).max(9999).optional(),
  /** Lugar na lista (1 = primeiro) entre os ativos; o sistema renumera a ordem. Vence `ordem`. */
  posicao: z.number({ error: "Posição: um número inteiro." }).int("Posição: um número inteiro.").min(1, "Posição de 1 em diante.").max(9999).optional(),
  ativo: z.boolean().optional(),
});

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

const colunas = ["id", "nome", "area", "capacidade", "ordem", "ativo"] as const;

export async function listarTiposDeProducao(db: Banco, ator: Ator | null): Promise<TipoDeProducao[]> {
  await exigir(db, ator, "cadastros.ver", { tipo: "tipo_producao" });
  return db.selectFrom("tipo_producao").select(colunas).orderBy("ativo", "desc").orderBy("ordem").orderBy("nome").orderBy("id").execute();
}

/**
 * Cria (sem id; nome e área obrigatórios) ou altera (com id). Na alteração, campo ausente
 * fica como está: desativar manda só `{ id, ativo }` e não desfaz a mudança de outra pessoa.
 */
export async function salvarTipoDeProducao(db: Banco, ator: Ator | null, dados: unknown): Promise<TipoDeProducao> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "tipo_producao" });
  const d = validar(esquemaTipo, dados);
  if (!d.id) {
    const faltam = [d.nome === undefined ? "Informe o nome do tipo." : null, d.area === undefined ? "Área: cozinha ou cafeteria." : null].filter(Boolean);
    if (faltam.length) throw new ErroDeRegra("dados_invalidos", faltam.join(" "));
  }
  const valores = {
    ...(d.nome === undefined ? {} : { nome: d.nome }),
    ...(d.area === undefined ? {} : { area: d.area }),
    ...(d.capacidade === undefined ? {} : { capacidade: d.capacidade }),
    ...(d.ordem === undefined ? {} : { ordem: d.ordem }),
    ...(d.ativo === undefined ? {} : { ativo: d.ativo }),
  };
  try {
    return await db.transaction().execute(async (trx) => {
      let antes: TipoDeProducao | undefined;
      let s: TipoDeProducao;
      if (d.id) {
        antes = await trx.selectFrom("tipo_producao").select(colunas).where("id", "=", d.id).forUpdate().executeTakeFirst();
        if (!antes) throw new ErroDeRegra("nao_encontrado", "Tipo de produção não encontrado.");
        s = await trx.updateTable("tipo_producao").set({ ...valores, atualizado_em: sql`now()` }).where("id", "=", d.id).returning(colunas).executeTakeFirstOrThrow();
      } else {
        s = await trx.insertInto("tipo_producao").values({ ...valores, nome: d.nome!, area: d.area! }).returning(colunas).executeTakeFirstOrThrow();
      }
      const reordenados = d.posicao === undefined ? [] : await reposicionar(trx, "tipo_producao", s.id, d.posicao);
      if (reordenados.length) s = await trx.selectFrom("tipo_producao").select(colunas).where("id", "=", s.id).executeTakeFirstOrThrow();
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "tipo_producao",
        alvoId: s.id,
        detalhes: { operacao: d.id ? "alterar" : "criar", antes: antes ?? null, depois: s, ...(reordenados.length ? { reordenados } : {}) },
        ip: quem.ip,
      });
      return s;
    });
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    const code = (e as { code?: string }).code;
    if (code === "23505") throw new ErroDeRegra("conflito", "Já existe um tipo de produção ativo com esse nome.");
    if (code === "23514") throw new ErroDeRegra("dados_invalidos", "Algum campo está fora do permitido. Confira os campos.");
    throw e;
  }
}
