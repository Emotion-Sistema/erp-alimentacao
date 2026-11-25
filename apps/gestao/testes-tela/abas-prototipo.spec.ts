import { expect, test, type Locator, type Page } from "@playwright/test";
import { entrar, semEstouroDeLargura } from "./ajudas";

// Abas novas no visual do protótipo A (pedido do responsável, 25/11/2026): Mesas, Novo pedido e
// Produção. Os pedidos ainda não existem (etapa E13): as telas mostram o que já é real e dizem o
// que só liga com os pedidos. Nenhum número inventado.

const TAMANHOS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

/** Todo alvo de toque visível do conteúdo com 44 px ou mais (altura e largura). */
async function alvosGrandes(page: Page, alvos: Locator) {
  const medidas = await alvos.evaluateAll((els) =>
    els
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { texto: (e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30), w: r.width, h: r.height };
      }),
  );
  expect(medidas.length).toBeGreaterThan(0);
  for (const m of medidas) {
    expect(m.h, `altura de "${m.texto}"`).toBeGreaterThanOrEqual(44);
    expect(m.w, `largura de "${m.texto}"`).toBeGreaterThanOrEqual(44);
  }
}

test.describe("Mesas", () => {
  test("atendente: mapa com as 11 mesas livres; o popup abre e leva ao novo pedido da mesa", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, "atendente");
    await page.goto("/atendimento");
    await expect(page.getByRole("heading", { level: 1, name: "Mesas" })).toBeAttached();
    const mesas = page.locator("button.mesa");
    await expect(mesas).toHaveCount(11);
    await expect(page.locator("button.mesa.mesa--livre")).toHaveCount(11);
    await expect(page.getByTestId("mesas-livres")).toHaveText("11 livres de 11");
    await expect(page.getByRole("button", { name: /^Todas/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("quando os pedidos começarem a funcionar (etapa E13)")).toBeVisible();

    // Filtro "Ocupadas": nenhuma está ocupada, então todas ficam apagadas (nada some do mapa).
    await page.getByRole("button", { name: /^Ocupadas/ }).click();
    await expect(page.locator("button.mesa.mesa--apagada")).toHaveCount(11);
    await page.getByRole("button", { name: /^Todas/ }).click();
    await expect(page.locator("button.mesa.mesa--apagada")).toHaveCount(0);

    // Popup sem rolar a página.
    const antes = await page.evaluate(() => window.scrollY);
    await page.getByTestId("mesa-9").click();
    const popup = page.getByRole("dialog", { name: /Mesa 9/ });
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("Mesão");
    await expect(popup).toContainText("Livre");
    await expect(popup).toContainText("Frente, perto do caixa");
    await expect(popup).toContainText("8 lugares");
    expect(await page.evaluate(() => window.scrollY)).toBe(antes);
    // Espera a animação de entrada (o quadro cresce de 96% a 100%) antes de medir.
    await popup.evaluate((d) => Promise.all(d.getAnimations({ subtree: true }).map((a) => a.finished)));
    await alvosGrandes(page, popup.locator("a, button"));
    await popup.getByRole("button", { name: "Fechar" }).click();
    await expect(popup).toBeHidden();

    await page.getByTestId("mesa-4").click();
    await page.getByRole("dialog", { name: /Mesa 4/ }).getByRole("link", { name: "Abrir pedido" }).click();
    await page.waitForURL("**/atendimento/novo-pedido?mesa=4");
  });

  test("caixa vê o mapa sem o botão de abrir pedido", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrar(page, "caixa");
    await page.goto("/caixa/mesas");
    await expect(page.locator("button.mesa")).toHaveCount(11);
    await expect(page.getByTestId("mesas-livres")).toHaveText("11 livres de 11");
    await page.getByTestId("mesa-1").click();
    const popup = page.getByRole("dialog", { name: /Mesa 1/ });
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("Área da TV");
    await expect(popup).toContainText("2 lugares");
    await expect(popup.getByRole("link", { name: "Abrir pedido" })).toHaveCount(0);
    await semEstouroDeLargura(page);
  });

  test("sem estouro de largura e alvos de 44 px nos 3 tamanhos", async ({ page }) => {
    await entrar(page, "atendente");
    for (const t of TAMANHOS) {
      await page.setViewportSize(t);
      await page.goto("/atendimento");
      await expect(page.locator("button.mesa")).toHaveCount(11);
      await semEstouroDeLargura(page);
      await alvosGrandes(page, page.locator(".casca__conteudo").locator("button.mesa, .balcao-chip"));
    }
  });
});
