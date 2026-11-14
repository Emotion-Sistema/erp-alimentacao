/**
 * Lógica das rotas da API, separada dos arquivos do Next para poder ser testada
 * chamando o servidor diretamente (sem tela). Toda rota protegida confere a
 * permissão no domínio (exigir), nunca só na tela.
 */
import { banco, sql, type Banco } from "@erp/banco";
import {
  ACOES,
  atorDaEstacao,
  atorDaSessao,
  ativarNaEstacao,
  avisosDoCargo,
  cadastrarEstacao,
  confirmarSegundoFator,
  consultarAuditoria,
  criarUsuario,
  darCargo,
  definirCodigo,
  desbloquearCodigo,
  desligarUsuario,
  entrar,
  entrarNaEstacao,
  estenderTurno,
  ErroDeRegra,
  iniciarSegundoFator,
  listarEstacoes,
  listarUsuarios,
  NOME_DO_CARGO,
  pode,
  reiniciarSegundoFator,
  revogarEstacao,
  sair,
  sairDaEstacao,
  telaDaEstacao,
  tirarCargo,
  trocarCargoAtivo,
  type Ator,
} from "@erp/dominio";
import QRCode from "qrcode";
import {
  conferirOrigem,
  cookieApagado,
  cookieEstacao,
  cookieSessao,
  corpoJson,
  ipDaRequisicao,
  json,
  respostaDeErro,
  tokenDaEstacao,
  tokenDaRequisicao,
} from "./http";

export type Parametros = Record<string, string>;
type Manipulador = (req: Request) => Promise<Response>;
type ManipuladorComParametros = (req: Request, p: Parametros) => Promise<Response>;

/** Permite trocar o banco nos testes. */
let obterBanco: () => Banco = banco;
export function usarBanco(fn: () => Banco) {
  obterBanco = fn;
}

const ator = (req: Request) => atorDaSessao(obterBanco(), tokenDaRequisicao(req), ipDaRequisicao(req));

async function protegido(req: Request, fn: () => Promise<Response>): Promise<Response> {
  try {
    if (req.method !== "GET") conferirOrigem(req);
    return await fn();
  } catch (e) {
    return respostaDeErro(e);
  }
}

const seguro =
  (fn: Manipulador) =>
  (req: Request): Promise<Response> =>
    protegido(req, () => fn(req));

/** Rotas com parâmetro no caminho (ex.: /api/usuarios/[id]/...). */
const seguroComId =
  (fn: ManipuladorComParametros) =>
  (req: Request, p: Parametros): Promise<Response> =>
    protegido(req, () => fn(req, p));

function idDe(p: Parametros): number {
  const n = Number(p.id);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ErroDeRegra("dados_invalidos", "Identificador inválido.");
  return n;
}

/** O que a tela precisa saber de quem entrou (nunca hash nem segredo). */
function resumo(a: Ator) {
  return {
    id: a.usuarioId,
    nome: a.nome,
    login: a.login,
    cargos: a.cargos.map((c) => ({ codigo: c, nome: NOME_DO_CARGO[c as keyof typeof NOME_DO_CARGO] ?? c })),
    cargoAtivo: a.cargoAtivo,
    segundoFator: a.segundoFator,
    segundoFatorConfigurado: a.segundoFatorConfigurado,
    // Só para montar o menu. O servidor confere de novo em cada ação.
    acoes: a.segundoFator === "pendente" ? [] : ACOES.filter((x) => pode(a.cargoAtivo, x)),
  };
}

// ---------- sessão ----------

export const entrarNaSessao = seguro(async (req) => {
  const r = await entrar(obterBanco(), await corpoJson(req), {
    ip: ipDaRequisicao(req),
    agente: req.headers.get("user-agent"),
  });
  return json(resumo(r.ator), 200, { "set-cookie": cookieSessao(r.token, r.expiraEm) });
});

export const sairDaSessao = seguro(async (req) => {
  const a = await ator(req);
  if (a) await sair(obterBanco(), a);
  return json({ ok: true }, 200, { "set-cookie": cookieApagado() });
});

export const quemSouEu = seguro(async (req) => {
  const a = await ator(req);
  if (!a) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  return json(resumo(a));
});

export const trocarCargo = seguro(async (req) => json(resumo(await trocarCargoAtivo(obterBanco(), await ator(req), await corpoJson(req)))));

export const meuCodigo = seguro(async (req) => {
  const a = await ator(req);
  if (!a) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  await definirCodigo(obterBanco(), a, a.usuarioId, await corpoJson(req));
  return json({ ok: true });
});

// ---------- segundo fator ----------

export const novoSegundoFator = seguro(async (req) => {
  const r = await iniciarSegundoFator(obterBanco(), await ator(req));
  const qr = await QRCode.toString(r.uri, { type: "svg", margin: 1, width: 220 });
  return json({ segredo: r.segredo, qrSvg: qr });
});

export const confirmarSegundo = seguro(async (req) => json(resumo(await confirmarSegundoFator(obterBanco(), await ator(req), await corpoJson(req)))));

// ---------- funcionários ----------

export const verUsuarios = seguro(async (req) => json(await listarUsuarios(obterBanco(), await ator(req))));

export const novoUsuario = seguro(async (req) => {
  const db = obterBanco();
  return json(await criarUsuario(db, await ator(req), await corpoJson(req)), 201);
});

export const darCargoAoUsuario = seguroComId(async (req, p) => {
  await darCargo(obterBanco(), await ator(req), idDe(p), await corpoJson(req));
  return json({ ok: true });
});

export const tirarCargoDoUsuario = seguroComId(async (req, p) => {
  await tirarCargo(obterBanco(), await ator(req), idDe(p), await corpoJson(req));
  return json({ ok: true });
});

export const desligar = seguroComId(async (req, p) => {
  await desligarUsuario(obterBanco(), await ator(req), idDe(p));
  return json({ ok: true });
});

export const codigoDoUsuario = seguroComId(async (req, p) => {
  await definirCodigo(obterBanco(), await ator(req), idDe(p), await corpoJson(req));
  return json({ ok: true });
});

export const desbloquearCodigoDoUsuario = seguroComId(async (req, p) => {
  await desbloquearCodigo(obterBanco(), await ator(req), idDe(p));
  return json({ ok: true });
});

export const reiniciarSegundoFatorDoUsuario = seguroComId(async (req, p) => {
  await reiniciarSegundoFator(obterBanco(), await ator(req), idDe(p));
  return json({ ok: true });
});

// ---------- auditoria e avisos ----------

export const verAuditoria = seguro(async (req) => {
  const filtros = Object.fromEntries(new URL(req.url).searchParams);
  return json(await consultarAuditoria(obterBanco(), await ator(req), filtros));
});

export const verAvisos = seguro(async (req) => json(await avisosDoCargo(obterBanco(), await ator(req))));

// ---------- estações (gestor) ----------

export const verEstacoes = seguro(async (req) => json(await listarEstacoes(obterBanco(), await ator(req))));

/** Cadastra ESTE aparelho como estação: o token vai só no cookie dele. */
export const cadastrarEsteAparelho = seguro(async (req) => {
  const db = obterBanco();
  const gestor = await ator(req);
  const r = await cadastrarEstacao(db, gestor, await corpoJson(req));
  // O tablet fica na cozinha: a sessão do gestor nele é encerrada na mesma hora.
  if (gestor) await sair(db, gestor);
  const resposta = json({ id: r.id, nome: r.nome }, 201);
  resposta.headers.append("set-cookie", cookieEstacao(r.token));
  resposta.headers.append("set-cookie", cookieApagado());
  return resposta;
});

export const revogar = seguroComId(async (req, p) => {
  await revogarEstacao(obterBanco(), await ator(req), idDe(p));
  return json({ ok: true });
});

// ---------- tablet da estação (cookie da estação) ----------

export const telaEstacao = seguro(async (req) => {
  const tela = await telaDaEstacao(obterBanco(), tokenDaEstacao(req));
  const a = await atorDaEstacao(obterBanco(), tokenDaEstacao(req));
  return json({ ...tela, acoes: a ? ACOES.filter((x) => pode(a.cargoAtivo, x)) : [] });
});

export const entrarEstacao = seguro(async (req) => {
  await entrarNaEstacao(obterBanco(), tokenDaEstacao(req), await corpoJson(req));
  return json({ ok: true });
});

export const ativarEstacao = seguro(async (req) => {
  await ativarNaEstacao(obterBanco(), tokenDaEstacao(req), await corpoJson(req));
  return json({ ok: true });
});

export const estenderTurnoEstacao = seguro(async (req) => json({ fimEm: await estenderTurno(obterBanco(), tokenDaEstacao(req)) }));

export const sairEstacao = seguro(async (req) => {
  await sairDaEstacao(obterBanco(), tokenDaEstacao(req), await corpoJson(req));
  return json({ ok: true });
});

/** Saúde: sem dado interno. Usado pelo monitoramento e pela publicação. */
export const saude = seguro(async () => {
  await sql`SELECT 1`.execute(obterBanco());
  return json({ ok: true });
});
