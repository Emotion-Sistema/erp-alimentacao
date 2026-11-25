import { expect, test, type Page } from "@playwright/test";
import { abrirConta, entrar, SENHA, semEstouroDeLargura } from "./ajudas";

/**
 * Tema claro ou escuro e letra normal ou grande, escolhidos por cada pessoa (decisão 0030).
 * Usa uma pessoa só deste teste, para a escolha dela não mudar as telas dos outros testes.
 */
const login = `pref.tela.${Date.now().toString(36)}`;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await entrar(page, "gerente.geral");
  const r = await page.request.post("/api/usuarios", {
    data: { nome: "Pessoa das preferências (teste)", login, senha: SENHA, cargo: "atendente" },
  });
  expect(r.ok(), await r.text()).toBe(true);
  await page.close();
});

const html = (page: Page) => page.locator("html");
const fundo = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const letra = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);

for (const [aparelho, viewport] of [
  ["computador", { width: 1440, height: 900 }],
  ["celular", { width: 390, height: 844 }],
] as const) {
  test(`${aparelho}: escolhe escuro e letra grande; a escolha fica guardada e volta ao claro`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await entrar(page, login);
    await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
    // Começa claro, com letra normal (Espuma de Leite, 16 px de base).
    await expect(html(page)).toHaveAttribute("data-tema", "claro");
    expect(await fundo(page)).toBe("rgb(253, 248, 240)");
    const tema = page.getByTestId("botao-tema");
    await expect(tema).toHaveAttribute("aria-pressed", "false");

    await tema.click();
    await expect(html(page)).toHaveAttribute("data-tema", "escuro");
    await expect(tema).toHaveAttribute("aria-pressed", "true");
    expect(await fundo(page)).toBe("rgb(27, 20, 17)"); // Noite de Torra
    await semEstouroDeLargura(page);

    await abrirConta(page);
    await page.getByTestId("botao-letra").click();
    await expect(html(page)).toHaveAttribute("data-letra", "grande");
    expect(await letra(page)).toBe("18px");

    // Recarregar (ou entrar em outro aparelho) mantém a escolha: vem do servidor, já no HTML.
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-tema", "escuro");
    await expect(html(page)).toHaveAttribute("data-letra", "grande");
    await semEstouroDeLargura(page);

    // Volta ao claro e à letra normal.
    await page.getByTestId("botao-tema").click();
    await abrirConta(page);
    await page.getByTestId("botao-letra").click();
    await expect(html(page)).toHaveAttribute("data-tema", "claro");
    await expect(html(page)).toHaveAttribute("data-letra", "normal");
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-tema", "claro");
    expect(await letra(page)).toBe("16px");
  });
}

test("a tela de entrada, sem ninguém dentro, é sempre clara", async ({ page }) => {
  await page.goto("/entrar");
  await expect(html(page)).toHaveAttribute("data-tema", "claro");
  expect(await fundo(page)).toBe("rgb(253, 248, 240)");
});
