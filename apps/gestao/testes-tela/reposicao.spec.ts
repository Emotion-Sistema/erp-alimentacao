import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { entrar, semEstouroDeLargura, sql } from "./ajudas";
import { BANCO } from "./playwright.config";

// Reposição (E10, decisão 0029), no celular: o gerente define as linhas de um item pela gaveta do
// detalhe (com a sugestão sem consumo e o erro do servidor quando a emergência passa da saudável);
// o painel mostra o selo "Repor" e o chip "Para repor" filtra; a aba Para repor das compras mostra
// quanto comprar, o fornecedor e o prazo, e baixa a lista. Só itens inventados.
// Com CAPTURAS=<pasta>, salva as telas (celular e computador) para conferir.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 } });

const SUFIXO = Math.random().toString(36).slice(2, 9).replace(/[0-9]/g, (c) => "qrstuvwxyz"[Number(c)]!);
const FARINHA = `Farinha repor ${SUFIXO}`;
const ACUCAR = `Açúcar repor ${SUFIXO}`;
const FORNECEDOR = `Moinho repor ${SUFIXO}`;
const PASTA = process.env.CAPTURAS;

async function capturar(page: Page, nome: string, alvo?: Locator) {
  if (!PASTA) return;
  mkdirSync(PASTA, { recursive: true });
  for (const [tamanho, largura, altura] of [["celular", 390, 844], ["computador", 1440, 900]] as const) {
    await page.setViewportSize({ width: largura, height: altura });
    const caminho = join(PASTA, `reposicao-${nome}-${tamanho}.png`);
    if (alvo) await alvo.screenshot({ path: caminho, animations: "disabled" });
    else await page.screenshot({ path: caminho, fullPage: true, animations: "disabled" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

/** Só no teste: um número do banco de teste de tela. */
function numero(comando: string): number {
  return Number(execFileSync("psql", [BANCO, "-tA", "-v", "ON_ERROR_STOP=1", "-c", comando], { encoding: "utf8" }).trim());
}

async function darEntrada(page: Page, ingredienteId: number, quantidade: string) {
  const r = await page.request.post("/api/estoque/entradas", {
    data: { chave: crypto.randomUUID(), itens: [{ ingredienteId, quantidade, unidade: "kg", local: "guardado" }] },
  });
  expect(r.status(), await r.text()).toBe(201);
}

let farinhaId = 0;
let acucarId = 0;

test.beforeAll(() => {
  sql(`INSERT INTO fornecedor (nome, prazo_entrega_dias) VALUES ('${FORNECEDOR}', 2)`);
  sql(`INSERT INTO ingrediente (nome, unidade_base, unidade_exibicao, area_estoque, fornecedor_id) VALUES ('${FARINHA}', 'g', 'kg', 'cozinha', (SELECT id FROM fornecedor WHERE nome = '${FORNECEDOR}'))`);
  sql(`INSERT INTO ingrediente (nome, unidade_base, unidade_exibicao, area_estoque) VALUES ('${ACUCAR}', 'g', 'kg', 'cozinha')`);
  farinhaId = numero(`SELECT id FROM ingrediente WHERE nome = '${FARINHA}'`);
  acucarId = numero(`SELECT id FROM ingrediente WHERE nome = '${ACUCAR}'`);
});

test("gerente define as linhas na gaveta do item e vê o selo no painel", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await darEntrada(page, farinhaId, "2");
  await darEntrada(page, acucarId, "1");

  await page.goto("/estoque");
  await page.getByLabel("Buscar item").fill(SUFIXO);
  const farinha = page.getByTestId(`item-${FARINHA}`);
  await expect(farinha.getByTestId("livre")).toHaveText("Livre 2 kg");
  await expect(farinha.getByTestId("situacao")).toHaveCount(0);
  await farinha.getByRole("button", { name: `Abrir ${FARINHA}` }).click();

  const detalhe = page.getByTestId("detalhe-do-item");
  const bloco = detalhe.getByTestId("linhas-de-reposicao");
  const cozinha = bloco.getByTestId("linhas-cozinha");
  await expect(cozinha.getByTestId("linhas-atuais")).toHaveText("Ainda sem linhas nesta área. Defina para o sistema avisar antes de acabar.");
  await expect(cozinha.getByTestId("dura-ate")).toContainText("Sem consumo nos últimos 28 dias");
  await expect(bloco.getByText("Nenhuma mudança ainda.")).toBeVisible();

  await cozinha.getByRole("button", { name: /^Mudar linhas/ }).click();
  const form = cozinha.getByTestId("form-linhas");
  // Sugestão sem consumo: diz isso e não inventa número.
  await form.getByRole("button", { name: "Usar sugestão" }).click();
  await expect(form.getByTestId("base-da-sugestao")).toHaveText("Sem consumo nos últimos 28 dias: não dá para saber até quando dura nem sugerir as linhas.");
  await expect(form.getByLabel("Linha saudável")).toHaveValue("");
  await expect(form.getByLabel("Unidade")).toHaveValue("kg");

  // Emergência maior que a saudável: o servidor recusa e a mensagem aparece.
  await form.getByLabel("Linha saudável").fill("5");
  await form.getByLabel("Linha de emergência").fill("6");
  await form.getByLabel("Nível de abastecimento do em uso").fill("0,5");
  await form.getByLabel("Aviso quando começar a usar o guardado").selectOption("normal");
  await form.getByRole("button", { name: "Salvar linhas" }).click();
  await expect(form.getByTestId("erro-das-linhas")).toHaveText("A linha de emergência não pode ser maior que a linha saudável.");

  await form.getByLabel("Linha de emergência").fill("1");
  await form.getByLabel("Observação").fill("Linha de teste.");
  await semEstouroDeLargura(page);
  await capturar(page, "form", detalhe);
  await form.getByRole("button", { name: "Salvar linhas" }).click();
  await expect(bloco.getByTestId("linhas-salvas")).toHaveText("Pronto: linhas salvas.");
  await expect(cozinha.getByTestId("form-linhas")).toHaveCount(0);
  await expect(cozinha.getByTestId("linhas-atuais")).toHaveText("Saudável: 5 kg. Emergência: 1 kg. Trazer do guardado abaixo de: 500 g. Aviso do guardado: Normal.");
  // 2 kg livres, abaixo da saudável (5 kg) e acima da emergência (1 kg): Repor.
  await expect(cozinha.getByTestId("situacao-da-area")).toHaveText("Repor");
  await expect(cozinha).toContainText("Mudou por último: Teste gerente geral");
  await expect(bloco.getByTestId("mudancas-das-linhas")).toContainText("Alimentos da cozinha: Saudável: 5 kg.");
  await expect(bloco.getByTestId("mudancas-das-linhas")).toContainText("Linha de teste.");
  await capturar(page, "linhas", detalhe);

  // Abrir de novo: o formulário vem com as linhas atuais na unidade mais à mão.
  await cozinha.getByRole("button", { name: /^Mudar linhas/ }).click();
  await expect(cozinha.getByTestId("form-linhas").getByLabel("Linha saudável")).toHaveValue("5");
  await expect(cozinha.getByTestId("form-linhas").getByLabel("Unidade")).toHaveValue("kg");
  await expect(cozinha.getByTestId("form-linhas").getByLabel("Observação")).toHaveValue("Linha de teste.");
  await cozinha.getByRole("button", { name: "Cancelar" }).click();

  await detalhe.getByRole("button", { name: "Fechar" }).click();
  await expect(detalhe).toHaveCount(0);
  // O painel recarregou: selo Repor na farinha; o açúcar (sem linha) não tem selo.
  await expect(farinha.getByTestId("situacao")).toHaveText("Repor");
  const acucar = page.getByTestId(`item-${ACUCAR}`);
  await expect(acucar).toBeVisible();
  await expect(acucar.getByTestId("situacao")).toHaveCount(0);

  // Chip "Para repor": só o que não está saudável.
  const chip = page.getByRole("button", { name: "Para repor" });
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(farinha).toBeVisible();
  await expect(acucar).toHaveCount(0);
  await semEstouroDeLargura(page);
  await capturar(page, "painel");
  await chip.click();
  await expect(acucar).toBeVisible();
});

test("aba Para repor das compras: quanto comprar, fornecedor e prazo; baixa a lista", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/estoque/compras");
  // É a primeira aba e já vem aberta.
  await expect(page.getByRole("tab", { name: "Para repor" })).toHaveAttribute("aria-selected", "true");
  const lista = page.getByTestId("para-repor");
  const linha = lista.getByTestId("secao-repor").getByTestId(`repor-${FARINHA}`);
  await expect(linha).toContainText("Alimentos da cozinha");
  await expect(linha).toContainText("Há agora: 2 kg. Linha saudável: 5 kg.");
  await expect(linha).toContainText(`Fornecedor: ${FORNECEDOR} (entrega em 2 dias)`);
  await expect(linha).toContainText("Desde ");
  await expect(linha.getByTestId("comprar")).toHaveText("Comprar 3 kg");
  await expect(lista.getByTestId(`repor-${ACUCAR}`)).toHaveCount(0);

  // Chips por área: a cozinha mostra a farinha.
  await lista.getByRole("button", { name: /^Alimentos da cozinha/ }).click();
  await expect(linha).toBeVisible();
  await semEstouroDeLargura(page);
  await capturar(page, "compras");

  const baixou = page.waitForEvent("download");
  await lista.getByRole("button", { name: "Baixar lista" }).click();
  const arquivo = await baixou;
  expect(arquivo.suggestedFilename()).toMatch(/^para-repor-\d{4}-\d{2}-\d{2}\.csv$/);
  const texto = readFileSync((await arquivo.path())!, "utf8");
  expect(texto).toContain("Situação;Item;Área;Há agora;Linha saudável;Comprar;A receber;Unidade;Fornecedor;Prazo de entrega (dias);Desde");
  expect(texto).toContain(`Repor;${FARINHA};Alimentos da cozinha;2000;5000;3000;0;g;${FORNECEDOR};2;`);
});

test("quem não compra não vê a lista para repor (o servidor recusa)", async ({ page }) => {
  await entrar(page, "cozinheira");
  const r = await page.request.get("/api/estoque/repor");
  expect(r.status()).toBe(403);
  // A cozinheira cuida da cozinha: vê as linhas da farinha no detalhe.
  await page.goto("/estoque");
  await page.getByLabel("Buscar item").fill(FARINHA);
  await page.getByRole("button", { name: `Abrir ${FARINHA}` }).click();
  await expect(page.getByTestId("linhas-cozinha").getByTestId("situacao-da-area")).toHaveText("Repor");
});
