/** Chamada simples à API. Nunca lança erro: devolve sempre a mensagem pronta para mostrar. */
export type Resposta<T> = { ok: boolean; status: number; dados: T | null; mensagem: string };

export async function chamar<T = unknown>(url: string, metodo = "GET", corpo?: unknown): Promise<Resposta<T>> {
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
    });
    const dados = (await r.json().catch(() => null)) as (T & { mensagem?: string }) | null;
    const mensagem = !r.ok
      ? (dados as { mensagem?: string } | null)?.mensagem ?? "Não foi possível concluir. Tente de novo."
      : "";
    return { ok: r.ok, status: r.status, dados, mensagem };
  } catch {
    return { ok: false, status: 0, dados: null, mensagem: "Sem conexão com o servidor. Confira a internet e tente de novo." };
  }
}
