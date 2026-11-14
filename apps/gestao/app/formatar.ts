const formato = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});

/** Data e hora no fuso de São Paulo, no formato brasileiro. */
export function formatarDataHora(valor: string | Date): string {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : formato.format(d);
}
