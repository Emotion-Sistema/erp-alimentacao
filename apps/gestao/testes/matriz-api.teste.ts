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
  /**
   * Outras ações que também abrem a rota (basta uma). Estoque: quem cuida de qualquer área (cozinha OU
   * salão) passa; quem não cuida de nenhuma é recusado por `acao` (estoque.cozinha), como o domínio.
   */
  ou?: readonly Acao[];
  /** Ações exigidas ALÉM das acima (todas). Ex.: valor do estoque = custos.ver E cuidar de uma área. */
  tambem?: readonly Acao[];
  chamar?: Chamada;
}

function req(caminho: string, metodo: string, cookie?: string, corpo?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (corpo !== undefined) headers.set("content-type", "application/json");
  return new Request(BASE + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
}

const AREA = { acao: "estoque.cozinha", ou: ["estoque.salao"] } as const;

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
  { metodo: "POST", caminho: "/api/avisos/vistos", acao: "sessao" },
  { metodo: "POST", caminho: "/api/avisos/[id]/resolver", acao: "sessao" },
  { metodo: "GET", caminho: "/api/eu/turno", acao: "sessao" },
  { metodo: "POST", caminho: "/api/eu/turno", acao: "sessao" },
  { metodo: "GET", caminho: "/api/turnos", acao: "horarios.gerenciar", chamar: (c) => r.verTurnosDaUnidade(req("/api/turnos", "GET", c)) },
  { metodo: "POST", caminho: "/api/turnos", acao: "horarios.gerenciar", chamar: (c) => r.mudarMargem(req("/api/turnos", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/comunicados", acao: "comunicados.enviar", chamar: (c) => r.verComunicados(req("/api/comunicados", "GET", c)) },
  { metodo: "POST", caminho: "/api/comunicados", acao: "comunicados.enviar", chamar: (c) => r.novoComunicado(req("/api/comunicados", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/cadastros/fornecedores", acao: "cadastros.ver", chamar: (c) => r.verFornecedores(req("/api/cadastros/fornecedores", "GET", c)) },
  { metodo: "POST", caminho: "/api/cadastros/fornecedores", acao: "cadastros.gerenciar", chamar: (c) => r.gravarFornecedor(req("/api/cadastros/fornecedores", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/cadastros/produtos", acao: "cadastros.ver", chamar: (c) => r.verProdutos(req("/api/cadastros/produtos", "GET", c)) },
  { metodo: "POST", caminho: "/api/cadastros/produtos", acao: "cadastros.gerenciar", chamar: (c) => r.gravarProduto(req("/api/cadastros/produtos", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/cadastros/produtos/foto", acao: "cadastros.gerenciar", chamar: (c) => r.enviarFotoDoProduto(req("/api/cadastros/produtos/foto", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/cadastros/produtos/foto/tirar", acao: "cadastros.gerenciar", chamar: (c) => r.tirarFotoDoProduto(req("/api/cadastros/produtos/foto/tirar", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/cadastros/produtos/foto/[id]", acao: "cadastros.ver", chamar: (c) => r.verFotoDoProduto(req(`/api/cadastros/produtos/foto/${INEXISTENTE}`, "GET", c), { id: INEXISTENTE }) },
  { metodo: "GET", caminho: "/api/fichas", acao: "cadastros.ver", chamar: (c) => r.verPainelDeFichas(req("/api/fichas", "GET", c)) },
  { metodo: "POST", caminho: "/api/fichas", acao: "cadastros.gerenciar", chamar: (c) => r.gravarFicha(req("/api/fichas", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/fichas/[id]", acao: "cadastros.ver", chamar: (c) => r.verUmaFicha(req(`/api/fichas/${INEXISTENTE}`, "GET", c), { id: INEXISTENTE }) },
  { metodo: "GET", caminho: "/api/fichas/versao/[id]", acao: "cadastros.ver", chamar: (c) => r.verUmaVersaoDaFicha(req(`/api/fichas/versao/${INEXISTENTE}`, "GET", c), { id: INEXISTENTE }) },
  { metodo: "POST", caminho: "/api/fichas/importar", acao: "cadastros.gerenciar", chamar: (c) => r.importarFichasDaPlanilha(req("/api/fichas/importar", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/fichas/custo", acao: "cadastros.gerenciar", chamar: (c) => r.gravarCustoDeReferencia(req("/api/fichas/custo", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/fichas/limite", acao: "cadastros.gerenciar", chamar: (c) => r.gravarLimiteDeCusto(req("/api/fichas/limite", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/clube", acao: "clube.ver", chamar: (c) => r.verPainelDoClube(req("/api/clube", "GET", c)) },
  { metodo: "POST", caminho: "/api/clube/regras", acao: "clube.gerenciar", chamar: (c) => r.gravarRegrasDoClube(req("/api/clube/regras", "POST", c, { descontoPb: -1 })) },
  { metodo: "POST", caminho: "/api/clube/premios", acao: "clube.gerenciar", chamar: (c) => r.gravarPremioDoClube(req("/api/clube/premios", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/clube/presentes", acao: "clube.gerenciar", chamar: (c) => r.gravarPresenteDoClube(req("/api/clube/presentes", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/clube/campanhas", acao: "clube.gerenciar", chamar: (c) => r.gravarCampanhaDoClube(req("/api/clube/campanhas", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/clube/campanhas/cancelar", acao: "clube.gerenciar", chamar: (c) => r.cancelarCampanhaDoClube(req("/api/clube/campanhas/cancelar", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/cadastros/adicionais", acao: "cadastros.ver", chamar: (c) => r.verGruposDeAdicionais(req("/api/cadastros/adicionais", "GET", c)) },
  { metodo: "POST", caminho: "/api/cadastros/adicionais", acao: "cadastros.gerenciar", chamar: (c) => r.gravarGrupoDeAdicionais(req("/api/cadastros/adicionais", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/cadastros/tipos-producao", acao: "cadastros.ver", chamar: (c) => r.verTiposDeProducao(req("/api/cadastros/tipos-producao", "GET", c)) },
  { metodo: "POST", caminho: "/api/cadastros/tipos-producao", acao: "cadastros.gerenciar", chamar: (c) => r.gravarTipoDeProducao(req("/api/cadastros/tipos-producao", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/cadastros/categorias", acao: "cadastros.ver", chamar: (c) => r.verCategorias(req("/api/cadastros/categorias", "GET", c)) },
  { metodo: "POST", caminho: "/api/cadastros/categorias", acao: "cadastros.gerenciar", chamar: (c) => r.gravarCategoria(req("/api/cadastros/categorias", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/horarios", acao: "cadastros.ver", chamar: (c) => r.verHorariosDeVenda(req("/api/horarios", "GET", c)) },
  { metodo: "POST", caminho: "/api/horarios/semana", acao: "horarios.gerenciar", chamar: (c) => r.gravarSemanaDaUnidade(req("/api/horarios/semana", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/horarios/venda", acao: "horarios.gerenciar", chamar: (c) => r.gravarSemanaDeVenda(req("/api/horarios/venda", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/horarios/datas/unidade", acao: "horarios.gerenciar", chamar: (c) => r.gravarDataDaUnidade(req("/api/horarios/datas/unidade", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/horarios/datas/venda", acao: "horarios.gerenciar", chamar: (c) => r.gravarDataDeVenda(req("/api/horarios/datas/venda", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/horarios/datas/cancelar", acao: "horarios.gerenciar", chamar: (c) => r.cancelarData(req("/api/horarios/datas/cancelar", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/horarios/pausas", acao: "horarios.gerenciar", chamar: (c) => r.pausar(req("/api/horarios/pausas", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/horarios/pausas/retomar", acao: "horarios.gerenciar", chamar: (c) => r.retomar(req("/api/horarios/pausas/retomar", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/cadastros/embalagens", acao: "cadastros.ver", chamar: (c) => r.verEmbalagens(req("/api/cadastros/embalagens", "GET", c)) },
  { metodo: "POST", caminho: "/api/cadastros/embalagens", acao: "cadastros.gerenciar", chamar: (c) => r.gravarEmbalagem(req("/api/cadastros/embalagens", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/cadastros/ingredientes", acao: "cadastros.ver", chamar: (c) => r.verIngredientes(req("/api/cadastros/ingredientes", "GET", c)) },
  { metodo: "POST", caminho: "/api/cadastros/ingredientes", acao: "cadastros.gerenciar", chamar: (c) => r.gravarIngrediente(req("/api/cadastros/ingredientes", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/cadastros/ingredientes/[id]/conversoes", acao: "cadastros.gerenciar", chamar: (c) => r.gravarConversao(req(`/api/cadastros/ingredientes/${INEXISTENTE}/conversoes`, "POST", c, {}), { id: INEXISTENTE }) },
  { metodo: "POST", caminho: "/api/cadastros/ingredientes/[id]/alergenicos", acao: "cadastros.gerenciar", chamar: (c) => r.gravarAlergenicosDoIngrediente(req(`/api/cadastros/ingredientes/${INEXISTENTE}/alergenicos`, "POST", c, {}), { id: INEXISTENTE }) },
  { metodo: "GET", caminho: "/api/cadastros/alergenicos", acao: "cadastros.ver", chamar: (c) => r.verAlergenicos(req("/api/cadastros/alergenicos", "GET", c)) },
  { metodo: "POST", caminho: "/api/cadastros/alergenicos", acao: "cadastros.gerenciar", chamar: (c) => r.gravarAlergenico(req("/api/cadastros/alergenicos", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/cadastros/catalogo", acao: "cadastros.gerenciar", chamar: (c) => r.verCatalogo(req("/api/cadastros/catalogo", "GET", c)) },
  { metodo: "POST", caminho: "/api/cadastros/ingredientes/lote", acao: "cadastros.gerenciar", chamar: (c) => r.gravarLote(req("/api/cadastros/ingredientes/lote", "POST", c, [])) },
  { metodo: "POST", caminho: "/api/cadastros/lista-colada", acao: "cadastros.gerenciar", chamar: (c) => r.lerLista(req("/api/cadastros/lista-colada", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/cadastros/importar/conferir", acao: "cadastros.gerenciar", chamar: (c) => r.conferirImportacao(req("/api/cadastros/importar/conferir", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/cadastros/importar/gravar", acao: "cadastros.gerenciar", chamar: (c) => r.gravarImportacao(req("/api/cadastros/importar/gravar", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/cadastros/importar/modelo", acao: "cadastros.gerenciar", chamar: (c) => r.baixarModeloDePlanilha(req("/api/cadastros/importar/modelo", "GET", c)) },
  { metodo: "GET", caminho: "/api/cadastros/cnpj/[cnpj]", acao: "cadastros.gerenciar", chamar: (c) => r.verCnpj(req("/api/cadastros/cnpj/123", "GET", c), { cnpj: "123" }) },
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
  // Estoque (E09, decisão 0027). AREA = cuidar de alguma área (cozinha ou salão).
  { metodo: "GET", caminho: "/api/estoque", ...AREA, chamar: (c) => r.verPainelDoEstoque(req("/api/estoque?area=inventada", "GET", c)) },
  { metodo: "GET", caminho: "/api/estoque/item", ...AREA, chamar: (c) => r.verItemDoEstoque(req(`/api/estoque/item?ingredienteId=${INEXISTENTE}`, "GET", c)) },
  { metodo: "GET", caminho: "/api/estoque/item/historico", ...AREA, chamar: (c) => r.verHistoricoDoItem(req(`/api/estoque/item/historico?ingredienteId=${INEXISTENTE}`, "GET", c)) },
  { metodo: "GET", caminho: "/api/estoque/entradas", ...AREA, chamar: (c) => r.verEntradas(req("/api/estoque/entradas?limite=1&desde=2000-01-01&ate=2000-01-01", "GET", c)) },
  { metodo: "POST", caminho: "/api/estoque/entradas", ...AREA, chamar: (c) => r.darEntrada(req("/api/estoque/entradas", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/entradas/custo", acao: "custos.ver", chamar: (c) => r.corrigirCusto(req("/api/estoque/entradas/custo", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/entradas/foto", ...AREA, chamar: (c) => r.enviarFotoDaNota(req("/api/estoque/entradas/foto", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/estoque/entradas/foto/[id]", ...AREA, chamar: (c) => r.verFotoDaNota(req(`/api/estoque/entradas/foto/${INEXISTENTE}`, "GET", c), { id: INEXISTENTE }) },
  { metodo: "POST", caminho: "/api/estoque/transferir", ...AREA, chamar: (c) => r.transferirNoEstoque(req("/api/estoque/transferir", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/perda", ...AREA, chamar: (c) => r.lancarPerda(req("/api/estoque/perda", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/bloquear", ...AREA, chamar: (c) => r.bloquearNoEstoque(req("/api/estoque/bloquear", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/desbloquear", ...AREA, chamar: (c) => r.desbloquearNoEstoque(req("/api/estoque/desbloquear", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/produzir", ...AREA, chamar: (c) => r.produzirUmPreparo(req("/api/estoque/produzir", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/desfazer", acao: "estoque.desfazer", chamar: (c) => r.desfazerUmMovimento(req("/api/estoque/desfazer", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/saldo-inicial", ...AREA, chamar: (c) => r.saldoInicialDaPlanilha(req("/api/estoque/saldo-inicial", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/estoque/contagens", ...AREA, chamar: (c) => r.verContagens(req("/api/estoque/contagens?situacao=inventada", "GET", c)) },
  { metodo: "POST", caminho: "/api/estoque/contagens", ...AREA, chamar: (c) => r.novaContagem(req("/api/estoque/contagens", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/contagens/rapida", ...AREA, chamar: (c) => r.contagemRapida(req("/api/estoque/contagens/rapida", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/estoque/contagens/[id]", ...AREA, chamar: (c) => r.verUmaContagem(req(`/api/estoque/contagens/${INEXISTENTE}`, "GET", c), { id: INEXISTENTE }) },
  { metodo: "POST", caminho: "/api/estoque/contagens/contar", ...AREA, chamar: (c) => r.contarItem(req("/api/estoque/contagens/contar", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/contagens/fechar", ...AREA, chamar: (c) => r.fecharUmaContagem(req("/api/estoque/contagens/fechar", "POST", c, {})) },
  { metodo: "POST", caminho: "/api/estoque/contagens/cancelar", ...AREA, chamar: (c) => r.cancelarUmaContagem(req("/api/estoque/contagens/cancelar", "POST", c, {})) },
  { metodo: "GET", caminho: "/api/estoque/relatorios/perdas", ...AREA, chamar: (c) => r.verRelatorioDePerdas(req("/api/estoque/relatorios/perdas", "GET", c)) },
  { metodo: "GET", caminho: "/api/estoque/relatorios/contagens", ...AREA, chamar: (c) => r.verRelatorioDeContagens(req("/api/estoque/relatorios/contagens", "GET", c)) },
  { metodo: "GET", caminho: "/api/estoque/relatorios/valor", ...AREA, tambem: ["custos.ver"], chamar: (c) => r.verValorDoEstoque(req("/api/estoque/relatorios/valor", "GET", c)) },
  { metodo: "GET", caminho: "/api/estacao", acao: "estacao" },
  { metodo: "POST", caminho: "/api/estacao/entrar", acao: "estacao" },
  { metodo: "POST", caminho: "/api/estacao/ativar", acao: "estacao" },
  { metodo: "POST", caminho: "/api/estacao/sair", acao: "estacao" },
  { metodo: "POST", caminho: "/api/estacao/estender", acao: "estacao" },
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
      const acoes = [rota.acao, ...(rota.ou ?? [])];
      const tambem = rota.tambem ?? [];
      const permitido = acoes.some((x) => pode(cargo, x)) && tambem.every((x) => pode(cargo, x));
      expect(acoes.some((x) => eu.acoes.includes(x)) && tambem.every((x) => eu.acoes.includes(x)), `${cargo} menu ${acoes.join(" ou ")}`).toBe(permitido);
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
          .where("acao", "in", [...acoes, ...tambem])
          .executeTakeFirst();
        expect(recusa, `${nome}: recusa registrada`).toEqual({ usuario_id: eu.id, resultado: "recusado" });
      }
    }
  });

  it("consulta de avisos vinda de outro site é recusada (ela grava a entrega)", async () => {
    const cookie = await entrarComo("caixa");
    const pedido = req("/api/avisos", "GET", cookie);
    pedido.headers.set("sec-fetch-site", "cross-site");
    expect((await r.verAvisos(pedido)).status).toBe(403);
    expect((await r.verAvisos(req("/api/avisos", "GET", cookie))).status).toBe(200);
  });

  it("sem sessão: toda rota protegida volta 401", async () => {
    for (const rota of protegidas) expect((await rota.chamar("")).status, rota.caminho).toBe(401);
    expect((await r.quemSouEu(req("/api/eu", "GET"))).status).toBe(401);
    expect((await r.verAvisos(req("/api/avisos", "GET"))).status).toBe(401);
    expect((await r.marcarAvisosVistos(req("/api/avisos/vistos", "POST", undefined, { ids: [1] }))).status).toBe(401);
    expect((await r.resolverUmAviso(req("/api/avisos/1/resolver", "POST", undefined, {}), { id: "1" })).status).toBe(401);
    expect((await r.verMeuTurno(req("/api/eu/turno", "GET"))).status).toBe(401);
    expect((await r.continuarMeuTurno(req("/api/eu/turno", "POST", undefined, {}))).status).toBe(401);
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
    // A sessão do gestor no tablet foi encerrada na mesma resposta.
    expect(cad.headers.getSetCookie().some((c) => /^erp_sessao=;.*Max-Age=0/.test(c))).toBe(true);
    expect((await r.quemSouEu(req("/api/eu", "GET", gerente))).status).toBe(401);

    const tela = (await (await r.telaEstacao(req("/api/estacao", "GET", tablet))).json()) as { pessoas: { id: number; nome: string; cargo: string }[]; acoes: string[] };
    expect(tela.acoes).toEqual([]);
    const coz = tela.pessoas.find((p) => p.nome === "Teste cozinheira")!;
    expect((await r.entrarEstacao(req("/api/estacao/entrar", "POST", tablet, { usuarioId: coz.id, codigo: CODIGO_DE_TESTE }))).status).toBe(200);
    const depois = (await (await r.telaEstacao(req("/api/estacao", "GET", tablet))).json()) as { acoes: string[] };
    expect(depois.acoes).toContain("producao.operar");
    expect(depois.acoes).not.toContain("usuarios.ver");

    expect((await r.telaEstacao(req("/api/estacao", "GET", await entrarComo("gerente.geral")))).status).toBe(401);
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
