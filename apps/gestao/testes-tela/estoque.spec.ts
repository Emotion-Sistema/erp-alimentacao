import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { entrar, semEstouroDeLargura, sql } from "./ajudas";

// Estoque (E09, decisão 0027), caminho principal no celular: o gerente dá entrada de 2 kg com
// fornecedor, nota e valor; o item aparece no painel com 2 kg guardados e o lote no detalhe; a
// cozinheira conta às cegas (a tela nunca mostra o esperado; o painel dela mostra "Em contagem") e
// fecha: a diferença e o que foi acertado aparecem, e o painel volta com 1,5 kg. Só dados fictícios.
// Com CAPTURAS=<pasta>, salva as telas do celular para conferir.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 } });

const SUFIXO = Math.random().toString(36).slice(2, 7).replace(/[0-9]/g, "x");
const TOMATE = `Tomate tela ${SUFIXO}`;
const FORNECEDOR = `Hortifruti tela ${SUFIXO}`;
const PASTA = process.env.CAPTURAS;

async function capturar(page: Page, nome: string, alvo?: Locator) {
  if (!PASTA) return;
  mkdirSync(PASTA, { recursive: true });
  const caminho = join(PASTA, `estoque-${nome}.png`);
  if (alvo) await alvo.screenshot({ path: caminho, animations: "disabled" });
  else await page.screenshot({ path: caminho, fullPage: true });
}

test.beforeAll(() => {
  sql(`INSERT INTO ingrediente (nome, unidade_base, unidade_exibicao, area_estoque) VALUES ('${TOMATE}', 'g', 'kg', 'cozinha')`);
  sql(`INSERT INTO fornecedor (nome) VALUES ('${FORNECEDOR}')`);
});

test("gerente dá entrada pela nota e vê no painel e no detalhe", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/estoque/compras");
  await expect(page.getByRole("heading", { level: 1, name: "Compras do estoque" })).toBeVisible();
  const form = page.getByTestId("form-entrada");
  await form.getByLabel("Fornecedor").selectOption({ label: FORNECEDOR });
  await form.getByLabel("Número da nota").fill("4567");
  const linha = page.getByTestId("linha-da-entrada-1");
  await linha.getByLabel("Ingrediente").selectOption({ label: TOMATE });
  await expect(linha.getByLabel("Unidade")).toHaveValue("kg");
  await linha.getByLabel("Quantidade").fill("2");
  await expect(linha.getByLabel("Onde está")).toHaveValue("guardado");
  await linha.getByLabel("Valor pago (R$)").fill("20,00");
  await semEstouroDeLargura(page);
  await capturar(page, "entrada");
  // Toque duplo: a chave do envio faz gravar uma vez só.
  await page.getByRole("button", { name: "Dar entrada em 1 item" }).dblclick();
  await expect(page.getByTestId("entrada-gravada")).toHaveText("Entrada gravada: 1 item.");
  await expect(page.getByLabel("Foto da nota")).toBeVisible();

  // Erro do servidor aparece como veio: validade passada não entra.
  await page.getByRole("button", { name: "Dar entrada em outra compra" }).click();
  await page.getByTestId("linha-da-entrada-1").getByLabel("Ingrediente").selectOption({ label: TOMATE });
  await page.getByTestId("linha-da-entrada-1").getByLabel("Quantidade").fill("1");
  await page.getByTestId("linha-da-entrada-1").getByLabel("Validade").fill("2020-01-01");
  await page.getByRole("button", { name: "Dar entrada em 1 item" }).click();
  await expect(page.getByTestId("erro-da-entrada")).toContainText("já passou. Produto vencido não entra no estoque.");

  await page.getByRole("tab", { name: "Entradas" }).click();
  await expect(page.getByTestId("lista-de-entradas").getByText("Nota 4567")).toHaveCount(1);
  await capturar(page, "entradas");

  await page.goto("/estoque");
  await expect(page.getByRole("heading", { level: 1, name: "Estoque da cozinha" })).toBeVisible();
  await page.getByLabel("Buscar item").fill(TOMATE);
  const cartao = page.getByTestId(`item-${TOMATE}`);
  await expect(cartao.getByTestId("livre")).toHaveText("Livre 2 kg");
  await expect(cartao).toContainText("Valor: R$ 20,00");
  await semEstouroDeLargura(page);
  await capturar(page, "painel");
  await cartao.getByRole("button", { name: `Abrir ${TOMATE}` }).click();
  const detalhe = page.getByTestId("detalhe-do-item");
  await expect(detalhe.getByTestId("lotes")).toContainText("Guardado, Alimentos da cozinha: 2 kg");
  await expect(detalhe.getByTestId("historico")).toContainText("Entrada (compra)");
  await expect(detalhe.getByTestId("historico")).toContainText("Ficou: 2 kg");
  await capturar(page, "detalhe", detalhe);

  // Mudar 500 g do guardado para o em uso (abastecer a linha).
  await detalhe.getByRole("button", { name: "Mudar de lugar" }).click();
  const mover = detalhe.getByTestId("form-transferencia");
  await mover.getByLabel("Quantidade").fill("500");
  await mover.getByLabel("Unidade").selectOption("g");
  await mover.getByRole("button", { name: "Gravar" }).click();
  await expect(detalhe.getByTestId("lancamento-feito")).toHaveText("Pronto: mudou de lugar.");
  await expect(detalhe.getByTestId("lotes")).toContainText("Em uso, Alimentos da cozinha: 500 g");
  await detalhe.getByRole("button", { name: "Fechar" }).click();
  await expect(detalhe).toHaveCount(0);
});

test("cozinheira conta às cegas e fecha: aparecem a diferença e o acerto", async ({ page }) => {
  await entrar(page, "cozinheira");
  await page.goto("/estoque");
  await page.getByRole("tab", { name: "Contagem" }).click();
  await page.getByLabel("Buscar item para contar").fill(TOMATE);
  await page.getByRole("checkbox", { name: TOMATE }).check();
  await page.getByRole("button", { name: "Começar a contar 1 item" }).click();
  const tela = page.getByTestId("tela-de-contar");
  await expect(tela.getByTestId("situacao-da-contagem")).toHaveText("Aberta");
  // Cega: nenhum número do sistema na tela de contar.
  await expect(tela).not.toContainText("esperava");
  await expect(tela).not.toContainText("1,5 kg");
  const guardado = tela.getByTestId(`contar-${TOMATE}-guardado`);
  await guardado.getByLabel(`Quanto você contou ${TOMATE} (Guardado)`).fill("1,2");
  await guardado.getByRole("button", { name: `Gravar ${TOMATE} (Guardado)` }).click();
  await expect(guardado.getByTestId("ja-contado")).toContainText("Contado: 1,2 kg");
  await expect(tela).not.toContainText("esperava");
  await semEstouroDeLargura(page);
  await capturar(page, "contar");

  // Enquanto a contagem está aberta, o painel da cozinheira não mostra os números do item.
  await page.getByRole("tab", { name: "Itens" }).click();
  await page.getByLabel("Buscar item").fill(TOMATE);
  await expect(page.getByTestId(`item-${TOMATE}`).getByTestId("livre")).toHaveText("Livre Em contagem");

  await page.getByRole("tab", { name: "Contagem" }).click();
  await page.getByTestId("lista-de-contagens").getByRole("button", { name: /Continuar/ }).first().click();
  await tela.getByRole("button", { name: "Fechar e acertar o estoque" }).click();
  await expect(tela.getByTestId("situacao-da-contagem")).toHaveText("Fechada");
  await expect(tela.getByTestId("contagem-fechada")).toHaveText("Contagem fechada. Veja as diferenças:");
  const fechada = tela.getByTestId(`contar-${TOMATE}-guardado`);
  await expect(fechada).toContainText("Diferença: -300 g");
  await expect(fechada).toContainText("Sistema esperava: 1,5 kg");
  await expect(fechada).toContainText("Acertado no estoque: -300 g");
  await capturar(page, "contagem-fechada");

  await page.getByRole("tab", { name: "Itens" }).click();
  await page.getByLabel("Buscar item").fill(TOMATE);
  await expect(page.getByTestId(`item-${TOMATE}`).getByTestId("livre")).toHaveText("Livre 1,7 kg");
  // A cozinheira não vê valores nem tem "Desfazer".
  await expect(page.getByTestId(`item-${TOMATE}`)).not.toContainText("R$");
  await page.getByRole("button", { name: `Abrir ${TOMATE}` }).click();
  await expect(page.getByTestId("historico")).toContainText("Ajuste da contagem");
  await expect(page.getByRole("button", { name: /^Desfazer/ })).toHaveCount(0);
});

test("relatórios: diferença da contagem e valor por área; planilha para baixar", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/estoque/custos");
  const difs = page.getByTestId("relatorio-diferencas");
  await expect(difs).toContainText(TOMATE);
  const baixa = page.waitForEvent("download");
  await difs.getByRole("button", { name: "Baixar planilha (.csv)" }).click();
  expect((await baixa).suggestedFilename()).toMatch(/^diferencas-.*\.csv$/);
  await expect(page.getByTestId("relatorio-valor")).toContainText("Total do estoque: R$");
  await semEstouroDeLargura(page);
  await capturar(page, "relatorios");
});
