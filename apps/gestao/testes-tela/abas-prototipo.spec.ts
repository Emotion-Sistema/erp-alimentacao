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
    await expect(popup).toContainText("6 lugares");
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

/** "R$ 1.234,56" a partir de centavos (o mesmo formato da tela). */
const reais = (c: number) => `R$ ${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${String(c % 100).padStart(2, "0")}`;

test.describe("Novo pedido", () => {
  test("atendente monta a comanda da mesa: soma em centavos certa e o envio fica desligado até a E13", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, "atendente");
    // Preços vêm do servidor (semente inventada): a conta da tela tem de bater com eles.
    const cardapio = (await (await page.request.get("/api/cardapio")).json()) as { nome: string; precoCentavos: number }[];
    const cafe = cardapio.find((p) => p.nome === "Café expresso")!;
    const refri = cardapio.find((p) => p.nome === "Refrigerante lata")!;
    expect(Number.isInteger(cafe.precoCentavos) && Number.isInteger(refri.precoCentavos)).toBe(true);

    await page.goto("/atendimento/novo-pedido?mesa=4");
    await expect(page.getByTestId("titulo-da-tela")).toHaveText("Novo pedido");
    await expect(page.getByTestId("comanda-mesa")).toHaveText("Mesa 4");
    await expect(page.getByRole("button", { name: /^Lançar / })).toHaveCount(cardapio.length);

    const lancar = (nome: string) => page.getByRole("button", { name: new RegExp(`^Lançar ${nome},`) });
    await lancar("Café expresso").click();
    await lancar("Café expresso").click();
    await page.getByRole("searchbox", { name: "Buscar produto" }).fill("refri");
    await expect(page.getByRole("button", { name: /^Lançar / })).toHaveCount(1);
    await lancar("Refrigerante lata").click();
    await lancar("Refrigerante lata").click();
    await page.getByRole("button", { name: "Tirar um Refrigerante lata" }).click();

    const itens = cafe.precoCentavos * 2 + refri.precoCentavos;
    // A casa não cobra serviço (25/11/2026): sem a linha, total = itens.
    const servico = 0;
    await expect(page.getByTestId("comanda-itens-valor")).toHaveText(reais(itens));
    await expect(page.getByTestId("comanda-servico")).toHaveCount(0);
    await expect(page.getByTestId("comanda-total")).toHaveText(reais(itens + servico));
    await expect(page.getByLabel("Quantidade de Café expresso")).toHaveText("2");
    await expect(page.getByRole("button", { name: "Enviar para a cozinha" })).toBeDisabled();
    await expect(page.getByText("O envio para a cozinha liga na etapa E13 (pedidos). Por enquanto a comanda não é gravada.")).toBeVisible();
  });

  test("mesa que não existe vira 'Sem mesa'; celular mostra o resumo fixo embaixo", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrar(page, "atendente");
    await page.goto("/atendimento/novo-pedido?mesa=99");
    await expect(page.getByTestId("comanda-mesa")).toHaveText("Sem mesa");
    await page.getByRole("button", { name: /^Lançar Pão de queijo,/ }).click();
    const resumo = page.locator(".np-resumo");
    await expect(resumo).toBeVisible();
    await expect(resumo).toContainText("Sem mesa, 1 item");
    await expect(resumo.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await semEstouroDeLargura(page);
  });

  test("sem estouro de largura e alvos de 44 px nos 3 tamanhos", async ({ page }) => {
    await entrar(page, "atendente");
    for (const t of TAMANHOS) {
      await page.setViewportSize(t);
      await page.goto("/atendimento/novo-pedido?mesa=7");
      await page.getByRole("button", { name: /^Lançar X-Salada,/ }).click();
      await semEstouroDeLargura(page);
      await alvosGrandes(page, page.locator(".np").locator(".balcao-chip, .np-prod, .np-qtd button, .np-total .erp-botao"));
    }
  });

  test("caixa não abre o novo pedido", async ({ page }) => {
    await entrar(page, "caixa");
    await page.goto("/atendimento/novo-pedido");
    await expect(page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
    await expect(page.locator(".np")).toHaveCount(0);
  });
});

test.describe("Produção", () => {
  test("cozinheira vê as 3 colunas com a legenda, vazias até a E13 e sem relógio", async ({ page }) => {
    await entrar(page, "cozinheira");
    for (const t of TAMANHOS) {
      await page.setViewportSize(t);
      await page.goto("/producao");
      for (const nome of ["Na fila", "Em preparo", "Pronto"])
        await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^${nome}`) })).toBeVisible();
      await expect(page.locator(".prod-coluna")).toHaveCount(3);
      await expect(page.getByText("Nenhum pedido aqui ainda. Os pedidos chegam sozinhos a esta tela quando a etapa E13 ligar.")).toHaveCount(3);
      await expect(page.getByRole("list", { name: "Cores das etapas" }).getByRole("listitem")).toHaveCount(3);
      // Nada de tempo inventado (ex.: "12:34" de relógio de ticket) dentro das colunas.
      expect(await page.locator(".prod-colunas").innerText()).not.toMatch(/\d+:\d{2}/);
      await semEstouroDeLargura(page);
    }
  });

  test("atendente não abre a produção (o cargo não tem producao.ver)", async ({ page }) => {
    await entrar(page, "atendente");
    await page.goto("/producao");
    await expect(page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
    await expect(page.locator(".prod-coluna")).toHaveCount(0);
  });
});
