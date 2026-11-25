import { expect, test, type Page } from "@playwright/test";
import { aplicativosDoCargo, itensVisiveis } from "../../../packages/dominio/src/aplicativos";
import { CARGOS } from "../../../packages/dominio/src/permissoes";
import { entrar, loginDoCargo } from "./ajudas";

// Trilho de ícones do computador (decisão 0028): mostra exatamente o que a matriz deixa o cargo ver,
// nem mais nem menos, no lançador e dentro de cada aplicativo.
test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });

async function nomesDoTrilho(page: Page) {
  const nav = page.getByRole("navigation", { name: "Menu" });
  await expect(nav).toBeVisible();
  return nav
    .getByRole("link")
    .evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim()));
}

for (const cargo of CARGOS) {
  test(`trilho do cargo ${cargo} segue a matriz`, async ({ page }) => {
    await entrar(page, loginDoCargo(cargo), cargo === "dono" || cargo === "administrador");
    const apps = aplicativosDoCargo(cargo);
    if (apps.length > 1) {
      await page.goto("/");
      expect(await nomesDoTrilho(page)).toEqual(apps.map((a) => a.nome));
    }
    for (const app of apps) {
      const itens = itensVisiveis(app, cargo);
      await page.goto(itens[0]!.caminho);
      const esperado = [...(apps.length > 1 ? ["Aplicativos"] : []), ...itens.map((i) => i.texto)];
      expect(await nomesDoTrilho(page), `${cargo} em ${app.nome}`).toEqual(esperado);
    }
  });
}
