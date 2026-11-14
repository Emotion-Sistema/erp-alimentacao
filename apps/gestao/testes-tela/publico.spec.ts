import { expect, test } from "@playwright/test";
import { URL_LOJA, URL_SITE } from "./playwright.config";
import { semEstouroDeLargura } from "./ajudas";

const TAMANHOS = [
  { nome: "celular", width: 390, height: 844 },
  { nome: "tablet", width: 1280, height: 800 },
  { nome: "computador", width: 1440, height: 900 },
] as const;

const SITES = [
  { nome: "loja", base: URL_LOJA, caminhos: ["/", "/cardapio", "/meu-pedido", "/entrar"], menu: ["Cardápio", "Meu pedido", "Entrar"], etapa: /E2[6-8]/ },
  { nome: "site", base: URL_SITE, caminhos: ["/", "/cardapio", "/para-empresas", "/contato"], menu: ["Cardápio", "Para empresas", "Contato"], etapa: /E25/ },
];

for (const s of SITES) {
  for (const t of TAMANHOS) {
    test(`${s.nome} em ${t.nome}: todas as páginas sem estouro de largura`, async ({ page }) => {
      await page.setViewportSize({ width: t.width, height: t.height });
      for (const c of s.caminhos) {
        await page.goto(s.base + c);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.getByRole("navigation", { name: "Menu" }).getByRole("link").allTextContents()).toEqual(s.menu);
        await expect(page.getByRole("contentinfo")).toBeVisible();
        if (c !== "/") await expect(page.getByText(s.etapa).first()).toBeVisible();
        await semEstouroDeLargura(page);
      }
    });
  }
}

test("a loja tem atalho de instalação próprio", async ({ request }) => {
  const r = await request.get(`${URL_LOJA}/manifest.webmanifest`);
  expect(r.ok()).toBe(true);
  const m = await r.json();
  expect(m.display).toBe("standalone");
  expect(m.lang).toBe("pt-BR");
});
