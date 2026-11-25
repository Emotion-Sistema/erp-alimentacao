import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { entrar, semEstouroDeLargura, sql } from "./ajudas";

// Estoque (E09, decisão 0027), caminho principal no celular: o gerente dá entrada de 2 kg com
// fornecedor, nota e valor; o item aparece no painel com 2 kg guardados e o lote no detalhe; a
// cozinheira conta às cegas (a tela nunca mostra o esperado; o painel dela mostra "Em contagem") e
// fecha: a diferença e o que foi acertado aparecem. Também: mudar de lugar para outra área (fica "a
// receber" até alguém da cafeteria confirmar, decisão do responsável de 25/11/2026) e a cozinheira
// dando entrada pelo próprio painel, sem valor em reais. Só dados fictícios.
// Com CAPTURAS=<pasta>, salva as telas do celular para conferir.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 } });

const SUFIXO = Math.random().toString(36).slice(2, 9).replace(/[0-9]/g, (c) => "qrstuvwxyz"[Number(c)]!);
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

  // Para outra área: escolhe a Cafeteria e quem recebe (lista do servidor). Fica a receber lá.
  await detalhe.getByRole("button", { name: "Mudar de lugar" }).click();
  const outra = detalhe.getByTestId("form-transferencia");
  await outra.getByLabel("Sai de").selectOption("em_uso");
  await outra.getByLabel("Vai para").selectOption("cafeteria");
  await outra.getByLabel("Fica em").selectOption("em_uso");
  await outra.getByLabel("Quantidade").fill("100");
  await outra.getByLabel("Unidade").selectOption("g");
  await outra.getByRole("button", { name: "Gravar" }).click();
  await expect(outra.getByTestId("erro-do-lancamento")).toHaveText("Entre áreas, informe quem recebeu.");
  // Quem manda não recebe: o próprio gerente não aparece na lista.
  await expect(outra.getByLabel("Quem recebe").locator("option", { hasText: "Teste gerente geral" })).toHaveCount(0);
  await outra.getByLabel("Quem recebe").selectOption({ label: "Teste supervisor" });
  await capturar(page, "entre-areas", detalhe);
  await outra.getByRole("button", { name: "Gravar" }).click();
  await expect(detalhe.getByTestId("lancamento-feito")).toHaveText("Fica a receber na Cafeteria até Teste supervisor confirmar.");
  await expect(detalhe.getByTestId("lotes")).toContainText("A receber, Cafeteria: 100 g");
  await expect(detalhe.getByTestId("lotes")).toContainText("Em uso, Alimentos da cozinha: 400 g");
  await expect(detalhe.getByTestId("historico")).toContainText("Esperando quem recebe");
  await detalhe.getByRole("button", { name: "Fechar" }).click();
  await expect(detalhe).toHaveCount(0);
});

test("o supervisor da cafeteria confirma o que veio da cozinha", async ({ page }) => {
  await entrar(page, "supervisor");
  await page.goto("/estoque/salao");
  await expect(page.getByRole("heading", { level: 1, name: "Estoque do salão" })).toBeVisible();
  const bloco = page.getByTestId("a-receber");
  const linha = bloco.getByTestId(`receber-${TOMATE}`);
  await expect(linha).toContainText("100 g de Alimentos da cozinha, mandado por Teste gerente geral");
  await expect(linha).toContainText("Quem recebe: Teste supervisor.");
  // Enquanto não confirma, não é livre na cafeteria.
  await page.getByLabel("Buscar item").fill(TOMATE);
  const cartao = page.getByTestId(`item-${TOMATE}`);
  await expect(cartao.getByTestId("livre")).toHaveText("Livre 0 g");
  await expect(cartao.locator(".est-numero", { hasText: "A receber" })).toContainText("100 g");
  await linha.getByRole("button", { name: `Confirmar ${TOMATE}` }).click();
  const form = linha.getByTestId("form-confirmar-recebimento");
  // A sugestão de quem mandou vem escolhida; quem recebe decide.
  await expect(form.getByLabel("Onde fica")).toHaveValue("em_uso");
  await form.getByLabel("Onde fica").selectOption("guardado");
  await semEstouroDeLargura(page);
  await capturar(page, "a-receber");
  await form.getByRole("button", { name: "Confirmar o recebimento" }).click();
  await expect(bloco.getByTestId("recebimento-feito")).toHaveText(`Recebido: ${TOMATE} ficou em guardado.`);
  await expect(linha).toHaveCount(0);
  await expect(cartao.getByTestId("livre")).toHaveText("Livre 100 g");
});

test("cozinheira dá entrada pelo painel da cozinha, sem valor em reais", async ({ page }) => {
  await entrar(page, "cozinheira");
  await page.goto("/estoque");
  await page.getByRole("tab", { name: "Dar entrada" }).click();
  const linha = page.getByTestId("linha-da-entrada-1");
  await linha.getByLabel("Ingrediente").selectOption({ label: TOMATE });
  await linha.getByLabel("Quantidade").fill("300");
  await linha.getByLabel("Unidade").selectOption("g");
  await expect(page.getByLabel("Valor pago (R$)")).toHaveCount(0);
  // Só as áreas desta tela (a cozinha).
  await expect(linha.getByLabel("Área").locator("option")).toHaveText(["Área do cadastro", "Alimentos da cozinha"]);
  await semEstouroDeLargura(page);
  await capturar(page, "entrada-cozinha");
  await page.getByRole("button", { name: "Dar entrada em 1 item" }).click();
  await expect(page.getByTestId("entrada-gravada")).toHaveText("Entrada gravada: 1 item.");
  await page.getByRole("tab", { name: "Itens" }).click();
  await page.getByLabel("Buscar item").fill(TOMATE);
  // 2 kg - 100 g que foram para a cafeteria + 300 g = 2,2 kg na cozinha.
  await expect(page.getByTestId(`item-${TOMATE}`).getByTestId("livre")).toHaveText("Livre 2,2 kg");
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
  await expect(tela).not.toContainText("1,8 kg");
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
  await expect(fechada).toContainText("Diferença: -600 g");
  await expect(fechada).toContainText("Sistema esperava: 1,8 kg");
  await expect(fechada).toContainText("Acertado no estoque: -600 g");
  await capturar(page, "contagem-fechada");

  await page.getByRole("tab", { name: "Itens" }).click();
  await page.getByLabel("Buscar item").fill(TOMATE);
  // 1,2 kg contado no guardado + 400 g em uso.
  await expect(page.getByTestId(`item-${TOMATE}`).getByTestId("livre")).toHaveText("Livre 1,6 kg");
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
