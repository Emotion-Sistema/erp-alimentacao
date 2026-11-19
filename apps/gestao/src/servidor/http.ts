import { ErroDeRegra } from "@erp/dominio";

/**
 * Em produção e homologação os cookies têm o prefixo __Host-: o navegador só aceita esse
 * nome com Secure, Path=/ e sem Domain. Assim um outro endereço do mesmo domínio-pai (ex.:
 * outro *.sslip.io) não consegue gravar um cookie com esse nome para atrapalhar a sessão.
 */
const PREFIXO = process.env.NODE_ENV === "production" ? "__Host-" : "";
export const COOKIE_SESSAO = `${PREFIXO}erp_sessao`;
/** Cookie do aparelho cadastrado como estação da cozinha (dura até a estação ser desligada). */
export const COOKIE_ESTACAO = `${PREFIXO}erp_estacao`;

const STATUS: Record<ErroDeRegra["codigo"], number> = {
  nao_autenticado: 401,
  sem_permissao: 403,
  dados_invalidos: 400,
  conflito: 409,
  nao_encontrado: 404,
  bloqueado: 429,
  segundo_fator: 401,
  confirmar_codigo: 401,
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
  return lerCookie(req, COOKIE_SESSAO);
}

export function tokenDaEstacao(req: Request): string | null {
  return lerCookie(req, COOKIE_ESTACAO);
}

function lerCookie(req: Request, procurado: string): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  for (const parte of cookie.split(";")) {
    const [nome, ...valor] = parte.trim().split("=");
    if (nome !== procurado) continue;
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

/**
 * Recusa POST/DELETE vindos de outro site (o navegador sempre manda Origin nesses casos).
 * Compara com o Host que o navegador pediu: atrás do Caddy (homologação e produção) o
 * endereço que o Next enxerga é o interno (gestao:3000), e o Caddy repassa o Host original.
 * Quem forja o Host não é um navegador de vítima, então não há CSRF por aí.
 */
export function conferirOrigem(req: Request): void {
  const origem = req.headers.get("origin");
  if (!origem) return;
  // "null" ou valor inválido: tratado como outra origem.
  const host = URL.canParse(origem) ? new URL(origem).host : null;
  const pedido = req.headers.get("host") || new URL(req.url).host;
  if (!host || host.toLowerCase() !== pedido.toLowerCase()) {
    throw new ErroDeRegra("sem_permissao", "Requisição de outra origem recusada.");
  }
}

export function cookieSessao(token: string, expiraEm: Date): string {
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_SESSAO}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Expires=${expiraEm.toUTCString()}${seguro}`;
}

export function cookieEstacao(token: string): string {
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_ESTACAO}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${400 * 24 * 3600}${seguro}`;
}

export function cookieApagado(): string {
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_SESSAO}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${seguro}`;
}

export async function corpoJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ErroDeRegra("dados_invalidos", "Corpo da requisição inválido.");
  }
}

/**
 * Corpo JSON com tamanho máximo (importação de planilha, decisão 0020). Recusa pelo cabeçalho
 * Content-Length e, se ele mentir ou faltar, conta os bytes enquanto lê e para no limite.
 */
export async function corpoJsonLimitado(req: Request, maximo: number, mensagem: string): Promise<unknown> {
  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > maximo) throw new ErroDeRegra("dados_invalidos", mensagem);
  if (!req.body) throw new ErroDeRegra("dados_invalidos", "Corpo da requisição inválido.");
  const leitor = req.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await leitor.cancel().catch(() => undefined);
      throw new ErroDeRegra("dados_invalidos", mensagem);
    }
    pedacos.push(value);
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(pedacos)));
  } catch {
    throw new ErroDeRegra("dados_invalidos", "Corpo da requisição inválido.");
  }
}
