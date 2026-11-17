/**
 * Horários de venda: partes sem banco, usadas no servidor e nas telas (`@erp/dominio/horarios`).
 * A regra de "pode vender agora" fica no banco (`situacao_de_venda`, migração 0010); aqui só
 * nomes, validação de hora e o texto de cada motivo.
 */

export const CANAIS = ["loja", "delivery"] as const;
export type Canal = (typeof CANAIS)[number];
export const NOME_DO_CANAL: Readonly<Record<Canal, string>> = { loja: "Loja", delivery: "Delivery" };

/** 1 = segunda ... 7 = domingo (como o isodow do PostgreSQL). */
export const DIAS = [1, 2, 3, 4, 5, 6, 7] as const;
export const NOME_DO_DIA: Readonly<Record<number, string>> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};
export const SIGLA_DO_DIA: Readonly<Record<number, string>> = { 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sáb", 7: "dom" };

export type MotivoFechado =
  | "unidade_fechada"
  | "antes_de_abrir"
  | "cozinha_fechada"
  | "canal_fechado"
  | "categoria_fechada"
  | "categoria_inativa"
  | "fora_do_horario"
  | "pausado";

/** Hora no formato da tela: "HH:MM" de 00:00 a 23:59, e "24:00" (meia-noite, só para o fim). */
export function horaValida(v: string, podeSer24 = false): boolean {
  const m = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(v);
  if (!m) return false;
  if (m[1] === "24") return podeSer24 && m[2] === "00";
  return true;
}

/** "11:00" -> "11h"; "11:30" -> "11h30". Aceita também "11:00:00" (como vem do banco). */
export function horaCurta(v: string): string {
  const [h, m] = v.split(":");
  return m && m !== "00" ? `${Number(h)}h${m}` : `${Number(h)}h`;
}

/**
 * Frase curta para quem está vendendo ou comprando: "Disponível a partir das 11h".
 * `abreAs` vem pronto do servidor em "HH:MM" (hora local da unidade).
 */
export function textoDaSituacao(s: { aberta: boolean; motivo: MotivoFechado | null; abreAs: string | null }, canal: Canal): string {
  if (s.aberta) return "Vendendo agora";
  const aPartir = s.abreAs ? `Disponível a partir das ${horaCurta(s.abreAs)}` : null;
  switch (s.motivo) {
    case "unidade_fechada":
      return "Fechado hoje";
    case "antes_de_abrir":
      return aPartir ?? "Ainda não abriu";
    case "cozinha_fechada":
      return "A cozinha já fechou por hoje";
    case "canal_fechado":
      return canal === "delivery" ? "Sem delivery hoje" : "A loja não vende hoje";
    case "categoria_fechada":
      return `Não vende hoje ${canal === "delivery" ? "no delivery" : "na loja"}`;
    case "categoria_inativa":
      return "Categoria desativada";
    case "fora_do_horario":
      return aPartir ?? "Fora do horário por hoje";
    case "pausado":
      return s.abreAs ? `Pausado até ${horaCurta(s.abreAs)}` : "Pausado";
    default:
      return "Fora de venda";
  }
}
