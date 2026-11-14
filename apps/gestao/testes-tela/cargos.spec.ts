import { expect, test } from "@playwright/test";
import { entrar, loginDoCargo, semEstouroDeLargura } from "./ajudas";

// Resultado esperado escrito à mão (independente do código), conforme a decisão 0011.
const TODOS = ["Avisos", "Funcionários", "Auditoria", "Estações"];
const MENU: Record<string, { nome: string; itens: string[] }> = {
  dono: { nome: "Dono", itens: TODOS },
  administrador: { nome: "Administrador", itens: TODOS },
  gerente_geral: { nome: "Gerente geral", itens: TODOS },
  financeiro: { nome: "Financeiro", itens: ["Avisos"] },
  supervisor: { nome: "Supervisor", itens: ["Avisos", "Funcionários", "Estações"] },
  atendente: { nome: "Atendente", itens: ["Avisos"] },
  caixa: { nome: "Caixa", itens: ["Avisos"] },
  cozinheira: { nome: "Cozinheira", itens: ["Avisos"] },
  auxiliar_cozinha: { nome: "Auxiliar de cozinha", itens: ["Avisos"] },
  motoboy: { nome: "Motoboy próprio", itens: ["Avisos"] },
  contador: { nome: "Contador externo", itens: ["Avisos"] },
};

test.use({ viewport: { width: 390, height: 844 } });

for (const [cargo, esperado] of Object.entries(MENU)) {
  test(`menu e telas do cargo ${cargo}`, async ({ page }) => {
    await entrar(page, loginDoCargo(cargo), cargo === "dono" || cargo === "administrador");
    await expect(page.getByTestId("cargo-ativo")).toHaveText(esperado.nome);

    const itens = await page.getByRole("navigation", { name: "Menu" }).getByRole("link").allTextContents();
    expect(itens).toEqual(esperado.itens);
    await semEstouroDeLargura(page);

    const telas: [string, string, string][] = [
      ["/funcionarios", "Funcionários", "Funcionários"],
      ["/auditoria", "Auditoria", "Auditoria"],
    ];
    for (const [url, itemDoMenu, titulo] of telas) {
      await page.goto(url);
      if (esperado.itens.includes(itemDoMenu)) {
        await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
      }
    }
    await page.goto("/minha-conta");
    await expect(page.getByRole("heading", { name: "Minha conta" })).toBeVisible();
    await semEstouroDeLargura(page);
  });
}

test("sem sessão, páginas internas levam para a entrada", async ({ page }) => {
  await page.goto("/funcionarios");
  await expect(page).toHaveURL(/\/entrar$/);
});

test("senha errada mostra a mensagem do servidor", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill("caixa");
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("dono entra de novo com segundo fator já configurado (código na tela de entrada)", async ({ page }) => {
  await entrar(page, "dono", true);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel("Usuário").fill("dono");
  await page.getByLabel("Senha").fill("senha-de-teste-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  // Pede o código do aplicativo (sem chegar à página inicial).
  await expect(page.getByLabel("Código do aplicativo autenticador")).toBeVisible();
  await page.getByLabel("Código do aplicativo autenticador").fill("000000");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
