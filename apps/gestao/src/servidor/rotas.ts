/**
 * Lógica das rotas da API, separada dos arquivos do Next para poder ser testada
 * chamando o servidor diretamente (sem tela). Toda rota protegida confere a
 * permissão no domínio (exigir), nunca só na tela.
 */
import { banco, sql, type Banco } from "@erp/banco";
import { atorDaSessao, criarUsuario, entrar, listarUsuarios, sair, ErroDeRegra } from "@erp/dominio";
import { conferirOrigem, cookieApagado, cookieSessao, corpoJson, ipDaRequisicao, json, respostaDeErro, tokenDaRequisicao } from "./http";

type Manipulador = (req: Request) => Promise<Response>;

/** Permite trocar o banco nos testes. */
let obterBanco: () => Banco = banco;
export function usarBanco(fn: () => Banco) {
  obterBanco = fn;
}

const ator = (req: Request) => atorDaSessao(obterBanco(), tokenDaRequisicao(req), ipDaRequisicao(req));

const seguro =
  (fn: Manipulador): Manipulador =>
  async (req) => {
    try {
      if (req.method !== "GET") conferirOrigem(req);
      return await fn(req);
    } catch (e) {
      return respostaDeErro(e);
    }
  };

export const entrarNaSessao = seguro(async (req) => {
  const r = await entrar(obterBanco(), await corpoJson(req), {
    ip: ipDaRequisicao(req),
    agente: req.headers.get("user-agent"),
  });
  return json({ nome: r.ator.nome, cargos: r.ator.cargos }, 200, { "set-cookie": cookieSessao(r.token, r.expiraEm) });
});

export const sairDaSessao = seguro(async (req) => {
  const a = await ator(req);
  if (a) await sair(obterBanco(), a);
  return json({ ok: true }, 200, { "set-cookie": cookieApagado() });
});

export const quemSouEu = seguro(async (req) => {
  const a = await ator(req);
  if (!a) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  return json({ id: a.usuarioId, nome: a.nome, login: a.login, cargos: a.cargos });
});

export const verUsuarios = seguro(async (req) => json(await listarUsuarios(obterBanco(), await ator(req))));

export const novoUsuario = seguro(async (req) => {
  const db = obterBanco();
  return json(await criarUsuario(db, await ator(req), await corpoJson(req)), 201);
});

/** Saúde: sem dado interno. Usado pelo monitoramento e pela publicação. */
export const saude = seguro(async () => {
  await sql`SELECT 1`.execute(obterBanco());
  return json({ ok: true });
});
