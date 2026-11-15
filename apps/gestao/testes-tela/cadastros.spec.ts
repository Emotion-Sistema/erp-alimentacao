import { expect, test } from "@playwright/test";
import { entrar, semEstouroDeLargura } from "./ajudas";

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

test("gerente geral cria um ingrediente com conversão e vê '1 caixa = 30 un'", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await expect(page.getByRole("heading", { name: "Ingredientes", level: 1 })).toBeVisible();
  // Os ingredientes fictícios da semente aparecem e a dica das unidades que convertem sozinhas também.
  await expect(page.getByTestId("ingrediente-Ovo")).toContainText("caixa = 30 un");
  await expect(page.locator(".cadastros__dica").filter({ hasText: "já convertem sozinhas" })).toContainText("1 kg = 1.000 g");

  await page.getByRole("button", { name: "Novo ingrediente" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Ovo caipira (tela)");
  // Lista pronta com as 6 unidades, por extenso e nesta ordem.
  const unidade = page.getByLabel("Unidade do estoque");
  await expect(unidade.locator("option")).toHaveText(["Quilos (kg)", "Gramas (g)", "Litros (L)", "Mililitros (ml)", "Unidades (un)", "Dúzias (dz)"]);
  await unidade.selectOption("un");
  await page.getByLabel("Área", { exact: true }).selectOption("cozinha");
  await page.getByRole("button", { name: "Criar ingrediente" }).click();
  await expect(page.getByText(/Ingrediente criado/)).toBeVisible();
  // Depois de criado, só dá para trocar dentro da família (un ou dz): a unidade de dentro não muda.
  await expect(page.getByLabel("Unidade do estoque").locator("option")).toHaveText(["Unidades (un)", "Dúzias (dz)"]);

  await page.getByRole("button", { name: "Adicionar conversão" }).click();
  await page.getByLabel("Unidade de compra (ex.: caixa)").fill("caixa");
  await page.getByLabel(/Quantidade em un/).fill("30");
  await expect(page.getByTestId("ajuda-conversao")).toHaveText("1 caixa = 30 un");
  await page.getByRole("button", { name: "Adicionar conversão" }).click();
  await expect(page.getByText("Conversão adicionada.")).toBeVisible();
  await expect(page.getByTestId("ingrediente-Ovo caipira (tela)")).toContainText("caixa = 30 un");

  // Quantidade com vírgula e recusa do servidor perto do formulário.
  await page.getByRole("button", { name: "Adicionar conversão" }).click();
  await page.getByLabel("Unidade de compra (ex.: caixa)").fill("bandeja");
  await page.getByLabel(/Quantidade em un/).fill("12,5");
  await page.getByRole("button", { name: "Adicionar conversão" }).click();
  await expect(page.getByTestId("ingrediente-Ovo caipira (tela)")).toContainText("bandeja = 12,5 un");

  await page.getByRole("button", { name: "Adicionar conversão" }).click();
  await page.getByLabel("Unidade de compra (ex.: caixa)").fill("dz");
  await page.getByLabel(/Quantidade em un/).fill("2");
  await page.getByRole("button", { name: "Adicionar conversão" }).click();
  await expect(page.getByText(/já é convertido sozinho/)).toBeVisible();

  // Desativar a conversão tira da lista (nada é apagado).
  await page.getByRole("button", { name: "Cancelar" }).last().click();
  await page.getByRole("button", { name: "Desativar a conversão bandeja" }).click();
  await expect(page.getByTestId("ingrediente-Ovo caipira (tela)")).not.toContainText("bandeja");
  await expect(page.getByTestId("conversoes-do-ingrediente")).toContainText("inativa");
  await semEstouroDeLargura(page);
});

test("Farinha em Quilos (kg): a lista mostra kg, a embalagem 'saco 25 kg' mostra 25 kg, e editar só oferece kg e g", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await page.getByRole("button", { name: "Novo ingrediente" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Farinha (tela kg)");
  await page.getByLabel("Unidade do estoque").selectOption("kg");
  await page.getByLabel("Embalagem com um toque").getByRole("button", { name: "saco" }).click();
  await page.getByLabel("Tamanho da embalagem").fill("25");
  await expect(page.getByTestId("previa-embalagem")).toHaveText("1 saco 25 kg = 25 kg");
  await page.getByRole("button", { name: "Adicionar esta embalagem" }).click();
  await page.getByRole("button", { name: "Criar ingrediente" }).click();
  await expect(page.getByText(/Ingrediente criado/)).toBeVisible();
  await expect(page.getByLabel("Unidade do estoque").locator("option")).toHaveText(["Quilos (kg)", "Gramas (g)"]);
  await page.getByRole("button", { name: "Fechar" }).first().click();
  const item = page.getByTestId("ingrediente-Farinha (tela kg)");
  await expect(item).toContainText("Quilos (kg)");
  await expect(item).toContainText("saco 25 kg = 25 kg");
  await expect(item).not.toContainText("25.000 g");
});

test("gerente geral busca, filtra e desativa um ingrediente", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await page.getByLabel("Buscar por nome").fill("caipira");
  await expect(page.getByTestId("lista-ingredientes").locator("> li")).toHaveCount(1);
  await page.getByLabel("Filtrar por área").selectOption("bebidas_salao");
  await expect(page.getByText("Nenhum ingrediente encontrado.")).toBeVisible();
  await page.getByLabel("Filtrar por área").selectOption("");
  await page.getByRole("button", { name: "Editar Ovo caipira (tela)" }).click();
  await page.getByLabel(/^Ativo/).uncheck();
  await page.getByRole("button", { name: "Salvar ingrediente" }).click();
  await expect(page.getByText("Ingrediente salvo.")).toBeVisible();
  await expect(page.getByTestId("ingrediente-Ovo caipira (tela)")).toContainText("Inativo");
});

test("gerente geral cria um fornecedor e o servidor recusa CNPJ inválido", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fornecedores");
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Hortifruti da tela (fictício)");
  await page.getByLabel("CPF ou CNPJ").fill("11111111111111");
  await page.getByRole("button", { name: "Criar fornecedor" }).click();
  await expect(page.getByText("CPF ou CNPJ inválido (confira os números).")).toBeVisible();
  await page.getByLabel("CPF ou CNPJ").fill("");
  await page.getByLabel("Prazo de entrega (dias)").fill("3");
  await page.getByRole("button", { name: "Criar fornecedor" }).click();
  await expect(page.getByText("Fornecedor criado.")).toBeVisible();
  await expect(page.getByTestId("fornecedor-Hortifruti da tela (fictício)")).toContainText(/Prazo de entrega\s*3 dias/);
  await semEstouroDeLargura(page);
});

test("cozinheira vê a lista, mas não vê botões de criar nem de editar", async ({ page }) => {
  await entrar(page, "cozinheira");
  for (const caminho of ["/cadastros", "/cadastros/fornecedores"]) {
    await page.goto(caminho);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("list", { name: /Ingredientes|Fornecedores/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Novo (ingrediente|fornecedor)$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Editar/ })).toHaveCount(0);
  }
});

test("atendente não vê o aplicativo Cadastros", async ({ page }) => {
  await entrar(page, "atendente");
  await expect(page.getByRole("link", { name: "Cadastros" })).toHaveCount(0);
  await page.goto("/cadastros");
  await expect(page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ingredientes", exact: true })).toHaveCount(0);
  await page.goto("/cadastros/fornecedores");
  await expect(page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
});
