import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { abrirAdicionar, entrar, janelaSemEstouro, semEstouroDeLargura } from "./ajudas";
import { URL_GESTAO } from "./playwright.config";

// Tela de Ingredientes com a lista primeiro e a janela (popup) "Adicionar ingrediente" (pedido do
// responsável, 15/11/2026): botão no topo da lista, abas Rápido e Comum, Esc fecha e o foco volta,
// pergunta antes de descartar, gravar fecha e realça, editar abre na mesma janela.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const botaoAdicionar = (page: Page) => page.getByRole("button", { name: "Adicionar ingrediente", exact: true });
const janela = (page: Page) => page.locator("dialog.janela");

async function abrirTela(page: Page) {
  await page.goto("/cadastros");
  await expect(page.getByTestId("ingrediente-Ovo")).toBeVisible();
}

test("a lista vem primeiro; os formulários não ficam mais fixos na página", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirTela(page);
  // Nenhum campo de cadastro na página: só busca e filtro junto da lista.
  await expect(page.getByRole("combobox", { name: "Nome" })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cadastro rápido" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Novo ingrediente" })).toHaveCount(0);
  // O botão fica no cabeçalho, na mesma linha do título, e a lista aparece antes da dica das unidades.
  const titulo = (await page.getByRole("heading", { name: "Ingredientes", level: 1 }).boundingBox())!;
  const botao = (await botaoAdicionar(page).boundingBox())!;
  expect(Math.abs(botao.y + botao.height / 2 - (titulo.y + titulo.height / 2))).toBeLessThan(24);
  const lista = (await page.getByTestId("lista-ingredientes").boundingBox())!;
  const dica = (await page.locator(".cadastros__dica").filter({ hasText: "já convertem sozinhas" }).boundingBox())!;
  expect(lista.y).toBeLessThan(dica.y);
  expect(lista.y).toBeLessThan(900);
  await expect(botaoAdicionar(page)).toHaveAttribute("aria-keyshortcuts", "A");
  await semEstouroDeLargura(page);
});

test("o botão abre a janela modal com Rápido e Comum; lembra a última; Esc fecha e o foco volta", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirTela(page);
  await botaoAdicionar(page).click();
  const dialogo = page.getByRole("dialog", { name: "Adicionar ingrediente" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toHaveAttribute("aria-modal", "true");
  // Primeira vez: Rápido. As duas opções com nome claro.
  await expect(dialogo.getByRole("tab", { name: "Rápido", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(dialogo.getByRole("tab", { name: "Comum", exact: true })).toHaveAttribute("aria-selected", "false");
  await expect(dialogo.getByRole("tab", { name: "Catálogo pronto" })).toBeVisible();
  // O resto da página fica inerte: clicar atrás não funciona (é a janela que recebe).
  expect(await page.evaluate(() => document.querySelector("dialog.janela")!.matches(":modal"))).toBe(true);

  // Seta para o lado troca a aba; Comum mostra o formulário de um ingrediente.
  await dialogo.getByRole("tab", { name: "Rápido", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialogo.getByRole("tab", { name: "Comum", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(dialogo.getByRole("combobox", { name: "Nome" })).toBeVisible();
  await expect(dialogo.getByTestId("bloco-embalagens").getByRole("button", { name: /^Mostrar Embalagens/ })).toHaveAttribute("aria-expanded", "false");

  // Foco preso: Tab várias vezes nunca sai da janela.
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const dentro = await page.evaluate(() => {
      const a = document.activeElement;
      return !a || a === document.body || !!a.closest("dialog.janela");
    });
    expect(dentro, `Tab ${i + 1} levou o foco para fora da janela`).toBe(true);
  }

  // Esc fecha (nada digitado) e o foco volta ao botão.
  await page.keyboard.press("Escape");
  await expect(janela(page)).toHaveCount(0);
  await expect(botaoAdicionar(page)).toBeFocused();

  // Reabrir lembra a última aba (Comum), também depois de recarregar a página.
  await page.reload();
  await expect(page.getByTestId("ingrediente-Ovo")).toBeVisible();
  // Atalho: tecla A (fora de campo de texto) abre a mesma janela.
  await page.locator("body").press("a");
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole("tab", { name: "Comum", exact: true })).toHaveAttribute("aria-selected", "true");
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(janela(page)).toHaveCount(0);
  // Digitar "a" na busca não abre a janela.
  await page.getByLabel("Buscar por nome").fill("");
  await page.getByLabel("Buscar por nome").press("a");
  await expect(janela(page)).toHaveCount(0);
});

test("com algo digitado, fechar pergunta 'Descartar o que foi digitado?'", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirTela(page);
  const dialogo = await abrirAdicionar(page, "Comum");
  const nome = dialogo.getByRole("combobox", { name: "Nome" });
  await nome.fill("Manjericão (janela)");

  // Esc: pergunta, com o foco no caminho seguro.
  await nome.press("Escape");
  const pergunta = page.getByRole("alertdialog", { name: "Descartar o que foi digitado?" });
  await expect(pergunta).toBeVisible();
  await expect(pergunta.getByRole("button", { name: "Continuar editando" })).toBeFocused();
  // Esc de novo: desiste de fechar e nada se perde.
  await page.keyboard.press("Escape");
  await expect(pergunta).toHaveCount(0);
  await expect(dialogo).toBeVisible();
  await expect(nome).toHaveValue("Manjericão (janela)");

  // Fechar também pergunta; Continuar editando mantém tudo.
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await pergunta.getByRole("button", { name: "Continuar editando" }).click();
  await expect(nome).toHaveValue("Manjericão (janela)");

  // Descartar fecha, não grava nada e o foco volta ao botão.
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await pergunta.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(janela(page)).toHaveCount(0);
  await expect(botaoAdicionar(page)).toBeFocused();
  await expect(page.getByTestId("ingrediente-Manjericão (janela)")).toHaveCount(0);
  // Reabrir começa limpo.
  await abrirAdicionar(page, "Comum");
  await expect(page.getByRole("combobox", { name: "Nome" })).toHaveValue("");
});

test("Comum: gravar fecha a janela, mostra o aviso, atualiza a lista e realça o novo", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirTela(page);
  await abrirAdicionar(page, "Comum");
  await page.getByRole("combobox", { name: "Nome" }).fill("Manjericão (janela)");
  await page.getByLabel("Unidade do estoque").selectOption("g");
  await page.getByRole("button", { name: "Criar ingrediente" }).click();
  await expect(janela(page)).toHaveCount(0);
  await expect(page.getByText("Ingrediente criado: Manjericão (janela). Ele está em destaque na lista.")).toBeVisible();
  const item = page.getByTestId("ingrediente-Manjericão (janela)");
  await expect(item).toHaveAttribute("data-realce", "sim");
  await expect(item).toBeInViewport();
  await expect(page.locator('[data-realce="sim"]')).toHaveCount(1);
  // Abrir a janela de novo tira o destaque anterior.
  await botaoAdicionar(page).click();
  await expect(page.locator('[data-realce="sim"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("Rápido: depois de gravar a janela continua aberta; ao fechar, a lista mostra e realça os novos", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirTela(page);
  const dialogo = await abrirAdicionar(page, "Rápido");
  await dialogo.getByLabel("Procurar no catálogo").fill("cebola");
  await dialogo.getByRole("checkbox", { name: "Cebola", exact: true }).check();
  await dialogo.getByRole("button", { name: "Gravar 1 item" }).click();
  await expect(dialogo.getByText("1 ingrediente gravado.")).toBeVisible();
  await expect(dialogo).toBeVisible();
  await expect(page.getByTestId("ingrediente-Cebola")).toHaveAttribute("data-realce", "sim");
  // Gravou: fechar não pergunta (a busca não conta como algo por gravar).
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(janela(page)).toHaveCount(0);
  await expect(page.getByText("1 ingrediente novo na lista, em destaque.")).toBeVisible();
  await expect(page.getByTestId("ingrediente-Cebola")).toBeInViewport();
});

test("editar abre na mesma janela (Comum, modo edição); o painel de embalagem abre por cima sem gravar o de trás", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirTela(page);
  const editar = page.getByRole("button", { name: "Editar Farinha de trigo", exact: true });
  await editar.click();
  const dialogo = page.getByRole("dialog", { name: "Editar Farinha de trigo" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole("tab")).toHaveCount(0);
  await expect(dialogo.getByRole("textbox", { name: "Nome" }).or(dialogo.getByRole("combobox", { name: "Nome" }))).toHaveValue("Farinha de trigo");
  await expect(dialogo.getByRole("button", { name: "Salvar ingrediente" })).toBeVisible();

  // Painel de embalagem do catálogo, por cima da janela: Esc fecha só o painel.
  const bloco = dialogo.getByTestId("bloco-embalagens");
  await bloco.getByRole("button", { name: /^Mostrar Embalagens/ }).click();
  await bloco.getByRole("button", { name: "Criar nova embalagem" }).click();
  const painel = page.getByRole("dialog", { name: "Nova embalagem" });
  await expect(painel).toBeVisible();
  await painel.getByRole("button", { name: "pacote", exact: true }).click();
  await painel.getByLabel("Tamanho (opcional)").fill("3");
  await page.keyboard.press("Escape");
  await expect(painel).toHaveCount(0);
  await expect(dialogo).toBeVisible();
  await expect(page.getByText("Ingrediente salvo.")).toHaveCount(0);

  // Digitou no painel: fechar a janela pergunta; descartar fecha e o foco volta ao Editar.
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog", { name: "Descartar o que foi digitado?" }).getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(janela(page)).toHaveCount(0);
  await expect(editar).toBeFocused();

  // Duplicar e "Adicionar embalagem" também abrem a janela.
  await page.getByRole("button", { name: "Duplicar Ovo", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Adicionar ingrediente" }).getByRole("combobox", { name: "Nome" })).toHaveValue("Ovo (cópia)");
  await page.keyboard.press("Escape");
  await expect(janela(page)).toHaveCount(0);
});

test("cozinheira não vê o botão e a tecla A não abre nada", async ({ page }) => {
  await entrar(page, "cozinheira");
  await abrirTela(page);
  await expect(botaoAdicionar(page)).toHaveCount(0);
  await page.locator("body").press("a");
  await expect(janela(page)).toHaveCount(0);
});

for (const tela of [
  { nome: "celular", largura: 390, altura: 844 },
  { nome: "tablet", largura: 768, altura: 1024 },
  { nome: "computador", largura: 1280, altura: 800 },
]) {
  test(`a janela cabe na tela do ${tela.nome}; cabeçalho e Fechar ficam parados ao rolar`, async ({ page }) => {
    await page.setViewportSize({ width: tela.largura, height: tela.altura });
    await entrar(page, "gerente.geral");
    await abrirTela(page);
    await semEstouroDeLargura(page);
    const dialogo = await abrirAdicionar(page, "Rápido");
    await dialogo.getByLabel("Corredor").selectOption("Carnes e frios");
    await dialogo.getByRole("button", { name: "Marcar todos de Carnes e frios" }).click();
    await janelaSemEstouro(page);
    const caixa = (await janela(page).boundingBox())!;
    if (tela.largura === 390) {
      // No celular ocupa a tela inteira.
      expect(Math.round(caixa.width)).toBe(390);
      expect(Math.round(caixa.height)).toBe(844);
    } else {
      expect(caixa.width).toBeLessThan(tela.largura);
    }
    const fechar = dialogo.getByRole("button", { name: "Fechar", exact: true });
    const antes = (await fechar.boundingBox())!;
    await page.locator(".janela__corpo").evaluate((c) => c.scrollTo(0, c.scrollHeight));
    const depois = (await fechar.boundingBox())!;
    expect(depois.y).toBe(antes.y);
    await expect(fechar).toBeInViewport();
    expect(antes.height).toBeGreaterThanOrEqual(44);

    await dialogo.getByRole("tab", { name: "Comum", exact: true }).click();
    await dialogo.getByRole("button", { name: /^Mostrar Embalagens/ }).click();
    await dialogo.getByRole("button", { name: "Escolher do catálogo" }).click();
    await janelaSemEstouro(page);
    await semEstouroDeLargura(page);
  });
}

test("com 'reduzir movimento' ligado, a janela abre sem animação", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await entrar(page, "gerente.geral");
  await abrirTela(page);
  await abrirAdicionar(page, "Comum");
  expect(await janela(page).evaluate((d) => getComputedStyle(d).animationName)).toBe("none");
});

// Capturas para o responsável conferir (só quando pedidas: CAPTURAS_JANELA=<pasta>).
test.describe("capturas", () => {
  test.skip(!process.env.CAPTURAS_JANELA, "só com CAPTURAS_JANELA");
  const pasta = process.env.CAPTURAS_JANELA ?? "";

  test("página e janela em 1280 e 390", async ({ browser }) => {
    mkdirSync(pasta, { recursive: true });
    for (const largura of [1280, 390]) {
      const contexto = await browser.newContext({
        viewport: { width: largura, height: largura === 390 ? 844 : 900 },
        deviceScaleFactor: 2,
        locale: "pt-BR",
        reducedMotion: "reduce",
        baseURL: URL_GESTAO,
      });
      const page = await contexto.newPage();
      await entrar(page, "gerente.geral");
      await abrirTela(page);
      await page.screenshot({ path: `${pasta}/popup-pagina-${largura}.png` });
      if (largura === 1280) {
        const dialogo = await abrirAdicionar(page, "Rápido");
        await dialogo.getByLabel("Procurar no catálogo").fill("queijo");
        await expect(dialogo.getByRole("checkbox").first()).toBeVisible();
        await page.screenshot({ path: `${pasta}/popup-rapido-${largura}.png` });
        await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
        const discard = page.getByRole("button", { name: "Descartar", exact: true });
        if (await discard.count()) await discard.click();
      }
      const dialogo = await abrirAdicionar(page, "Comum");
      await dialogo.getByRole("combobox", { name: "Nome" }).fill("Orégano (exemplo)");
      await dialogo.getByLabel("Unidade do estoque").selectOption("g");
      await page.screenshot({ path: `${pasta}/popup-comum-${largura}.png` });
      await contexto.close();
    }
  });
});
