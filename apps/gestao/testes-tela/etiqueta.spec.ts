import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { entrar, semEstouroDeLargura, sql } from "./ajudas";
import { BANCO } from "./playwright.config";

// Etiqueta com código em cada lote (ideia nº 16, versão 1), no celular:
// - cadastro do ingrediente: o código aparece na lista e na edição; trocar (repetido é recusado com
//   a mensagem do servidor); desligar "Usa etiqueta" faz a próxima entrada vir sem etiqueta;
// - entrada de mercadoria: "Escreva na etiqueta" com CODIGO-001 (vence) e CODIGO-002 (entrou);
// - painel do estoque: busca pelo código e pela etiqueta ("cod 2"); etiqueta fora da lista carregada
//   vai ao servidor e abre a gaveta com o lote marcado; etiqueta que não existe avisa;
// - preparo da casa: trocar o código na ficha e, ao produzir, "Escreva na etiqueta" com feito e vence.
// Só itens inventados.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 } });

const SUFIXO = Math.random().toString(36).slice(2, 9).replace(/[0-9]/g, (c) => "qrstuvwxyz"[Number(c)]!);
const NOME = `Bacalhau etiqueta ${SUFIXO}`;
const PREPARO = `Molho etiqueta ${SUFIXO}`;
/** Códigos novos, inventados (2 a 5 letras): Q... para o ingrediente, W... para o preparo. */
const COD = `Q${SUFIXO.slice(0, 4)}`.toUpperCase();
const COD_PREPARO = `W${SUFIXO.slice(0, 4)}`.toUpperCase();

/** Só no teste: um valor do banco de teste de tela. */
function valor(comando: string): string {
  return execFileSync("psql", [BANCO, "-tA", "-v", "ON_ERROR_STOP=1", "-c", comando], { encoding: "utf8" }).trim();
}
const idDe = () => Number(valor(`SELECT id FROM ingrediente WHERE nome = '${NOME}'`));
const etiquetaNoBanco = () => valor(`SELECT codigo || ' ' || usa_etiqueta FROM etiqueta_produto WHERE ingrediente_id = ${idDe()}`);

/** Hoje (fuso da loja) + n dias, em AAAA-MM-DD. */
function dia(n: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + n)).toISOString().slice(0, 10);
}
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

async function abrirEdicao(page: Page) {
  await page.goto("/cadastros");
  await page.getByRole("searchbox", { name: "Buscar por nome" }).fill(NOME);
  await page.getByRole("button", { name: `Editar ${NOME}`, exact: true }).click();
  const janela = page.getByRole("dialog", { name: `Editar ${NOME}` });
  await expect(janela).toBeVisible();
  return janela;
}

async function darEntradaNaTela(page: Page, validade: string | null) {
  await page.goto("/estoque/compras");
  await page.getByRole("tab", { name: "Dar entrada" }).click();
  const linha = page.getByTestId("linha-da-entrada-1");
  await linha.getByLabel("Ingrediente").selectOption({ label: NOME });
  await linha.getByLabel("Quantidade").fill("1");
  if (validade) await linha.getByLabel("Validade").fill(validade);
  await page.getByRole("button", { name: "Dar entrada em 1 item" }).click();
  await expect(page.getByTestId("entrada-gravada")).toHaveText("Entrada gravada: 1 item.");
}

test.beforeAll(() => {
  // O código nasce sozinho pelo nome (gatilho do banco), por qualquer caminho de cadastro.
  sql(`INSERT INTO ingrediente (nome, unidade_base, unidade_exibicao, area_estoque) VALUES ('${NOME}', 'g', 'kg', 'cozinha')`);
});

test("cadastro: o código aparece na lista e na edição; repetido é recusado; trocar grava", async ({ page }) => {
  await entrar(page, "gerente.geral");
  const gerado = etiquetaNoBanco().split(" ")[0]!;
  expect(gerado).toMatch(/^[A-Z][A-Z0-9]{1,4}$/);

  await page.goto("/cadastros");
  await page.getByRole("searchbox", { name: "Buscar por nome" }).fill(NOME);
  await expect(page.getByTestId(`ingrediente-${NOME}`).getByTestId("codigo-da-etiqueta")).toHaveText(`código da etiqueta ${gerado}`);

  const janela = await abrirEdicao(page);
  const campo = janela.getByLabel("Código da etiqueta");
  await expect(campo).toHaveValue(gerado);
  await expect(campo).toHaveAccessibleDescription(/Gerado pelo nome\. Vai em cada lote: BAC-001, BAC-002\.\.\./);
  await expect(janela.getByLabel("Usa etiqueta")).toBeChecked();
  await expect(janela.getByLabel("Usa etiqueta")).toHaveAccessibleDescription(/Desligue para o que não precisa de etiqueta, como sal, açúcar e descartáveis\./);

  // Minúscula vira maiúscula ao digitar; formato errado a tela avisa antes de mandar.
  await campo.fill("b");
  await expect(campo).toHaveValue("B");
  await janela.getByRole("button", { name: "Salvar ingrediente" }).click();
  await expect(janela.getByText("Use de 2 a 5 letras sem acento (pode ter número depois da primeira letra), como BAC.")).toBeVisible();
  expect(etiquetaNoBanco()).toBe(`${gerado} true`);

  // Código de outro produto: o servidor recusa e diz de quem é; a janela fica aberta.
  const doOvo = valor(`SELECT e.codigo FROM etiqueta_produto e JOIN ingrediente i ON i.id = e.ingrediente_id WHERE i.nome = 'Ovo'`);
  await campo.fill(doOvo);
  await janela.getByRole("button", { name: "Salvar ingrediente" }).click();
  await expect(janela.getByText(`Ingrediente salvo, mas a etiqueta não: O código ${doOvo} já é do ingrediente "Ovo". Escolha outro.`)).toBeVisible();
  expect(etiquetaNoBanco()).toBe(`${gerado} true`);

  await campo.fill(COD.toLowerCase());
  await expect(campo).toHaveValue(COD);
  await semEstouroDeLargura(page);
  await janela.getByRole("button", { name: "Salvar ingrediente" }).click();
  await expect(janela).toHaveCount(0);
  expect(etiquetaNoBanco()).toBe(`${COD} true`);
  await expect(page.getByTestId(`ingrediente-${NOME}`).getByTestId("codigo-da-etiqueta")).toHaveText(`código da etiqueta ${COD}`);
});

test("entrada: \"Escreva na etiqueta\" com o código e o número de cada lote", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await darEntradaNaTela(page, dia(4));
  const bloco = page.getByTestId("escreva-na-etiqueta");
  await expect(bloco.getByRole("heading", { name: "Escreva na etiqueta" })).toBeVisible();
  await expect(bloco.getByTestId(`etiqueta-${COD}-001`)).toHaveText(`${COD}-001 · vence ${ddmm(dia(4))}`);
  await semEstouroDeLargura(page);

  // Sem validade: o dia em que entrou.
  await page.getByRole("button", { name: "Dar entrada em outra compra" }).click();
  const linha = page.getByTestId("linha-da-entrada-1");
  await linha.getByLabel("Ingrediente").selectOption({ label: NOME });
  await linha.getByLabel("Quantidade").fill("1");
  await page.getByRole("button", { name: "Dar entrada em 1 item" }).click();
  await expect(page.getByTestId(`etiqueta-${COD}-002`)).toHaveText(`${COD}-002 · entrou ${ddmm(dia(0))}`);
});

test("painel: acha pelo código e pela etiqueta; fora da lista pergunta ao servidor e abre a gaveta", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/estoque");
  const busca = page.getByLabel("Buscar item");

  // Pelo código do produto.
  await busca.fill(COD.toLowerCase());
  const item = page.getByTestId(`item-${NOME}`);
  await expect(item).toBeVisible();
  await expect(item.getByTestId("codigo-do-item")).toHaveText(`código ${COD}`);
  await expect(page.getByTestId("itens-do-estoque").getByRole("listitem")).toHaveCount(1);

  // Pela etiqueta do pacote, do jeito que se digita: "cod 2". Abre com o lote marcado.
  await busca.fill(`${COD.toLowerCase()} 2`);
  await expect(page.getByTestId("itens-do-estoque").getByRole("listitem")).toHaveCount(1);
  await item.getByRole("button", { name: `Abrir ${NOME}` }).click();
  const gaveta = page.getByTestId("detalhe-do-item");
  await expect(gaveta.getByTestId(`lote-${COD}-002`)).toHaveAttribute("data-destaque", "sim");
  await expect(gaveta.getByTestId(`lote-${COD}-002`)).toContainText(`${COD}-002`);
  await expect(gaveta.getByTestId(`lote-${COD}-001`)).not.toHaveAttribute("data-destaque", "sim");

  // No seletor de lote, o texto começa pela etiqueta.
  await gaveta.getByRole("button", { name: "Perda" }).click();
  const form = gaveta.getByTestId("form-perda");
  await form.getByLabel("Onde está").selectOption("guardado");
  const opcoes = await form.getByLabel("Lote", { exact: true }).locator("option").allTextContents();
  expect(opcoes).toEqual(["O que vence primeiro", expect.stringMatching(new RegExp(`^${COD}-001, Validade `)), `${COD}-002, Sem validade`]);
  await semEstouroDeLargura(page);
  await gaveta.getByRole("button", { name: "Fechar" }).click();

  // Um lote que entrou depois que a lista carregou: a tela pergunta ao servidor e abre a gaveta.
  const r = await page.request.post("/api/estoque/entradas", { data: { chave: crypto.randomUUID(), itens: [{ ingredienteId: idDe(), quantidade: "1", unidade: "kg", local: "guardado" }] } });
  expect(r.status(), await r.text()).toBe(201);
  // Sem traço, como muita gente digita ("cod3"): o servidor decide qual lote é.
  await busca.fill(`${COD.toLowerCase()}3`);
  await expect(gaveta.getByTestId(`lote-${COD}-003`)).toHaveAttribute("data-destaque", "sim");
  await gaveta.getByRole("button", { name: "Fechar" }).click();

  // Etiqueta que não existe: a mensagem do servidor.
  await busca.fill(`${COD}-099`);
  await expect(page.getByTestId("busca-da-etiqueta")).toHaveText(`Nenhum lote com a etiqueta ${COD}-099 no seu estoque.`);
  await expect(gaveta).toHaveCount(0);
});

test("desligar \"Usa etiqueta\": a próxima entrada não mostra etiqueta", async ({ page }) => {
  await entrar(page, "gerente.geral");
  const janela = await abrirEdicao(page);
  await janela.getByLabel("Usa etiqueta").uncheck();
  await janela.getByRole("button", { name: "Salvar ingrediente" }).click();
  await expect(janela).toHaveCount(0);
  expect(etiquetaNoBanco()).toBe(`${COD} false`);
  await expect(page.getByTestId(`ingrediente-${NOME}`).getByTestId("codigo-da-etiqueta")).toHaveCount(0);

  await darEntradaNaTela(page, dia(5));
  await expect(page.getByTestId("escreva-na-etiqueta")).toHaveCount(0);
});

test("preparo da casa: trocar o código na ficha e, ao produzir, escrever feito e vence", async ({ page }) => {
  await entrar(page, "gerente.geral");
  const f = await page.request.post("/api/fichas", {
    data: { tipo: "preparo", nome: PREPARO, unidadeRendimento: "g", receita: { rende: "1000", validadeDias: 3, itens: [{ ingredienteId: idDe(), quantidade: "500" }] } },
  });
  expect(f.ok(), await f.text()).toBe(true);
  const preparoId = ((await f.json()) as { resumo: { id: number } }).resumo.id;
  const doPreparo = () => valor(`SELECT codigo || ' ' || usa_etiqueta FROM etiqueta_produto WHERE preparo_id = ${preparoId}`);
  const gerado = doPreparo().split(" ")[0]!;

  await page.goto(`/cadastros/fichas/${preparoId}`);
  const bloco = page.getByTestId("etiqueta-do-preparo");
  await expect(bloco.getByRole("heading", { name: "Etiqueta do lote" })).toBeVisible();
  await expect(bloco.getByLabel("Código da etiqueta")).toHaveValue(gerado);
  await bloco.getByLabel("Código da etiqueta").fill(COD_PREPARO);
  await bloco.getByRole("button", { name: "Salvar etiqueta" }).click();
  await expect(bloco.getByText("Etiqueta salva.")).toBeVisible();
  expect(doPreparo()).toBe(`${COD_PREPARO} true`);
  await semEstouroDeLargura(page);

  await page.goto("/estoque");
  await page.getByLabel("Buscar item").fill(PREPARO);
  await page.getByTestId(`item-${PREPARO}`).getByRole("button", { name: `Abrir ${PREPARO}` }).click();
  const gaveta = page.getByTestId("detalhe-do-item");
  await gaveta.getByRole("button", { name: "Produzir" }).click();
  const form = gaveta.getByTestId("form-producao");
  await form.getByLabel(/Quanto a receita manda fazer/).fill("1000");
  await form.getByLabel(/Quanto rendeu de verdade/).fill("1000");
  await form.getByRole("button", { name: "Gravar" }).click();
  await expect(gaveta.getByTestId("lancamento-feito")).toContainText("Pronto: produção lançada.");
  await expect(gaveta.getByTestId("escreva-na-etiqueta").getByTestId(`etiqueta-${COD_PREPARO}-001`)).toHaveText(`${COD_PREPARO}-001 · feito ${ddmm(dia(0))} · vence ${ddmm(dia(3))}`);
  await expect(gaveta.getByTestId(`lote-${COD_PREPARO}-001`)).toBeVisible();
});
