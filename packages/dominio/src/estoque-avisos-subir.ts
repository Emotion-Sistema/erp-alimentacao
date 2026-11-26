/**
 * Aviso urgente do estoque que ninguém viu sobe para o superior (E10 parte 2; RC-18: "urgente não
 * visto ... sobe para o superior depois do tempo configurado"; migração 0028; decisão 0029).
 *
 * Roda no worker a cada poucos minutos. Um aviso urgente de reposição (emergência, esgotou, começou a
 * usar o guardado) que, passado `MINUTOS_PARA_SUBIR` desde que nasceu, ainda vale (turno) e não foi
 * visto por ninguém, vira um aviso novo, urgente, para o superior de quem devia ter visto:
 * cozinheira, auxiliar e supervisor -> gerente geral; gerente geral -> dono.
 * Só sobe se o problema continua (o item não voltou ao normal nem saiu do guardado). Cada aviso sobe
 * uma vez só (tabela `aviso_subida`, chave primária), mesmo com duas execuções ao mesmo tempo.
 * Hipótese (26/11/2026): 15 minutos para todos; quando houver configuração, o tempo sai dela.
 */
import { sql, type Banco } from "@erp/banco";
import { criarAviso } from "./avisos";
import { gravidade, TIPOS_DE_AVISO_DE_REPOSICAO, type SituacaoDeReposicao } from "./estoque-reposicao-estado";
import { CARGOS, type Cargo } from "./permissoes";

export const MINUTOS_PARA_SUBIR = 15;

/** De quem para quem sobe. Quem não está aqui não tem superior (o aviso não sobe). */
const SUPERIOR: Partial<Record<Cargo, Cargo>> = {
  cozinheira: "gerente_geral",
  auxiliar_cozinha: "gerente_geral",
  supervisor: "gerente_geral",
  gerente_geral: "dono",
};

/** Superiores de uma lista de cargos, sem os que já recebiam o aviso, na ordem dos cargos. */
export function superioresDe(cargos: readonly string[]): Cargo[] {
  const s = new Set<Cargo>();
  for (const c of cargos) {
    const sup = SUPERIOR[c as Cargo];
    if (sup && !cargos.includes(sup)) s.add(sup);
  }
  return CARGOS.filter((c) => s.has(c));
}

const QUE_SOBEM = [TIPOS_DE_AVISO_DE_REPOSICAO.emergencia, TIPOS_DE_AVISO_DE_REPOSICAO.esgotado, TIPOS_DE_AVISO_DE_REPOSICAO.usandoGuardado];
export const TIPO_DO_AVISO_QUE_SUBIU = "estoque.subiu";

type Candidato = {
  id: string;
  unidade_id: number;
  para_cargos: string[];
  tipo: string;
  texto: string;
  dados: Record<string, unknown>;
  situacao: SituacaoDeReposicao | null;
  usando: boolean | null;
};

/**
 * Sobe os urgentes não vistos. `agora` (para teste): o instante da conferência; sem ele, agora.
 * Devolve quantos subiram.
 */
export async function subirAvisosNaoVistos(db: Banco, opcoes: { agora?: Date } = {}): Promise<{ subiram: number }> {
  const agora = opcoes.agora?.toISOString() ?? null;
  return db.transaction().execute(async (trx) => {
    // Uma execução por vez (a outra espera e já não acha o que esta subiu).
    await sql`SELECT pg_advisory_xact_lock(hashtext('estoque:subir_avisos'))`.execute(trx);
    const r = await sql<Candidato>`
      SELECT a.id::text AS id, a.unidade_id, a.para_cargos, a.tipo, a.texto, a.dados,
        st.situacao, st.usando_guardado AS usando
      FROM aviso a
      LEFT JOIN estoque_reposicao_estado st ON st.item_id = (a.dados->>'itemId')::int AND st.area = a.dados->>'area'
      WHERE a.prioridade = 'urgente' AND a.natureza = 'operacional'
        AND a.tipo = ANY(${QUE_SOBEM}::text[])
        AND a.expira_em > coalesce(${agora}::timestamptz, now())
        AND a.criado_em <= coalesce(${agora}::timestamptz, now()) - make_interval(mins => ${MINUTOS_PARA_SUBIR})
        AND NOT EXISTS (SELECT 1 FROM aviso_destino d WHERE d.aviso_id = a.id AND d.visto_em IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM aviso_subida s WHERE s.aviso_id = a.id)
      ORDER BY a.id`.execute(trx);
    let subiram = 0;
    for (const a of r.rows) {
      if (!continua(a)) continue;
      const para = superioresDe(a.para_cargos);
      if (para.length === 0) continue;
      // O texto e o `dados` são os do aviso de origem (já sem quantidades quando ia para quem não compra).
      const novo = await criarAviso(trx, {
        unidadeId: a.unidade_id,
        paraCargos: para,
        tipo: TIPO_DO_AVISO_QUE_SUBIU,
        prioridade: "urgente",
        texto: `Ninguém viu este aviso em ${MINUTOS_PARA_SUBIR} minutos: ${a.texto}`,
        dados: { ...a.dados, avisoDeOrigem: a.id, tipoDeOrigem: a.tipo, cargosDeOrigem: a.para_cargos },
      });
      await trx.insertInto("aviso_subida").values({ aviso_id: a.id, novo_aviso_id: novo }).execute();
      subiram++;
    }
    return { subiram };
  });
}

/** O problema do aviso continua? (Senão, não incomoda o superior.) */
function continua(a: Candidato): boolean {
  if (a.situacao === null) return false; // sem estado: nada a dizer
  if (a.tipo === TIPOS_DE_AVISO_DE_REPOSICAO.usandoGuardado) return a.usando === true;
  const estado = a.dados.estado;
  if (estado !== "emergencia" && estado !== "esgotado") return false;
  return gravidade(a.situacao) >= gravidade(estado);
}
