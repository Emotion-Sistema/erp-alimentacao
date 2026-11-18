import { expect, test } from "@playwright/test";
import { entrar } from "./ajudas";

// Tela cheia (18/11/2026): o navegador sai da tela cheia quando a página recarrega inteira.
// Abrir um aplicativo pelo lançador e trocar de cargo não podem recarregar a página.

const naoRecarregou = async (page: import("@playwright/test").Page) =>
  expect(
    await page.evaluate(
      () => (window as unknown as { __mesmaPagina?: boolean }).__mesmaPagina,
    ),
  ).toBe(true);

test("abrir um aplicativo pelo lançador não recarrega a página", async ({
  page,
}) => {
  await entrar(page, "gerente.geral");
  await expect(page.locator("a.erp-ladrilho").first()).toBeVisible();
  await page.evaluate(
    () =>
      ((window as unknown as { __mesmaPagina: boolean }).__mesmaPagina = true),
  );
  await page
    .getByRole("link", { name: /^Cadastros/ })
    .first()
    .click();
  await page.waitForURL("**/cadastros");
  await naoRecarregou(page);
});
