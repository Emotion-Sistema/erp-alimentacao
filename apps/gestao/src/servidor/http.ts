import { ErroDeRegra } from "@erp/dominio";

export const COOKIE_SESSAO = "erp_sessao";

const STATUS: Record<ErroDeRegra["codigo"], number> = {
  nao_autenticado: 401,
  sem_permissao: 403,
  dados_invalidos: 400,
  conflito: 409,
  nao_encontrado: 404,
};

export function json(dados: unknown, status = 200, cabecalhos: HeadersInit = {}): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cabecalhos },
  });
}

/** Converte erro em resposta. Erro inesperado não vaza detalhe interno. */
export function respostaDeErro(e: unknown): Response {
  if (e instanceof ErroDeRegra) return json({ erro: e.codigo, mensagem: e.message }, STATUS[e.codigo]);
  console.error(JSON.stringify({ nivel: "erro", mensagem: (e as Error)?.message, pilha: (e as Error)?.stack }));
  return json({ erro: "interno", mensagem: "Algo deu errado. Tente de novo; se continuar, avise o responsável." }, 500);
}

export function tokenDaRequisicao(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  for (const parte of cookie.split(";")) {
    const [nome, ...valor] = parte.trim().split("=");
    if (nome !== COOKIE_SESSAO) continue;
    try {
      return decodeURIComponent(valor.join("="));
    } catch {
      return null; // cookie malformado vale como sem sessão
    }
  }
  return null;
}

export function ipDaRequisicao(req: Request): string | null {
  // x-forwarded-for pode ser inventado pelo cliente. Só vale atrás do proxy reverso
  // nosso (E06), que sobrescreve o cabeçalho; aí ligamos CONFIAR_PROXY=1.
  if (process.env.CONFIAR_PROXY !== "1") return null;
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/** Recusa POST/DELETE vindos de outro site (o navegador sempre manda Origin nesses casos). */
export function conferirOrigem(req: Request): void {
  const origem = req.headers.get("origin");
  if (!origem) return;
  // "null" ou valor inválido: tratado como outra origem.
  const host = URL.canParse(origem) ? new URL(origem).host : null;
  if (host !== new URL(req.url).host) {
    throw new ErroDeRegra("sem_permissao", "Requisição de outra origem recusada.");
  }
}

export function cookieSessao(token: string, expiraEm: Date): string {
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_SESSAO}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Expires=${expiraEm.toUTCString()}${seguro}`;
}

export function cookieApagado(): string {
  return `${COOKIE_SESSAO}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function corpoJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ErroDeRegra("dados_invalidos", "Corpo da requisição inválido.");
  }
}
