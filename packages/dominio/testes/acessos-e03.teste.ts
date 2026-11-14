/**
 * E03 contra PostgreSQL real: bloqueio por tentativas, cargo ativo, segundo fator,
 * código pessoal na estação da cozinha (3 erros bloqueiam e avisam o supervisor),
 * dar e tirar cargo, consulta da auditoria.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  atorDaEstacao, atorDaSessao, ativarNaEstacao, avisosDoCargo, cadastrarEstacao, CODIGO_DE_TESTE, confirmarSegundoFator, consultarAuditoria,
  criarUsuario, darCargo, definirCodigo, desbloquearCodigo, desligarUsuario, entrar, entrarNaEstacao, ErroDeRegra, exigir, iniciarSegundoFator,
  listarEstacoes, listarUsuarios, reiniciarSegundoFator, revogarEstacao, sairDaEstacao, SENHA_DE_TESTE, telaDaEstacao, tirarCargo, trocarCargoAtivo,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, codigoAgora, prepararDados } from "./apoio";

let db: Banco;
let unidadeId: number;
const origem = { ip: "127.0.0.1", agente: "teste" };
const SENHA = "uma-senha-longa";

beforeAll(async () => {
  db = bancoDeTeste();
  ({ unidadeId } = await prepararDados(db));
});
afterAll(() => db.destroy());

async function erroDe(p: Promise<unknown>): Promise<ErroDeRegra> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDeRegra) return e;
    throw e;
  }
  throw new Error("era esperado um erro e a ação foi aceita");
}

let contador = 0;
async function novaPessoa(cargo: string, extra: { codigo?: string } = {}) {
  const adm = await atorDoCargo(db, "administrador");
  const login = `e03.${cargo.replace("_", ".")}.${++contador}`;
  const u = await criarUsuario(db, adm, { nome: `Pessoa ${login}`, login, senha: SENHA, cargo, unidadeId });
  if (extra.codigo) await definirCodigo(db, adm, u.id, { codigo: extra.codigo });
  return { ...u, login };
}

const id = (login: string) => db.selectFrom("usuario").select("id").where("login", "=", login).executeTakeFirstOrThrow().then((r) => r.id);

describe("senha errada: bloqueio temporário", () => {
  it("5 erros seguidos bloqueiam por 15 minutos; nem a senha certa entra; tudo registrado", async () => {
    const p = await novaPessoa("atendente");
    for (let i = 1; i <= 4; i++) expect((await erroDe(entrar(db, { login: p.login, senha: "errada-errada" }, origem))).codigo).toBe("nao_autenticado");
    expect((await erroDe(entrar(db, { login: p.login, senha: "errada-errada" }, origem))).codigo).toBe("bloqueado");
    expect((await erroDe(entrar(db, { login: p.login, senha: SENHA }, origem))).codigo).toBe("bloqueado");
    const regs = await db.selectFrom("auditoria").select(["resultado", "detalhes"]).where("usuario_id", "=", p.id).where("acao", "=", "sessao.entrar").orderBy("id").execute();
    expect(regs.map((r) => [r.resultado, r.detalhes.motivo, r.detalhes.bloqueou ?? null])).toEqual([
      ["falhou", "senha", false], ["falhou", "senha", false], ["falhou", "senha", false], ["falhou", "senha", false],
      ["falhou", "senha", true],
      ["recusado", "bloqueado", null],
    ]);
    // Passado o tempo, entra; e acertar zera a contagem.
    await db.updateTable("usuario").set({ senha_bloqueada_ate: new Date(Date.now() - 1000) }).where("id", "=", p.id).execute();
    await entrar(db, { login: p.login, senha: SENHA }, origem);
    const u = await db.selectFrom("usuario").select("senha_erros").where("id", "=", p.id).executeTakeFirstOrThrow();
    expect(u.senha_erros).toBe(0);
  });

  it("acertar antes do 5º erro zera a contagem", async () => {
    const p = await novaPessoa("atendente");
    for (let i = 0; i < 4; i++) await erroDe(entrar(db, { login: p.login, senha: "errada-errada" }, origem));
    await entrar(db, { login: p.login, senha: SENHA }, origem);
    for (let i = 0; i < 4; i++) expect((await erroDe(entrar(db, { login: p.login, senha: "errada-errada" }, origem))).codigo).toBe("nao_autenticado");
  });

  it("10 erros ao mesmo tempo: a contagem não se perde (bloqueia)", async () => {
    const p = await novaPessoa("atendente");
    await Promise.allSettled(Array.from({ length: 10 }, () => entrar(db, { login: p.login, senha: "errada-errada" }, origem)));
    expect((await erroDe(entrar(db, { login: p.login, senha: SENHA }, origem))).codigo).toBe("bloqueado");
  });
});

describe("cargo ativo", () => {
  it("quem tem dois cargos age só com o ativo; trocar fica registrado; não troca para cargo que não tem", async () => {
    const p = await novaPessoa("atendente");
    const adm = await atorDoCargo(db, "administrador");
    await darCargo(db, adm, p.id, { cargo: "supervisor" });
    let a = (await entrar(db, { login: p.login, senha: SENHA }, origem)).ator;
    expect(a.cargos).toEqual(["supervisor", "atendente"]);
    expect(a.cargoAtivo).toBe("supervisor");
    await exigir(db, a, "pedidos.alterar");
    a = await trocarCargoAtivo(db, a, { cargo: "atendente" });
    expect((await erroDe(exigir(db, a, "pedidos.alterar"))).codigo).toBe("sem_permissao");
    const r = (await atorDaSessao(db, (await entrar(db, { login: p.login, senha: SENHA }, origem)).token))!;
    expect(r.cargoAtivo).toBe("supervisor"); // cada sessão tem o seu
    expect((await erroDe(trocarCargoAtivo(db, a, { cargo: "dono" }))).codigo).toBe("sem_permissao");
    const regs = await db.selectFrom("auditoria").select(["resultado", "detalhes"]).where("usuario_id", "=", p.id).where("acao", "=", "sessao.trocar_cargo").orderBy("id").execute();
    expect(regs.map((x) => x.resultado)).toEqual(["permitido", "recusado"]);
  });

  it("cargo tirado enquanto a pessoa está dentro: o poder some na hora", async () => {
    const p = await novaPessoa("atendente");
    const adm = await atorDoCargo(db, "administrador");
    await darCargo(db, adm, p.id, { cargo: "supervisor" });
    const { token } = await entrar(db, { login: p.login, senha: SENHA }, origem);
    await tirarCargo(db, adm, p.id, { cargo: "supervisor" });
    const a = (await atorDaSessao(db, token))!;
    expect(a.cargos).toEqual(["atendente"]);
    expect(a.cargoAtivo).toBeNull();
    expect((await erroDe(exigir(db, a, "pedidos.alterar"))).codigo).toBe("sem_permissao");
    const historico = await db.selectFrom("usuario_perfil").select(["perfil_codigo", "removido_em", "removido_por"]).where("usuario_id", "=", p.id).orderBy("id").execute();
    expect(historico.map((h) => [h.perfil_codigo, !!h.removido_em, h.removido_por])).toEqual([["atendente", false, null], ["supervisor", true, adm.usuarioId]]);
  });
});

describe("dar e tirar cargo", () => {
  it("gerente geral dá caixa a uma atendente, mas não dá financeiro, não mexe no administrador nem em si mesmo", async () => {
    const gerente = await atorDoCargo(db, "gerente_geral");
    const p = await novaPessoa("atendente");
    await darCargo(db, gerente, p.id, { cargo: "caixa" });
    expect((await erroDe(darCargo(db, gerente, p.id, { cargo: "caixa" }))).codigo).toBe("conflito");
    expect((await erroDe(darCargo(db, gerente, p.id, { cargo: "financeiro" }))).codigo).toBe("sem_permissao");
    expect((await erroDe(darCargo(db, gerente, await id("administrador"), { cargo: "caixa" }))).codigo).toBe("sem_permissao");
    expect((await erroDe(darCargo(db, gerente, gerente.usuarioId, { cargo: "caixa" }))).codigo).toBe("sem_permissao");
    await tirarCargo(db, gerente, p.id, { cargo: "atendente" }); // ela tem atendente e caixa: o gerente pode tirar um
    expect((await listarUsuarios(db, gerente)).find((u) => u.id === p.id)?.cargos).toEqual(["caixa"]);
  });

  it("o último cargo não sai (para isso, desligar)", async () => {
    const adm = await atorDoCargo(db, "administrador");
    const p = await novaPessoa("caixa");
    expect((await erroDe(tirarCargo(db, adm, p.id, { cargo: "caixa" }))).codigo).toBe("conflito");
  });

  it("a lista de funcionários não expõe hash nem segredo", async () => {
    const lista = await listarUsuarios(db, await atorDoCargo(db, "gerente_geral"));
    const texto = JSON.stringify(lista);
    expect(texto).not.toMatch(/argon2|senha_hash|codigo_hash|totp/);
    expect(lista.find((u) => u.login === "cozinheira")?.codigoDefinido).toBe(true);
  });
});

describe("segundo fator (dono e administrador)", () => {
  it("sem confirmar o código, nada passa; configurar e confirmar libera", async () => {
    const adm = await atorDoCargo(db, "administrador");
    const nova = await criarUsuario(db, adm, { nome: "Nova Administradora", login: "e03.nova.adm", senha: SENHA, cargo: "administrador", unidadeId });
    let a = (await entrar(db, { login: "e03.nova.adm", senha: SENHA }, origem)).ator;
    expect(a.segundoFator).toBe("pendente");
    expect((await erroDe(listarUsuarios(db, a))).codigo).toBe("segundo_fator");
    const recusa = await db.selectFrom("auditoria").select(["detalhes"]).where("usuario_id", "=", nova.id).where("acao", "=", "usuarios.ver").executeTakeFirstOrThrow();
    expect(recusa.detalhes.motivo).toBe("segundo_fator_pendente");
    expect((await erroDe(trocarCargoAtivo(db, a, { cargo: "administrador" }))).codigo).toBe("segundo_fator");

    const { segredo, uri } = await iniciarSegundoFator(db, a);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    const guardado = await db.selectFrom("usuario").select(["totp_pendente"]).where("id", "=", nova.id).executeTakeFirstOrThrow();
    expect(guardado.totp_pendente).not.toContain(segredo); // cifrado
    expect((await erroDe(confirmarSegundoFator(db, a, { codigo: "000000" }))).codigo).toBe("dados_invalidos");
    const codigo = codigoAgora(segredo);
    a = await confirmarSegundoFator(db, a, { codigo });
    expect(a.segundoFator).toBe("ok");
    expect((await listarUsuarios(db, a)).length).toBeGreaterThan(0);

    // Nova entrada: o mesmo código (já usado) não vale de novo.
    const b = (await entrar(db, { login: "e03.nova.adm", senha: SENHA }, origem)).ator;
    expect(b.segundoFatorConfigurado).toBe(true);
    expect((await erroDe(confirmarSegundoFator(db, b, { codigo }))).codigo).toBe("dados_invalidos");
    // E não dá para reconfigurar sozinha (quem tem a senha não troca o celular).
    expect((await erroDe(iniciarSegundoFator(db, b))).codigo).toBe("conflito");
  });

  it("5 códigos errados bloqueiam a pessoa por 15 minutos e encerram a sessão", async () => {
    const adm = await atorDoCargo(db, "administrador");
    await criarUsuario(db, adm, { nome: "Outra Administradora", login: "e03.outra.adm", senha: SENHA, cargo: "administrador", unidadeId });
    const { token, ator } = await entrar(db, { login: "e03.outra.adm", senha: SENHA }, origem);
    await iniciarSegundoFator(db, ator);
    for (let i = 0; i < 4; i++) expect((await erroDe(confirmarSegundoFator(db, ator, { codigo: "000000" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(confirmarSegundoFator(db, ator, { codigo: "000000" }))).codigo).toBe("bloqueado");
    expect(await atorDaSessao(db, token)).toBeNull();
    // Entrar de novo com a senha não dá mais chances: o bloqueio é da pessoa, não da sessão.
    const outra = (await entrar(db, { login: "e03.outra.adm", senha: SENHA }, origem)).ator;
    expect((await erroDe(confirmarSegundoFator(db, outra, { codigo: "000000" }))).codigo).toBe("bloqueado");
  });

  it("quem tem cargo de administrador precisa do segundo fator mesmo agindo como caixa", async () => {
    const dono = await atorDoCargo(db, "dono");
    const p = await novaPessoa("caixa");
    await darCargo(db, dono, p.id, { cargo: "administrador" });
    const a = (await entrar(db, { login: p.login, senha: SENHA }, origem)).ator;
    expect(a.segundoFator).toBe("pendente");
  });

  it("reiniciar: outro administrador apaga o segundo fator e derruba as sessões; ninguém reinicia o próprio; gerente não reinicia administrador", async () => {
    const adm = await atorDoCargo(db, "administrador");
    const gerente = await atorDoCargo(db, "gerente_geral");
    const alvo = await id("e03.nova.adm");
    expect((await erroDe(reiniciarSegundoFator(db, gerente, alvo))).codigo).toBe("sem_permissao");
    expect((await erroDe(reiniciarSegundoFator(db, adm, adm.usuarioId))).codigo).toBe("sem_permissao");
    const { token } = await entrar(db, { login: "e03.nova.adm", senha: SENHA }, origem);
    await reiniciarSegundoFator(db, adm, alvo);
    expect(await atorDaSessao(db, token)).toBeNull();
    const u = await db.selectFrom("usuario").select(["totp_segredo"]).where("id", "=", alvo).executeTakeFirstOrThrow();
    expect(u.totp_segredo).toBeNull();
  });
});

describe("estação da cozinha e código pessoal", () => {
  async function estacao(nome: string) {
    const gerente = await atorDoCargo(db, "gerente_geral");
    return cadastrarEstacao(db, gerente, { nome });
  }

  it("só quem gerencia estações cadastra; supervisor vê a tela Geral; atendente não", async () => {
    const supervisor = await atorDoCargo(db, "supervisor");
    expect((await erroDe(cadastrarEstacao(db, supervisor, { nome: "Intrusa" }))).codigo).toBe("sem_permissao");
    const e = await estacao("Chapa");
    expect(e.token.length).toBeGreaterThan(30);
    const gravada = await db.selectFrom("estacao").select("token_hash").where("id", "=", e.id).executeTakeFirstOrThrow();
    expect(gravada.token_hash).not.toBe(e.token); // só o hash fica no banco
    expect((await listarEstacoes(db, supervisor)).map((x) => x.nome)).toContain("Chapa");
    expect((await erroDe(listarEstacoes(db, await atorDoCargo(db, "atendente")))).codigo).toBe("sem_permissao");
    expect((await erroDe(estacao("chapa"))).codigo).toBe("conflito");
  });

  it("aparelho sem cadastro não vê nada e não age", async () => {
    expect((await erroDe(telaDaEstacao(db, "token-inventado"))).codigo).toBe("nao_autenticado");
    expect((await erroDe(entrarNaEstacao(db, null, { usuarioId: 1, codigo: "1111" }))).codigo).toBe("nao_autenticado");
    expect(await atorDaEstacao(db, "token-inventado")).toBeNull();
  });

  it("toca na foto, digita o código: entra e fica ativa; a segunda pessoa assume com um toque; sair devolve a tela", async () => {
    const e = await estacao("Fritura");
    const coz = await id("cozinheira");
    const aux = await id("auxiliar.cozinha");
    let tela = await telaDaEstacao(db, e.token);
    expect(tela.pessoas.map((p) => p.cargo).sort()).toEqual(["auxiliar_cozinha", "cozinheira"]);
    expect(tela.pessoas.some((p) => p.cargo === "caixa")).toBe(false); // só quem é da cozinha aparece

    await entrarNaEstacao(db, e.token, { usuarioId: coz, codigo: CODIGO_DE_TESTE });
    let ator = (await atorDaEstacao(db, e.token))!;
    expect([ator.usuarioId, ator.cargoAtivo, ator.estacaoId]).toEqual([coz, "cozinheira", e.id]);
    await exigir(db, ator, "producao.operar");

    await entrarNaEstacao(db, e.token, { usuarioId: aux, codigo: CODIGO_DE_TESTE });
    ator = (await atorDaEstacao(db, e.token))!;
    expect(ator.usuarioId).toBe(aux); // quem acabou de entrar fica ativa
    expect((await erroDe(exigir(db, ator, "estoque.cozinha"))).codigo).toBe("sem_permissao"); // auxiliar: botões do cargo dela

    await ativarNaEstacao(db, e.token, { usuarioId: coz }); // um toque, sem código
    expect((await atorDaEstacao(db, e.token))!.usuarioId).toBe(coz);
    tela = await telaDaEstacao(db, e.token);
    expect(tela.pessoas.filter((p) => p.aqui).length).toBe(2);
    expect(tela.pessoas.filter((p) => p.ativa).map((p) => p.id)).toEqual([coz]);

    await sairDaEstacao(db, e.token, { usuarioId: coz });
    expect((await atorDaEstacao(db, e.token))!.usuarioId).toBe(aux); // sozinha na tela: tudo sai em nome dela
    await sairDaEstacao(db, e.token, { usuarioId: aux });
    expect(await atorDaEstacao(db, e.token)).toBeNull();
    const regs = await db.selectFrom("auditoria").select("acao").where("alvo_tipo", "=", "estacao").where("alvo_id", "=", String(e.id)).orderBy("id").execute();
    expect(regs.map((r) => r.acao)).toEqual(["estacoes.gerenciar", "estacao.entrar", "estacao.entrar", "estacao.ativar", "estacao.sair", "estacao.sair"]);
  });

  it("quem não toca na própria foto com código não assume (ativar exige ter entrado)", async () => {
    const e = await estacao("Bancada");
    expect((await erroDe(ativarNaEstacao(db, e.token, { usuarioId: await id("cozinheira") }))).codigo).toBe("nao_autenticado");
    expect((await erroDe(entrarNaEstacao(db, e.token, { usuarioId: await id("caixa"), codigo: CODIGO_DE_TESTE }))).codigo).toBe("nao_encontrado");
  });

  it("entrar em outra estação tira a pessoa da anterior", async () => {
    const a = await estacao("Estação A");
    const b = await estacao("Estação B");
    const p = await novaPessoa("cozinheira", { codigo: "3971" });
    await entrarNaEstacao(db, a.token, { usuarioId: p.id, codigo: "3971" });
    await entrarNaEstacao(db, b.token, { usuarioId: p.id, codigo: "3971" });
    expect(await atorDaEstacao(db, a.token)).toBeNull();
    expect((await atorDaEstacao(db, b.token))!.usuarioId).toBe(p.id);
    const abertas = await db.selectFrom("estacao_presenca").select("estacao_id").where("usuario_id", "=", p.id).where("saiu_em", "is", null).execute();
    expect(abertas.map((x) => x.estacao_id)).toEqual([b.id]);
  });

  it("código errado 3 vezes bloqueia, registra e avisa supervisor e gerente (uma vez só); supervisor desbloqueia", async () => {
    const e = await estacao("Forno");
    const p = await novaPessoa("cozinheira", { codigo: "4826" });
    expect((await erroDe(entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "1111" }))).message).toMatch(/Restam 2/);
    expect((await erroDe(entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "1111" }))).message).toMatch(/Restam 1/);
    expect((await erroDe(entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "1111" }))).codigo).toBe("bloqueado");
    expect((await erroDe(entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "4826" }))).codigo).toBe("bloqueado"); // nem o certo
    const avisos = await db.selectFrom("aviso").select(["para_cargos", "texto"]).where("tipo", "=", "codigo_bloqueado").where(sql<boolean>`dados->>'usuarioId' = ${String(p.id)}`).execute();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.para_cargos).toEqual(["supervisor", "gerente_geral"]);
    const supervisor = await atorDoCargo(db, "supervisor");
    expect((await avisosDoCargo(db, supervisor)).some((a) => a.texto.includes(p.nome))).toBe(true);
    expect((await avisosDoCargo(db, await atorDoCargo(db, "caixa"))).some((a) => a.texto.includes(p.nome))).toBe(false);
    const bloqueio = await db.selectFrom("auditoria").select("usuario_id").where("acao", "=", "codigo.bloqueado").where("alvo_id", "=", String(p.id)).execute();
    expect(bloqueio).toHaveLength(1);

    expect((await erroDe(desbloquearCodigo(db, await atorDoCargo(db, "atendente"), p.id))).codigo).toBe("sem_permissao");
    await desbloquearCodigo(db, supervisor, p.id);
    await entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "4826" });
    expect((await atorDaEstacao(db, e.token))!.usuarioId).toBe(p.id);
  });

  it("8 códigos errados ao mesmo tempo: bloqueia e avisa uma vez só", async () => {
    const e = await estacao("Salgados");
    const p = await novaPessoa("cozinheira", { codigo: "5193" });
    await Promise.allSettled(Array.from({ length: 8 }, () => entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "0000" })));
    const avisos = await db.selectFrom("aviso").select("id").where("tipo", "=", "codigo_bloqueado").where(sql<boolean>`dados->>'usuarioId' = ${String(p.id)}`).execute();
    expect(avisos).toHaveLength(1);
    expect((await db.selectFrom("usuario").select("codigo_bloqueado_em").where("id", "=", p.id).executeTakeFirstOrThrow()).codigo_bloqueado_em).not.toBeNull();
  });

  it("ação sensível na estação pede o código de novo", async () => {
    const e = await estacao("Confeitaria");
    const p = await novaPessoa("cozinheira", { codigo: "7314" });
    await entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "7314" });
    const semCodigo = (await atorDaEstacao(db, e.token))!;
    expect((await erroDe(exigir(db, semCodigo, "producao.sensivel"))).codigo).toBe("confirmar_codigo");
    expect((await erroDe(atorDaEstacao(db, e.token, { codigo: "9999" }))).codigo).toBe("nao_autenticado");
    const comCodigo = (await atorDaEstacao(db, e.token, { codigo: "7314" }))!;
    await exigir(db, comCodigo, "producao.sensivel");
  });

  it("código: só 4 números, sem repetição nem sequência; só para quem é da cozinha; nunca vai para a auditoria", async () => {
    const adm = await atorDoCargo(db, "administrador");
    const p = await novaPessoa("cozinheira");
    for (const codigo of ["123", "12345", "abcd", "1111", "1234", "4321", "6789"]) {
      expect((await erroDe(definirCodigo(db, adm, p.id, { codigo }))).codigo, codigo).toBe("dados_invalidos");
    }
    expect((await erroDe(definirCodigo(db, adm, await id("caixa"), { codigo: "3971" }))).codigo).toBe("dados_invalidos");
    // A própria pessoa troca o seu.
    const ela = (await entrar(db, { login: p.login, senha: SENHA }, origem)).ator;
    await definirCodigo(db, ela, p.id, { codigo: "8642" });
    const regs = await db.selectFrom("auditoria").select("detalhes").where("acao", "=", "codigo.definir").where("alvo_id", "=", String(p.id)).execute();
    expect(JSON.stringify(regs)).not.toContain("8642");
    // Cozinheira não define o código de outra pessoa.
    expect((await erroDe(definirCodigo(db, ela, await id("auxiliar.cozinha"), { codigo: "3971" }))).codigo).toBe("sem_permissao");
  });

  it("fim do turno: a presença vence sozinha e a pessoa sai", async () => {
    const e = await estacao("Turno");
    const p = await novaPessoa("auxiliar_cozinha", { codigo: "6158" });
    await entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "6158" });
    const pres = await db.selectFrom("estacao_presenca").select(["expira_em", "entrou_em"]).where("usuario_id", "=", p.id).where("saiu_em", "is", null).executeTakeFirstOrThrow();
    const horas = (new Date(pres.expira_em).getTime() - new Date(pres.entrou_em).getTime()) / 3_600_000;
    expect(horas).toBeGreaterThan(0);
    expect(horas).toBeLessThanOrEqual(16);
    await sql`UPDATE estacao_presenca SET entrou_em = now() - interval '2 hours', expira_em = now() - interval '1 second' WHERE usuario_id = ${p.id} AND saiu_em IS NULL`.execute(db);
    expect(await atorDaEstacao(db, e.token)).toBeNull();
    await telaDaEstacao(db, e.token);
    const fechada = await db.selectFrom("estacao_presenca").select("motivo_saida").where("usuario_id", "=", p.id).executeTakeFirstOrThrow();
    expect(fechada.motivo_saida).toBe("expirou");
  });

  it("desligar tira a pessoa da estação na hora; revogar a estação tira todo mundo", async () => {
    const adm = await atorDoCargo(db, "administrador");
    const e = await estacao("Desligamento");
    const p = await novaPessoa("cozinheira", { codigo: "2749" });
    await entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "2749" });
    await desligarUsuario(db, adm, p.id);
    expect(await atorDaEstacao(db, e.token)).toBeNull();

    const q = await novaPessoa("cozinheira", { codigo: "2749" });
    await entrarNaEstacao(db, e.token, { usuarioId: q.id, codigo: "2749" });
    await revogarEstacao(db, await atorDoCargo(db, "gerente_geral"), e.id);
    expect(await atorDaEstacao(db, e.token)).toBeNull();
    expect((await erroDe(telaDaEstacao(db, e.token))).codigo).toBe("nao_autenticado");
  });
});

describe("consulta da auditoria", () => {
  it("gerente consulta com filtros; caixa não consulta e a recusa fica registrada", async () => {
    const gerente = await atorDoCargo(db, "gerente_geral");
    const caixa = await atorDoCargo(db, "caixa");
    const recusas = await consultarAuditoria(db, gerente, { usuarioId: String(caixa.usuarioId), resultado: "permitido", limite: "5" });
    expect(recusas.length).toBeGreaterThan(0);
    expect(recusas.every((r) => r.usuarioId === caixa.usuarioId && r.resultado === "permitido")).toBe(true);
    expect((await erroDe(consultarAuditoria(db, caixa, {}))).codigo).toBe("sem_permissao");
    const ultima = (await consultarAuditoria(db, gerente, { acao: "auditoria.ver", limite: "1" }))[0]!;
    expect([ultima.resultado, ultima.usuarioId]).toEqual(["recusado", caixa.usuarioId]);
    expect((await erroDe(consultarAuditoria(db, gerente, { limite: "9999" }))).codigo).toBe("dados_invalidos");
    // paginação
    const p1 = await consultarAuditoria(db, gerente, { limite: "3" });
    const p2 = await consultarAuditoria(db, gerente, { limite: "3", antesDe: p1[2]!.id });
    expect(Number(p2[0]!.id)).toBeLessThan(Number(p1[2]!.id));
  });
});

describe("senha de teste da semente", () => {
  it("todos os usuários fictícios entram com a senha de teste", async () => {
    expect((await entrar(db, { login: "contador", senha: SENHA_DE_TESTE }, origem)).ator.cargoAtivo).toBe("contador");
  });
});
