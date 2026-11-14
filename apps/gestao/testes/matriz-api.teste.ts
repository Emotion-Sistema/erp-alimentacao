/**
 * Critério de aceite do RC-12: para cada cargo, a mesma lista de ações chamada direto no
 * servidor. O que não é do cargo volta 403 e fica registrado na auditoria.
 * Toda rota de app/api precisa estar em ROTAS (o último teste confere), então rota nova
 * sem entrada aqui quebra o CI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOTP } from "otpauth";
import { criarBanco, type Banco } from "@erp/banco";
import { CARGOS, CODIGO_DE_TESTE, pode, semear, SENHA_DE_TESTE, type Acao } from "@erp/dominio";
import * as r from "../src/servidor/rotas";

const BASE = "http://gestao.teste";
const INEXISTENTE = "999999";
let db: Banco;

type Chamada = (cookie: string) => Promise<Response>;
interface Rota {
  metodo: "GET" | "POST" | "DELETE";
  caminho: string;
  /** Ação exigida; "publica", "sessao" (qualquer pessoa logada) ou "estacao" (cookie do tablet). */
  acao: Acao | "publica" | "sessao" | "estacao";
  chamar?: Chamada;
}

function req(caminho: string, metodo: string, cookie?: string, corpo?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (corpo !== undefined) headers.set("content-type", "application/json");
  return new Request(BASE + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
}

// Cada chamada é feita de modo a não mudar nada quando permitida (corpo vazio ou alvo
// inexistente): a permissão é conferida antes de qualquer outra coisa.
const ROTAS: Rota[] = [
  { metodo: "GET", caminho: "/api/saude", acao: "publica" },
  { metodo: "POST", caminho: "/api/sessao", acao: "publica" },
  { metodo: "DELETE", caminho: "/api/sessao", acao: "sessao" },
  { metodo: "POST", caminho: "/api/sessao/segundo-fator", acao: "sessao" },
  { metodo: "POST", caminho: "/api/segundo-fator", acao: "sessao" },
  { metodo: "GET", caminho: "/api/eu", acao: "sessao" },
  { metodo: "POST", caminho: "/api/eu/cargo", acao: "sessao" },
  { metodo: "POST", caminho: "/api/eu/codigo", acao: "sessao" },
  { metodo: "GET", caminho: "/api/avisos", acao: "sessao" },
  { metodo: "GET", caminho: "/api/usuarios", acao: "usuarios.ver", chamar: (c) => r.verUsuarios(req("/api/usuarios", "GET", c)) },
  { metodo: "POST", caminho: "/api/usuarios", acao: "usuarios.gerenciar", chamar: (c) => r.novoUsuario(req("/api/usuarios", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/usuarios/[id]/cargos", acao: "usuarios.gerenciar", chamar: (c) => r.darCargoAoUsuario(req(`/api/usuarios/${INEXISTENTE}/cargos`, "POST", c, {}), { id: INEXISTENTE }) },
  { metodo: "DELETE", caminho: "/api/usuarios/[id]/cargos", acao: "usuarios.gerenciar", chamar: (c) => r.tirarCargoDoUsuario(req(`/api/usuarios/${INEXISTENTE}/cargos`, "DELETE", c, {}), { id: INEXISTENTE }) },
  { metodo: "POST", caminho: "/api/usuarios/[id]/desligar", acao: "usuarios.gerenciar", chamar: (c) => r.desligar(req(`/api/usuarios/${INEXISTENTE}/desligar`, "POST", c, {}), { id: INEXISTENTE }) },
  { metodo: "POST", caminho: "/api/usuarios/[id]/codigo", acao: "usuarios.gerenciar", chamar: (c) => r.codigoDoUsuario(req(`/api/usuarios/${INEXISTENTE}/codigo`, "POST", c, {}), { id: INEXISTENTE }) },
  { metodo: "POST", caminho: "/api/usuarios/[id]/desbloquear-codigo", acao: "codigos.desbloquear", chamar: (c) => r.desbloquearCodigoDoUsuario(req(`/api/usuarios/${INEXISTENTE}/desbloquear-codigo`, "POST", c, {}), { id: INEXISTENTE }) },
  { metodo: "POST", caminho: "/api/usuarios/[id]/reiniciar-segundo-fator", acao: "usuarios.gerenciar", chamar: (c) => r.reiniciarSegundoFatorDoUsuario(req(`/api/usuarios/${INEXISTENTE}/reiniciar-segundo-fator`, "POST", c, {}), { id: INEXISTENTE }) },
  { metodo: "GET", caminho: "/api/auditoria", acao: "auditoria.ver", chamar: (c) => r.verAuditoria(req("/api/auditoria?limite=1", "GET", c)) },
  { metodo: "GET", caminho: "/api/estacoes", acao: "estacoes.ver", chamar: (c) => r.verEstacoes(req("/api/estacoes", "GET", c)) },
  { metodo: "POST", caminho: "/api/estacoes", acao: "estacoes.gerenciar", chamar: (c) => r.cadastrarEsteAparelho(req("/api/estacoes", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estacoes/[id]/revogar", acao: "estacoes.gerenciar", chamar: (c) => r.revogar(req(`/api/estacoes/${INEXISTENTE}/revogar`, "POST", c, {}), { id: INEXISTENTE }) },
  { metodo: "GET", caminho: "/api/estacao", acao: "estacao" },
  { metodo: "POST", caminho: "/api/estacao/entrar", acao: "estacao" },
  { metodo: "POST", caminho: "/api/estacao/ativar", acao: "estacao" },
  { metodo: "POST", caminho: "/api/estacao/sair", acao: "estacao" },
];

/** Entra pela API como a pessoa faria, passando o segundo fator quando o cargo exige. */
async function entrarComo(login: string): Promise<string> {
  const e = await r.entrarNaSessao(req("/api/sessao", "POST", undefined, { login, senha: SENHA_DE_TESTE }));
  expect(e.status, login).toBe(200);
  const cookie = (e.headers.get("set-cookie") ?? "").split(";")[0]!;
  const corpo = (await e.json()) as { segundoFator: string; id: number };
  if (corpo.segundoFator !== "pendente") return cookie;
  // Em teste a mesma pessoa entra várias vezes em 30 s: zera o segundo fator dela direto no banco.
  await db.updateTable("usuario").set({ totp_segredo: null, totp_pendente: null, totp_ultimo_passo: null }).where("id", "=", corpo.id).execute();
  const novo = await r.novoSegundoFator(req("/api/segundo-fator", "POST", cookie, {}));
  expect(novo.status).toBe(200);
  const { segredo, qrSvg } = (await novo.json()) as { segredo: string; qrSvg: string };
  expect(qrSvg).toMatch(/^<svg/);
  const codigo = TOTP.generate({ secret: new TOTP({ secret: segredo }).secret });
  const ok = await r.confirmarSegundo(req("/api/sessao/segundo-fator", "POST", cookie, { codigo }));
  expect(ok.status).toBe(200);
  return cookie;
}

const loginDo = (cargo: string) => cargo.replace("_", ".");

beforeAll(async () => {
  db = criarBanco(process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste", 5);
  r.usarBanco(() => db);
  await semear(db);
});
afterAll(() => db.destroy());

describe("matriz pela API: cada cargo x cada rota protegida", () => {
  const protegidas = ROTAS.filter((x): x is Rota & { acao: Acao; chamar: Chamada } => !!x.chamar);

  it.each(CARGOS)("%s: o que não é do cargo volta 403 e fica registrado; o que é do cargo passa", async (cargo) => {
    const cookie = await entrarComo(loginDo(cargo));
    const eu = (await (await r.quemSouEu(req("/api/eu", "GET", cookie))).json()) as { id: number; acoes: string[] };
    for (const rota of protegidas) {
      const permitido = pode(cargo, rota.acao);
      expect(eu.acoes.includes(rota.acao), `${cargo} menu ${rota.acao}`).toBe(permitido);
      const antes = await db.selectFrom("auditoria").select((eb) => eb.fn.max("id").as("max")).executeTakeFirstOrThrow();
      const resposta = await rota.chamar(cookie);
      const nome = `${cargo} ${rota.metodo} ${rota.caminho}`;
      if (permitido) {
        expect([401, 403, 500], nome).not.toContain(resposta.status);
      } else {
        expect(resposta.status, nome).toBe(403);
        const recusa = await db
          .selectFrom("auditoria")
          .select(["usuario_id", "resultado"])
          .where("id", ">", antes.max ?? "0")
          .where("acao", "=", rota.acao)
          .executeTakeFirst();
        expect(recusa, `${nome}: recusa registrada`).toEqual({ usuario_id: eu.id, resultado: "recusado" });
      }
    }
  });

  it("sem sessão: toda rota protegida volta 401", async () => {
    for (const rota of protegidas) expect((await rota.chamar("")).status, rota.caminho).toBe(401);
    expect((await r.quemSouEu(req("/api/eu", "GET"))).status).toBe(401);
    expect((await r.verAvisos(req("/api/avisos", "GET"))).status).toBe(401);
  });

  it("administrador que só digitou a senha (sem o segundo fator) é barrado em tudo", async () => {
    const e = await r.entrarNaSessao(req("/api/sessao", "POST", undefined, { login: "administrador", senha: SENHA_DE_TESTE }));
    const cookie = (e.headers.get("set-cookie") ?? "").split(";")[0]!;
    const eu = (await (await r.quemSouEu(req("/api/eu", "GET", cookie))).json()) as { segundoFator: string; acoes: string[] };
    expect(eu.segundoFator).toBe("pendente");
    expect(eu.acoes).toEqual([]);
    for (const rota of protegidas) expect((await rota.chamar(cookie)).status, rota.caminho).toBe(401);
  });

  it("toda rota de app/api está na lista acima (rota nova sem teste de cargo quebra o CI)", () => {
    const raiz = join(import.meta.dirname, "..", "app", "api");
    const achadas: string[] = [];
    const andar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) andar(caminho);
        else if (nome === "route.ts") {
          const url = "/api/" + relative(raiz, dir).split("\\").join("/");
          for (const m of readFileSync(caminho, "utf8").matchAll(/(?:export (?:const|async function|function) | as )(GET|POST|DELETE|PUT|PATCH)\b/g)) achadas.push(`${m[1]} ${url}`);
        }
      }
    };
    andar(raiz);
    expect(achadas.sort()).toEqual(ROTAS.map((x) => `${x.metodo} ${x.caminho}`).sort());
  });
});

describe("estação pela API (cookie do tablet)", () => {
  it("gerente cadastra o aparelho; o cookie da estação sai HttpOnly; cozinheira entra com o código; sessão de pessoa não serve como estação", async () => {
    const gerente = await entrarComo("gerente.geral");
    const cad = await r.cadastrarEsteAparelho(req("/api/estacoes", "POST", gerente, { nome: "Chapa API" }));
    expect(cad.status).toBe(201);
    const setCookie = cad.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^erp_estacao=.+HttpOnly/);
    expect(JSON.stringify(await cad.json())).not.toMatch(/token/);
    const tablet = setCookie.split(";")[0]!;

    const tela = (await (await r.telaEstacao(req("/api/estacao", "GET", tablet))).json()) as { pessoas: { id: number; nome: string; cargo: string }[]; acoes: string[] };
    expect(tela.acoes).toEqual([]);
    const coz = tela.pessoas.find((p) => p.nome === "Teste cozinheira")!;
    expect((await r.entrarEstacao(req("/api/estacao/entrar", "POST", tablet, { usuarioId: coz.id, codigo: CODIGO_DE_TESTE }))).status).toBe(200);
    const depois = (await (await r.telaEstacao(req("/api/estacao", "GET", tablet))).json()) as { acoes: string[] };
    expect(depois.acoes).toContain("producao.operar");
    expect(depois.acoes).not.toContain("usuarios.ver");

    expect((await r.telaEstacao(req("/api/estacao", "GET", gerente))).status).toBe(401);
    expect((await r.entrarEstacao(req("/api/estacao/entrar", "POST", "erp_estacao=inventado", { usuarioId: coz.id, codigo: CODIGO_DE_TESTE }))).status).toBe(401);
    // O cookie do tablet não abre as rotas da gestão.
    expect((await r.verUsuarios(req("/api/usuarios", "GET", tablet))).status).toBe(401);
  });

  it("código errado 3 vezes: 429 na terceira", async () => {
    const gerente = await entrarComo("gerente.geral");
    const tablet = ((await r.cadastrarEsteAparelho(req("/api/estacoes", "POST", gerente, { nome: "Fritura API" }))).headers.get("set-cookie") ?? "").split(";")[0]!;
    const tela = (await (await r.telaEstacao(req("/api/estacao", "GET", tablet))).json()) as { pessoas: { id: number; nome: string; cargo: string }[] };
    const aux = tela.pessoas.find((p) => p.nome === "Teste auxiliar cozinha")!;
    const tentar = () => r.entrarEstacao(req("/api/estacao/entrar", "POST", tablet, { usuarioId: aux.id, codigo: "0000" }));
    expect((await tentar()).status).toBe(401);
    expect((await tentar()).status).toBe(401);
    expect((await tentar()).status).toBe(429);
    const sup = await entrarComo("supervisor");
    const avisos = (await (await r.verAvisos(req("/api/avisos", "GET", sup))).json()) as { tipo: string }[];
    expect(avisos.some((a) => a.tipo === "codigo_bloqueado")).toBe(true);
    expect((await r.desbloquearCodigoDoUsuario(req(`/api/usuarios/${aux.id}/desbloquear-codigo`, "POST", sup, {}), { id: String(aux.id) })).status).toBe(200);
  });
});

describe("cargo ativo pela API", () => {
  it("trocar para um cargo que a pessoa não tem: 403", async () => {
    const cookie = await entrarComo("caixa");
    expect((await r.trocarCargo(req("/api/eu/cargo", "POST", cookie, { cargo: "dono" }))).status).toBe(403);
    expect((await r.trocarCargo(req("/api/eu/cargo", "POST", cookie, { cargo: "caixa" }))).status).toBe(200);
  });
});
