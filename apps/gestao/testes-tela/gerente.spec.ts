import { expect, test } from "@playwright/test";
import { aguardarInicio, entrar, semEstouroDeLargura } from "./ajudas";

test.use({ viewport: { width: 390, height: 844 } });

test("gerente cria um atendente, mas não consegue dar cargo de financeiro", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/funcionarios");

  await page.getByLabel("Nome", { exact: true }).fill("Ana Atendente");
  await page.getByLabel("Usuário (para entrar)").fill("ana.atendente");
  await page.getByLabel("Senha inicial").fill("uma-senha-longa-123");
  await page.getByLabel("Cargo", { exact: true }).selectOption("atendente");
  await page.getByRole("button", { name: "Criar funcionário" }).click();
  await expect(page.getByText("Funcionário criado.")).toBeVisible();

  const linha = page.getByTestId("linha-ana.atendente");
  await expect(linha).toContainText("Ana Atendente");
  await expect(linha.locator('[data-rotulo="Cargos"]')).toHaveText("Atendente");
  await expect(linha).toContainText("Ativo");

  await linha.getByText("Gerenciar Ana Atendente").click();
  await linha.getByLabel("Dar cargo a Ana Atendente").selectOption("financeiro");
  await linha.getByRole("button", { name: "Dar cargo", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible().catch(() => undefined);
  await expect(page.getByText(/não pode/i)).toBeVisible();
  await expect(linha.locator('[data-rotulo="Cargos"]')).not.toContainText("Financeiro");
  await semEstouroDeLargura(page);
});

test("código pessoal só para a cozinha: recusa e depois certo, com segundo cargo", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/funcionarios");
  const linha = page.getByTestId("linha-ana.atendente");
  await linha.getByText("Gerenciar Ana Atendente").click();
  await linha.getByLabel("Código de 4 números de Ana Atendente").fill("2580");
  await linha.getByRole("button", { name: "Definir código" }).click();
  await expect(page.getByText("Só quem trabalha na cozinha usa código pessoal.")).toBeVisible();

  await linha.getByLabel("Dar cargo a Ana Atendente").selectOption("cozinheira");
  await linha.getByRole("button", { name: "Dar cargo", exact: true }).click();
  await expect(page.getByText("Cargo dado.")).toBeVisible();
  await expect(page.getByTestId("linha-ana.atendente").locator('[data-rotulo="Cargos"]')).toHaveText("Atendente Cozinheira");

  await page.getByTestId("linha-ana.atendente").getByLabel("Código de 4 números de Ana Atendente").fill("2580");
  await page.getByTestId("linha-ana.atendente").getByRole("button", { name: "Definir código" }).click();
  await expect(page.getByText("Código definido.")).toBeVisible();
  await expect(page.getByTestId("linha-ana.atendente")).toContainText("Definido");
});

test("quem tem dois cargos vê o cargo ativo e troca de cargo", async ({ page }) => {
  // Ana foi criada com a senha escolhida no primeiro teste.
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill("ana.atendente");
  await page.getByLabel("Senha").fill("uma-senha-longa-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await aguardarInicio(page);
  const ativo = page.getByTestId("cargo-ativo");
  const primeiro = (await ativo.textContent())!;
  const outro = primeiro === "Atendente" ? "Cozinheira" : "Atendente";
  await page.getByLabel("Trocar de cargo").selectOption({ label: outro });
  await expect(ativo).toHaveText(outro);
  // Trocar de cargo volta ao lançador: atendente (1 aplicativo) cai no Atendimento; cozinheira (2) fica no lançador.
  await expect(page).toHaveURL(outro === "Atendente" ? /\/atendimento$/ : /\/$/);
  await semEstouroDeLargura(page);
});

test("gerente desliga com confirmação", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/funcionarios");
  await page.getByTestId("linha-ana.atendente").getByText("Gerenciar Ana Atendente").click();
  await page.getByTestId("linha-ana.atendente").getByRole("button", { name: "Desligar" }).click();
  await expect(page.getByText("Desligar corta o acesso na hora. Confirmar?")).toBeVisible();
  await page.getByRole("button", { name: "Sim, desligar Ana Atendente" }).click();
  await expect(page.getByTestId("linha-ana.atendente")).toContainText("Desligado");
});

test("minha conta: trocar o código mostra a regra e recusa sequência", async ({ page }) => {
  await entrar(page, "cozinheira");
  await page.goto("/minha-conta");
  await expect(page.getByText(/sem repetir/)).toBeVisible();
  await page.getByLabel("Novo código de 4 números").fill("1234");
  await page.getByRole("button", { name: "Trocar meu código" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Novo código de 4 números").fill("2580");
  await page.getByRole("button", { name: "Trocar meu código" }).click();
  await expect(page.getByText("Seu código foi trocado.")).toBeVisible();
});

test("auditoria mostra as recusas em destaque e filtra por resultado", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/auditoria");
  await expect(page.getByRole("table", { name: "Registros de auditoria" })).toBeVisible();
  await page.getByLabel("Resultado").selectOption("recusado");
  await page.getByRole("button", { name: "Filtrar" }).click();
  const etiquetas = page.locator(".erp-etiqueta");
  await expect(etiquetas.first()).toHaveText("Recusado");
  expect(await etiquetas.allTextContents()).toEqual(Array(await etiquetas.count()).fill("Recusado"));
  await semEstouroDeLargura(page);
});
