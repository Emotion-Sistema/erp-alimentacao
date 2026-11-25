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
  cadastrarEmLote,
  catalogoParaCadastrar,
  cardapioParaLancar,
  listarModelosDeEmbalagem,
  listarCategorias,
  listarTiposDeProducao,
  listarProdutos,
  arquivoDaFoto,
  removerFotoDoProduto,
  salvarFotoDoProduto,
  FOTO_BYTES_MAXIMO,
  listarGruposDeAdicionais,
  verClube,
  painelDeFichas,
  importarFichas,
  verFicha,
  verVersaoDaFicha,
  salvarFicha,
  salvarCustoDeReferencia,
  salvarLimiteDeCusto,
  listarAlergenicos,
  salvarAlergenico,
  salvarAlergenicosDoIngrediente,
  salvarRegrasDoClube,
  salvarPremio,
  salvarPresente,
  agendarCampanha,
  cancelarCampanha,
  salvarGrupoDeAdicionais,
  salvarProduto,
  salvarTipoDeProducao,
  salvarCategoria,
  verHorarios,
  salvarSemanaDaUnidade,
  salvarSemanaDeVenda,
  salvarDataDaUnidade,
  salvarDataDeVenda,
  cancelarDataEspecial,
  pausarVenda,
  retomarVenda,
  salvarModeloDeEmbalagem,
  consultarCnpj,
  lerListaColada,
  listarFornecedores,
  listarIngredientes,
  salvarConversao,
  salvarFornecedor,
  salvarIngrediente,
  caixaDeAvisos,
  continuarNoTurno,
  mudarMargemDeTroca,
  verTurnos,
  situacaoDoTurno,
  enviarComunicado,
  listarComunicados,
  marcarVistos,
  resolverAviso,
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
  conferirPlanilha,
  exigir,
  gravarPlanilha,
  LIMITE_DE_BYTES,
  LIMITE_DE_CORRECOES,
  modeloDePlanilha,
  areasDoAtor,
  painelDoEstoque,
  estoqueDoItem,
  historicoDoItem,
  registrarEntrada,
  transferir,
  registrarPerda,
  bloquear,
  desbloquear,
  produzirPreparo,
  desfazerMovimento,
  listarEntradas,
  corrigirCustoDaEntrada,
  anexarFotoDaNota,
  arquivoDaFotoDaNota,
  importarSaldoInicial,
  abrirContagem,
  contagemRapidaDoDia,
  verContagem,
  registrarContagem,
  fecharContagem,
  cancelarContagem,
  listarContagens,
  relatorioDePerdas,
  relatorioDeContagens,
  valorDoEstoquePorArea,
  quemRecebeNaArea,
  recebimentosPendentes,
  confirmarRecebimento,
  recusarRecebimento,
  type Ator,
} from "@erp/dominio";
import QRCode from "qrcode";
import {
  conferirOrigem,
  cookieApagado,
  cookieEstacao,
  cookieSessao,
  corpoJson,
  corpoJsonLimitado,
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

// A consulta também entrega os avisos novos (grava "recebeu"): só vale vinda do próprio aplicativo.
export const verAvisos = seguro(async (req) => {
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new ErroDeRegra("sem_permissao", "Origem não permitida.");
  const filtro = Object.fromEntries(new URL(req.url).searchParams);
  return json(await caixaDeAvisos(obterBanco(), await ator(req), filtro));
});

export const marcarAvisosVistos = seguro(async (req) => json({ marcados: await marcarVistos(obterBanco(), await ator(req), await corpoJson(req)) }));

export const resolverUmAviso = seguroComId(async (req, p) => {
  await resolverAviso(obterBanco(), await ator(req), idDe(p));
  return json({ ok: true });
});

export const verMeuTurno = seguro(async (req) => json(await situacaoDoTurno(obterBanco(), await ator(req))));

export const continuarMeuTurno = seguro(async (req) => {
  const r = await continuarNoTurno(obterBanco(), await ator(req), await corpoJson(req), { ip: ipDaRequisicao(req), agente: req.headers.get("user-agent") });
  return json(await situacaoDoTurno(obterBanco(), r.ator), 200, { "set-cookie": cookieSessao(r.token, r.expiraEm) });
});

export const verTurnosDaUnidade = seguro(async (req) => json(await verTurnos(obterBanco(), await ator(req))));

export const mudarMargem = seguro(async (req) => json(await mudarMargemDeTroca(obterBanco(), await ator(req), await corpoJson(req))));

export const verComunicados = seguro(async (req) => json(await listarComunicados(obterBanco(), await ator(req))));

export const novoComunicado = seguro(async (req) => json(await enviarComunicado(obterBanco(), await ator(req), await corpoJson(req)), 201));

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

/**
 * Saúde: sem dado interno. Usado pelo monitoramento e pela publicação, que confere se a
 * versão no ar é o commit que acabou de implantar (ERP_VERSAO, posto pela implantação).
 */
export const saude = seguro(async () => {
  await sql`SELECT 1`.execute(obterBanco());
  const versao = process.env.ERP_VERSAO;
  return json({ ok: true, versao: versao && /^[0-9a-f]{40}$/.test(versao) ? versao : "desenvolvimento" });
});

// ---------- cadastros (E07, decisão 0015) ----------

// ---------- produtos (E07 parte 2, decisão 0018) ----------
export const verProdutos = seguro(async (req) => json(await listarProdutos(obterBanco(), await ator(req))));
export const gravarProduto = seguro(async (req) => json(await salvarProduto(obterBanco(), await ator(req), await corpoJson(req))));
// Grupos de adicionais (decisão 0021).
export const verGruposDeAdicionais = seguro(async (req) => json(await listarGruposDeAdicionais(obterBanco(), await ator(req))));
export const gravarGrupoDeAdicionais = seguro(async (req) => json(await salvarGrupoDeAdicionais(obterBanco(), await ator(req), await corpoJson(req))));

// Fichas técnicas (E08, decisão 0025). Custo só sai para quem tem custos.ver (o domínio tira).
export const verPainelDeFichas = seguro(async (req) => json(await painelDeFichas(obterBanco(), await ator(req))));
export const verUmaFicha = seguroComId(async (req, p) => json(await verFicha(obterBanco(), await ator(req), p.id)));
export const verUmaVersaoDaFicha = seguroComId(async (req, p) => json(await verVersaoDaFicha(obterBanco(), await ator(req), p.id)));
export const gravarFicha = seguro(async (req) => json(await salvarFicha(obterBanco(), await ator(req), await corpoJson(req))));
export const gravarCustoDeReferencia = seguro(async (req) => json(await salvarCustoDeReferencia(obterBanco(), await ator(req), await corpoJson(req))));
export const gravarLimiteDeCusto = seguro(async (req) => json(await salvarLimiteDeCusto(obterBanco(), await ator(req), await corpoJson(req))));

// Clube E-MOTION (RC-21, decisão 0024): só as regras; nada de dado de cliente.
export const verPainelDoClube = seguro(async (req) => json(await verClube(obterBanco(), await ator(req))));
export const gravarRegrasDoClube = seguro(async (req) => json(await salvarRegrasDoClube(obterBanco(), await ator(req), await corpoJson(req))));
export const gravarPremioDoClube = seguro(async (req) => json(await salvarPremio(obterBanco(), await ator(req), await corpoJson(req))));
export const gravarPresenteDoClube = seguro(async (req) => json(await salvarPresente(obterBanco(), await ator(req), await corpoJson(req))));
export const gravarCampanhaDoClube = seguro(async (req) => json(await agendarCampanha(obterBanco(), await ator(req), await corpoJson(req))));
export const cancelarCampanhaDoClube = seguro(async (req) => json(await cancelarCampanha(obterBanco(), await ator(req), await corpoJson(req))));

// Foto do produto (decisão 0022). Confere a permissão ANTES de ler o arquivo.
const LIMITE_DA_FOTO = Math.ceil(FOTO_BYTES_MAXIMO / 3) * 4 + 16 * 1024;
export const enviarFotoDoProduto = seguro(async (req) => {
  const db = obterBanco();
  const a = await ator(req);
  await exigir(db, a, "cadastros.gerenciar", { tipo: "produto_foto" });
  const corpo = await corpoJsonLimitado(req, LIMITE_DA_FOTO, "Foto grande demais: o máximo é 8 MB.");
  return json(await salvarFotoDoProduto(db, a, corpo), 201);
});
export const tirarFotoDoProduto = seguro(async (req) => json(await removerFotoDoProduto(obterBanco(), await ator(req), await corpoJson(req))));
/** O arquivo da foto. A foto de um id nunca muda (trocar cria outra), então pode ficar no cache do aparelho. */
export const verFotoDoProduto = seguroComId(async (req, p) => {
  const f = await arquivoDaFoto(obterBanco(), await ator(req), p.id);
  return new Response(new Uint8Array(f.conteudo), {
    status: 200,
    headers: {
      "content-type": f.tipo,
      "content-length": String(f.conteudo.length),
      "cache-control": "private, max-age=31536000, immutable",
      etag: `"${f.sha256}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
    },
  });
});

// ---------- cardápio para lançar pedido (tela Novo pedido; só leitura, pedidos.lancar) ----------
export const verCardapio = seguro(async (req) => json(await cardapioParaLancar(obterBanco(), await ator(req))));

// ---------- tipos de produção (E07 parte 2, decisão 0017) ----------
export const verTiposDeProducao = seguro(async (req) => json(await listarTiposDeProducao(obterBanco(), await ator(req))));
export const gravarTipoDeProducao = seguro(async (req) => json(await salvarTipoDeProducao(obterBanco(), await ator(req), await corpoJson(req))));

// ---------- categorias e horários de venda (E07 parte 2, decisão 0016) ----------
export const verCategorias = seguro(async (req) => json(await listarCategorias(obterBanco(), await ator(req))));
export const gravarCategoria = seguro(async (req) => json(await salvarCategoria(obterBanco(), await ator(req), await corpoJson(req))));
export const verHorariosDeVenda = seguro(async (req) => json(await verHorarios(obterBanco(), await ator(req))));
export const gravarSemanaDaUnidade = seguro(async (req) => json(await salvarSemanaDaUnidade(obterBanco(), await ator(req), await corpoJson(req))));
export const gravarSemanaDeVenda = seguro(async (req) => json(await salvarSemanaDeVenda(obterBanco(), await ator(req), await corpoJson(req))));
export const gravarDataDaUnidade = seguro(async (req) => json(await salvarDataDaUnidade(obterBanco(), await ator(req), await corpoJson(req))));
export const gravarDataDeVenda = seguro(async (req) => json(await salvarDataDeVenda(obterBanco(), await ator(req), await corpoJson(req))));
export const cancelarData = seguro(async (req) => json(await cancelarDataEspecial(obterBanco(), await ator(req), await corpoJson(req))));
export const pausar = seguro(async (req) => json(await pausarVenda(obterBanco(), await ator(req), await corpoJson(req))));
export const retomar = seguro(async (req) => json(await retomarVenda(obterBanco(), await ator(req), await corpoJson(req))));

export const verEmbalagens = seguro(async (req) => json(await listarModelosDeEmbalagem(obterBanco(), await ator(req))));
export const gravarEmbalagem = seguro(async (req) => {
  const db = obterBanco();
  return json(await salvarModeloDeEmbalagem(db, await ator(req), await corpoJson(req)));
});
export const verFornecedores = seguro(async (req) => json(await listarFornecedores(obterBanco(), await ator(req))));
export const gravarFornecedor = seguro(async (req) => {
  const db = obterBanco();
  return json(await salvarFornecedor(db, await ator(req), await corpoJson(req)));
});
export const verIngredientes = seguro(async (req) => json(await listarIngredientes(obterBanco(), await ator(req))));
export const gravarIngrediente = seguro(async (req) => {
  const db = obterBanco();
  return json(await salvarIngrediente(db, await ator(req), await corpoJson(req)));
});
export const gravarConversao = seguroComId(async (req, p) => {
  const db = obterBanco();
  return json(await salvarConversao(db, await ator(req), idDe(p), await corpoJson(req)));
});

// Alergênicos (S1, decisão 0026): catálogo e marcação do ingrediente. A permissão é do domínio.
export const verAlergenicos = seguro(async (req) => json(await listarAlergenicos(obterBanco(), await ator(req))));
export const gravarAlergenico = seguro(async (req) => json(await salvarAlergenico(obterBanco(), await ator(req), await corpoJson(req))));
export const gravarAlergenicosDoIngrediente = seguroComId(async (req, p) => {
  const corpo = await corpoJson(req);
  // O id do endereço manda; o domínio valida tudo depois de conferir a permissão.
  const dados = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? { ...corpo, ingredienteId: Number(p.id) } : corpo;
  return json(await salvarAlergenicosDoIngrediente(obterBanco(), await ator(req), dados));
});

// ---------- cadastro rápido (ideia nº 4) ----------

export const verCatalogo = seguro(async (req) => json(await catalogoParaCadastrar(obterBanco(), await ator(req))));
export const gravarLote = seguro(async (req) => {
  const db = obterBanco();
  return json(await cadastrarEmLote(db, await ator(req), await corpoJson(req)), 201);
});
/** Lê a lista colada e devolve a prévia (não grava). */
export const lerLista = seguro(async (req) => {
  const db = obterBanco();
  const corpo = (await corpoJson(req)) as { texto?: unknown };
  const cat = await catalogoParaCadastrar(db, await ator(req));
  if (typeof corpo?.texto !== "string" || corpo.texto.length > 60000)
    throw new ErroDeRegra("dados_invalidos", "Cole a lista (até 300 linhas).");
  return json({ linhas: lerListaColada(corpo.texto, cat.jaCadastrados) });
});
export const verCnpj = seguroComId(async (req, p) => json(await consultarCnpj(obterBanco(), await ator(req), p.cnpj ?? "")));

// ---------- importar planilha (E07 parte 3, decisão 0020) ----------

/**
 * O arquivo vai em base64 dentro do JSON: 2 MB viram cerca de 2,7 MB, mais folga para o resto e para
 * as correções do painel (até 2.000, cada uma com até 500 letras: cerca de 520 bytes no JSON).
 */
const TAMANHO_DO_ARQUIVO_NO_PEDIDO = Math.ceil(LIMITE_DE_BYTES / 3) * 4;
const LIMITE_DO_PEDIDO = TAMANHO_DO_ARQUIVO_NO_PEDIDO + 64 * 1024 + LIMITE_DE_CORRECOES * 520;
const MENSAGEM_DO_LIMITE = `Arquivo grande demais: o máximo é ${LIMITE_DE_BYTES / 1024 / 1024} MB. Divida a planilha em partes.`;
const MENSAGEM_DAS_CORRECOES = `Correções demais de uma vez (máximo ${LIMITE_DE_CORRECOES.toLocaleString("pt-BR")}). Grave uma parte e importe o resto depois.`;
/** Passou do limite: foi o arquivo (o "conteudo" passa do tamanho dele) ou as correções? */
function mensagemDoPedidoGrande(lido: Uint8Array): string {
  const texto = new TextDecoder().decode(lido);
  const inicio = texto.search(/"conteudo"\s*:\s*"/);
  if (inicio < 0) return MENSAGEM_DAS_CORRECOES;
  const comeco = texto.indexOf('"', texto.indexOf(":", inicio) + 1) + 1;
  const fim = texto.indexOf('"', comeco);
  return (fim < 0 ? texto.length : fim) - comeco > TAMANHO_DO_ARQUIVO_NO_PEDIDO ? MENSAGEM_DO_LIMITE : MENSAGEM_DAS_CORRECOES;
}
/** Confere a permissão ANTES de ler o arquivo (não lê 2 MB de quem não pode importar). */
async function pedidoDeImportacao(req: Request) {
  const db = obterBanco();
  const a = await ator(req);
  await exigir(db, a, "cadastros.gerenciar", { tipo: "importacao_planilha" });
  return { db, a, corpo: await corpoJsonLimitado(req, LIMITE_DO_PEDIDO, mensagemDoPedidoGrande) };
}
/** Passo 1: lê e confere; não grava nada. */
export const conferirImportacao = seguro(async (req) => {
  const { db, a, corpo } = await pedidoDeImportacao(req);
  return json(await conferirPlanilha(db, a, corpo));
});
/** Passo 2: grava tudo ou nada (a mesma chave não importa duas vezes). */
export const gravarImportacao = seguro(async (req) => {
  const { db, a, corpo } = await pedidoDeImportacao(req);
  const r = await gravarPlanilha(db, a, corpo);
  return json(r, r.repetida ? 200 : 201);
});
/** Fichas técnicas por planilha (E08): conferir (aplicar falso) ou gravar tudo de uma vez. */
export const importarFichasDaPlanilha = seguro(async (req) => {
  const db = obterBanco();
  const a = await ator(req);
  await exigir(db, a, "cadastros.gerenciar", { tipo: "importacao_fichas" });
  const corpo = await corpoJsonLimitado(req, LIMITE_DO_PEDIDO, mensagemDoPedidoGrande);
  return json(await importarFichas(db, a, corpo));
});
/** Modelo de planilha para baixar (?tipo=ingredientes|produtos&formato=xlsx|csv). */
export const baixarModeloDePlanilha = seguro(async (req) => {
  const u = new URL(req.url);
  const m = await modeloDePlanilha(obterBanco(), await ator(req), u.searchParams.get("tipo"), u.searchParams.get("formato"));
  return new Response(Buffer.from(m.bytes), {
    status: 200,
    headers: {
      "content-type": m.tipoDeConteudo,
      "content-disposition": `attachment; filename="${m.nome}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

// ---------- estoque (E09, decisão 0027) ----------

/**
 * Quem não cuida de nenhuma área de estoque é recusado (e auditado) ANTES de o pedido ser lido: o
 * domínio confere o formato antes da área, e assim ninguém de fora descobre nada pelo erro. O domínio
 * confere de novo a área certa de cada lançamento (cozinha ou salão).
 */
async function comAlgumaArea(req: Request): Promise<{ db: Banco; a: Ator | null }> {
  const db = obterBanco();
  const a = await ator(req);
  if (!a || areasDoAtor(a).length === 0 || a.segundoFator === "pendente") await exigir(db, a, "estoque.cozinha", { tipo: "estoque" });
  return { db, a };
}

/** Filtro da consulta (?chave=valor): números e sim/não viram o tipo certo; o domínio valida tudo. */
function filtroDaUrl(req: Request, numeros: readonly string[] = [], simOuNao: readonly string[] = []): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of new URL(req.url).searchParams) {
    if (v === "") continue;
    if (numeros.includes(k)) saida[k] = /^\d{1,10}$/.test(v) ? Number(v) : v;
    else if (simOuNao.includes(k)) saida[k] = v === "true" ? true : v === "false" ? false : v;
    else saida[k] = v;
  }
  return saida;
}

const ITEM_DA_URL = ["ingredienteId", "preparoId"] as const;

/** Lançamento do estoque: corpo lido com limite (uma entrada grande cabe com folga em 256 KB). */
const LIMITE_DO_LANCAMENTO = 256 * 1024;
const daArea = (fn: (db: Banco, a: Ator | null, dados: unknown) => Promise<unknown>, status = 200) =>
  seguro(async (req) => {
    const { db, a } = await comAlgumaArea(req);
    return json(await fn(db, a, await corpoJsonLimitado(req, LIMITE_DO_LANCAMENTO, "Pedido grande demais: divida em partes menores.")), status);
  });

// Consultas
export const verPainelDoEstoque = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  return json(await painelDoEstoque(db, a, filtroDaUrl(req)));
});
export const verItemDoEstoque = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  return json(await estoqueDoItem(db, a, filtroDaUrl(req, ITEM_DA_URL)));
});
export const verHistoricoDoItem = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  return json(await historicoDoItem(db, a, filtroDaUrl(req, [...ITEM_DA_URL, "limite"])));
});

/** Quem pode receber numa área (para mudar de lugar entre áreas: "quem recebeu"). */
export const verQuemRecebe = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  return json(await quemRecebeNaArea(db, a, filtroDaUrl(req)));
});

/** Recebimentos pendentes (mudança entre áreas esperando quem recebe), só das áreas da pessoa. */
export const verRecebimentos = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  return json(await recebimentosPendentes(db, a, filtroDaUrl(req)));
});
/** Quem recebe confirma (em uso ou guardado) ou recusa (com o motivo); o domínio confere quem pode. */
export const confirmarUmRecebimento = daArea(confirmarRecebimento);
export const recusarUmRecebimento = daArea(recusarRecebimento);

// Lançamentos (a chave contra toque duplo vem no corpo)
export const darEntrada = daArea(registrarEntrada, 201);
export const transferirNoEstoque = daArea(transferir);
export const lancarPerda = daArea(registrarPerda);
export const bloquearNoEstoque = daArea(bloquear);
export const desbloquearNoEstoque = daArea(desbloquear);
export const produzirUmPreparo = daArea(produzirPreparo, 201);
/** `estoque.desfazer` primeiro (o domínio confere antes de ler o pedido). */
export const desfazerUmMovimento = seguro(async (req) => json(await desfazerMovimento(obterBanco(), await ator(req), await corpoJson(req))));

// Compras
export const verEntradas = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  return json(await listarEntradas(db, a, filtroDaUrl(req, ["fornecedorId", "limite"], ["soEstimadas"])));
});
/** `custos.ver` primeiro (o domínio confere antes de ler o pedido). */
export const corrigirCusto = seguro(async (req) => json(await corrigirCustoDaEntrada(obterBanco(), await ator(req), await corpoJson(req))));
/** A foto vem em base64: a área é conferida ANTES de ler o arquivo. */
export const enviarFotoDaNota = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  const corpo = await corpoJsonLimitado(req, LIMITE_DA_FOTO, "Foto grande demais: o máximo é 8 MB.");
  return json(await anexarFotoDaNota(db, a, corpo), 201);
});
/** O arquivo da foto da nota (WebP refeito pelo servidor). A foto de um id nunca muda. */
export const verFotoDaNota = seguroComId(async (req, p) => {
  const { db, a } = await comAlgumaArea(req);
  const f = await arquivoDaFotoDaNota(db, a, p.id);
  return new Response(new Uint8Array(f.conteudo), {
    status: 200,
    headers: {
      "content-type": f.tipo,
      "content-length": String(f.conteudo.length),
      "cache-control": "private, max-age=31536000, immutable",
      etag: `"${f.sha256}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
    },
  });
});

/** Saldo inicial por planilha: conferir (aplicar falso) ou gravar. A área é conferida ANTES de ler o arquivo. */
export const saldoInicialDaPlanilha = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  const corpo = await corpoJsonLimitado(req, LIMITE_DO_PEDIDO, mensagemDoPedidoGrande);
  const r = await importarSaldoInicial(db, a, corpo);
  return json(r, r.aplicado && !r.repetido ? 201 : 200);
});

// Contagem (cega: enquanto aberta, a resposta nunca traz o esperado)
export const verContagens = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  return json(await listarContagens(db, a, filtroDaUrl(req, ["limite"])));
});
export const novaContagem = daArea(abrirContagem, 201);
export const contagemRapida = daArea(contagemRapidaDoDia);
export const verUmaContagem = seguroComId(async (req, p) => {
  const { db, a } = await comAlgumaArea(req);
  return json(await verContagem(db, a, { contagemId: /^\d{1,10}$/.test(p.id ?? "") ? Number(p.id) : p.id }));
});
export const contarItem = daArea(registrarContagem);
export const fecharUmaContagem = daArea(fecharContagem);
export const cancelarUmaContagem = daArea(cancelarContagem);

// Relatórios (só leitura; valores só com custos.ver)
export const verRelatorioDePerdas = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  return json(await relatorioDePerdas(db, a, filtroDaUrl(req)));
});
export const verRelatorioDeContagens = seguro(async (req) => {
  const { db, a } = await comAlgumaArea(req);
  return json(await relatorioDeContagens(db, a, filtroDaUrl(req)));
});
/** `custos.ver` (o domínio confere). */
export const verValorDoEstoque = seguro(async (req) => json(await valorDoEstoquePorArea(obterBanco(), await ator(req))));
