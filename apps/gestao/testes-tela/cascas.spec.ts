import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { APLICATIVOS, aplicativosDoCargo, itensVisiveis } from "../../../packages/dominio/src/aplicativos";
import { CARGOS } from "../../../packages/dominio/src/permissoes";
import { entrar, loginDoCargo, semEstouroDeLargura } from "./ajudas";

const TAMANHOS = [
  { nome: "celular", width: 390, height: 844 },
  { nome: "tablet", width: 1280, height: 800 },
  { nome: "computador", width: 1440, height: 900 },
] as const;

const PASTA_TELAS = join(import.meta.dirname, "..", "test-results", "telas");

async function capturar(page: Page, tamanho: string, cargo: string, pagina: string) {
  const pasta = join(PASTA_TELAS, tamanho);
  mkdirSync(pasta, { recursive: true });
  await page.screenshot({ path: join(pasta, `${cargo}-${pagina}.png`) });
}

/** O que toda página da casca precisa mostrar, em qualquer tamanho. */
async function conferirCasca(page: Page) {
  await semEstouroDeLargura(page);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByTestId("cargo-ativo")).toBeVisible();
  const alturas = await page
    .getByRole("navigation", { name: "Menu" })
    .getByRole("link")
    .evaluateAll((els) => els.map((e) => ({ texto: e.textContent, altura: e.getBoundingClientRect().height })));
  for (const l of alturas) expect(l.altura, `link "${l.texto}" com altura ${l.altura}`).toBeGreaterThanOrEqual(48);
}

test.describe.configure({ mode: "serial" });

// Cada item é visitado, nos 3 tamanhos, pelo primeiro cargo (na ordem da lista) que o enxerga.
const jaVisitados = new Set<string>();

for (const cargo of CARGOS) {
  test(`cascas do cargo ${cargo}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrar(page, loginDoCargo(cargo), cargo === "dono" || cargo === "administrador");
    const apps = aplicativosDoCargo(cargo);

    // Lançador (ou o redirecionamento, se o cargo tem um aplicativo só).
    if (apps.length === 1) {
      const itens = itensVisiveis(apps[0]!, cargo);
      expect(new URL(page.url()).pathname).toBe(itens[0]!.caminho);
    } else if (apps.length > 1) {
      expect(new URL(page.url()).pathname).toBe("/");
      const titulos = await page.locator(".erp-ladrilho__titulo").allTextContents();
      expect(titulos).toEqual(apps.map((a) => a.nome));
      const destinos = await page.locator("a.erp-ladrilho").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      expect(destinos).toEqual(apps.map((a) => itensVisiveis(a, cargo)[0]!.caminho));
    }
    await conferirCasca(page);
    await capturar(page, "celular", cargo, "inicio");

    // Itens ainda não vistos por outro cargo, nos 3 tamanhos.
    for (const app of APLICATIVOS) {
      for (const item of itensVisiveis(app, cargo)) {
        if (jaVisitados.has(item.caminho)) continue;
        jaVisitados.add(item.caminho);
        for (const t of TAMANHOS) {
          await page.setViewportSize({ width: t.width, height: t.height });
          await page.goto(item.caminho);
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
          await conferirCasca(page);
          await capturar(page, t.nome, cargo, item.caminho.slice(1).replaceAll("/", "-"));
        }
      }
    }
  });
}

test("todo item do catálogo foi visitado por algum cargo", () => {
  const todos = new Set(APLICATIVOS.flatMap((a) => a.itens.map((i) => i.caminho)));
  expect([...todos].filter((c) => !jaVisitados.has(c))).toEqual([]);
});

test.describe("recusas pela tela", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const casos: [string, string[]][] = [
    ["caixa", ["/financeiro", "/gestao", "/estoque"]],
    ["gerente_geral", ["/financeiro", "/caixa", "/caixa/receber"]],
    ["supervisor", ["/caixa", "/caixa/receber", "/estoque"]],
    ["contador", ["/financeiro", "/financeiro/faturamento", "/estoque/custos"]],
    ["atendente", ["/caixa"]],
  ];
  const tituloDe = (caminho: string) => APLICATIVOS.flatMap((a) => a.itens).find((i) => i.caminho === caminho)!.texto;
  for (const [cargo, caminhos] of casos) {
    test(`${cargo} não vê ${caminhos.join(", ")}`, async ({ page }) => {
      await entrar(page, loginDoCargo(cargo));
      for (const c of caminhos) {
        await page.goto(c);
        await expect(page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
        // Nenhum conteúdo do item: nem o título dele, nem o texto de "o que vem".
        await expect(page.getByText("Esta tela chega na etapa")).toHaveCount(0);
        await expect(page.getByRole("heading", { name: tituloDe(c), exact: true })).toHaveCount(0);
        await semEstouroDeLargura(page);
      }
    });
  }
});

test.describe("atalho de instalação de cada aplicativo", () => {
  for (const app of APLICATIVOS) {
    test(`manifesto e ícone de ${app.codigo}`, async ({ request }) => {
      const r = await request.get(`/aplicativo/${app.codigo}/manifest.webmanifest`);
      expect(r.status()).toBe(200);
      const m = await r.json();
      expect(m).toMatchObject({
        name: `${app.nome} - Gestão`,
        short_name: app.nome,
        start_url: app.caminho,
        scope: app.codigo === "gestao" ? "/" : app.caminho,
        display: "standalone",
        lang: "pt-BR",
      });
      const icone = await request.get(m.icons[0].src);
      expect(icone.status()).toBe(200);
      expect(icone.headers()["content-type"]).toContain("image/svg+xml");
    });
  }

  test("aplicativo desconhecido dá 404", async ({ request }) => {
    expect((await request.get("/aplicativo/inexistente/manifest.webmanifest")).status()).toBe(404);
    expect((await request.get("/aplicativo/inexistente/icone.svg")).status()).toBe(404);
  });

  test("a página do aplicativo aponta para o próprio manifesto", async ({ page }) => {
    await entrar(page, "caixa");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/aplicativo/caixa/manifest.webmanifest");
  });
});
