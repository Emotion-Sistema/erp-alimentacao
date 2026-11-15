import { expect, test } from "@playwright/test";
import { abrirAdicionar, entrar, semEstouroDeLargura } from "./ajudas";

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

test("gerente geral cria um ingrediente com conversão e vê '1 caixa = 30 un'", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await expect(page.getByRole("heading", { name: "Ingredientes", level: 1 })).toBeVisible();
  // Os ingredientes fictícios da semente aparecem e a dica das unidades que convertem sozinhas também.
  await expect(page.getByTestId("ingrediente-Ovo")).toContainText("caixa = 30 un");
  await expect(page.locator(".cadastros__dica").filter({ hasText: "já convertem sozinhas" })).toContainText("1 kg = 1.000 g");

  await abrirAdicionar(page, "Comum");
  await page.getByLabel("Nome", { exact: true }).fill("Ovo caipira (tela)");
  // Lista pronta com as 6 unidades, por extenso e nesta ordem.
  const unidade = page.getByLabel("Unidade do estoque");
  await expect(unidade.locator("option")).toHaveText(["Quilos (kg)", "Gramas (g)", "Litros (L)", "Mililitros (ml)", "Unidades (un)", "Dúzias (dz)"]);
  await unidade.selectOption("un");
  await page.getByLabel("Área", { exact: true }).selectOption("cozinha");
  await page.getByRole("button", { name: "Criar ingrediente" }).click();
  // Gravou: a janela fecha, o aviso aparece na lista e o novo fica em destaque.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Ingrediente criado/)).toBeVisible();
  await expect(page.getByTestId("ingrediente-Ovo caipira (tela)")).toHaveAttribute("data-realce", "sim");
  // Depois de criado (Editar abre a mesma janela), só dá para trocar dentro da família (un ou dz).
  await page.getByRole("button", { name: "Editar Ovo caipira (tela)" }).click();
  await expect(page.getByRole("dialog", { name: "Editar Ovo caipira (tela)" })).toBeVisible();
  await expect(page.getByLabel("Unidade do estoque").locator("option")).toHaveText(["Unidades (un)", "Dúzias (dz)"]);

  // Embalagens: o bloco vem recolhido; escolhe do catálogo (mesma família faz a conta sozinha).
  const bloco = page.getByTestId("bloco-embalagens");
  await expect(bloco.getByTestId("resumo-das-embalagens")).toHaveText("Nenhuma");
  await bloco.getByRole("button", { name: /^Mostrar Embalagens/ }).click();
  await bloco.getByRole("button", { name: "Escolher do catálogo" }).click();
  await bloco.getByRole("checkbox", { name: "Caixa 30 un" }).check();
  await expect(bloco.getByTestId("escolhidas")).toContainText("Caixa 30 un = 30 un");
  await bloco.getByRole("button", { name: "Adicionar 1 embalagem" }).click();
  await expect(bloco.getByText("1 embalagem adicionada.")).toBeVisible();
  await expect(page.getByTestId("ingrediente-Ovo caipira (tela)")).toContainText("caixa 30 un = 30 un");

  // Outra família (pacote de 500 g num item contado em un): pede a quantidade, aceita vírgula.
  await bloco.getByRole("button", { name: "Escolher do catálogo" }).click();
  await expect(bloco.getByRole("checkbox", { name: "Caixa 30 un (já colocada)" })).toBeDisabled();
  await bloco.getByRole("checkbox", { name: "Pacote 500 g" }).check();
  await expect(bloco.getByRole("button", { name: "Adicionar 1 embalagem" })).toBeDisabled();
  await bloco.getByLabel("Quantas unidades (un) vêm em 1 pacote 500 g?").fill("12,5");
  await bloco.getByRole("button", { name: "Adicionar 1 embalagem" }).click();
  await expect(page.getByTestId("ingrediente-Ovo caipira (tela)")).toContainText("pacote 500 g = 12,5 un");

  // Desativar tira da lista (nada é apagado) e o item fica marcado como desativado no bloco.
  await bloco.getByRole("button", { name: "Desativar embalagem pacote 500 g" }).click();
  await expect(page.getByTestId("ingrediente-Ovo caipira (tela)")).not.toContainText("pacote 500 g");
  await expect(bloco.getByTestId("conversoes-do-ingrediente")).toContainText("desativada");
  await semEstouroDeLargura(page);
});

test("Farinha em Quilos (kg): a lista mostra kg, a embalagem 'saco 25 kg' mostra 25 kg, e editar só oferece kg e g", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await abrirAdicionar(page, "Comum");
  await page.getByLabel("Nome", { exact: true }).fill("Farinha (tela kg)");
  await page.getByLabel("Unidade do estoque").selectOption("kg");
  await page.getByRole("button", { name: /^Mostrar Embalagens/ }).click();
  await page.getByRole("button", { name: "Escolher do catálogo" }).click();
  await page.getByRole("checkbox", { name: "Saco 25 kg" }).check();
  await expect(page.getByTestId("escolhidas")).toContainText("Saco 25 kg = 25 kg");
  await page.getByRole("button", { name: "Adicionar 1 embalagem" }).click();
  await expect(page.getByRole("list", { name: "Embalagens colocadas" })).toContainText("= 25 kg");
  await page.getByRole("button", { name: "Criar ingrediente" }).click();
  await expect(page.getByText(/Ingrediente criado/)).toBeVisible();
  await page.getByRole("button", { name: "Editar Farinha (tela kg)" }).click();
  await expect(page.getByLabel("Unidade do estoque").locator("option")).toHaveText(["Quilos (kg)", "Gramas (g)"]);
  // Sem nada digitado, Fechar fecha sem perguntar.
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("ingrediente-Ovo caipira (tela)")).toHaveAttribute("data-realce", "sim");
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
    await expect(page.getByRole("button", { name: "Adicionar ingrediente" })).toHaveCount(0);
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
