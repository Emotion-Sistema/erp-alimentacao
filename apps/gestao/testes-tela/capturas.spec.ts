import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { abrirAdicionar, entrar } from "./ajudas";

// Capturas das telas para o responsável ver (PNG, deviceScaleFactor 2, tema claro).
// Só roda com CAPTURAS=pasta (ex.: CAPTURAS=/tmp/telas pnpm teste:tela capturas). Nada é assertado além de a tela abrir.
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, "Defina CAPTURAS=<pasta> para gerar as capturas");
test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2, viewport: { width: 1280, height: 900 } });

const salvar = async (page: Page, nome: string, alvo?: ReturnType<Page["locator"]>) => {
  mkdirSync(PASTA!, { recursive: true });
  const caminho = join(PASTA!, `${nome}.png`);
  if (alvo) await alvo.screenshot({ path: caminho });
  else await page.screenshot({ path: caminho, fullPage: true });
};

const CELULAR = { width: 390, height: 844 };

test("ingredientes, fornecedores e CNPJ", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.request.post("/api/cadastros/fornecedores", {
    data: {
      nome: "Distribuidora Boa Safra (fictício)",
      documento: "11222333000181",
      contato: "Carlos, do atendimento",
      telefone: "(19) 3333-4444",
      email: "vendas@boasafra.exemplo.com",
      endereco: "Rua das Flores, 120 - Centro - Campinas/SP",
      prazoEntregaDias: 2,
      observacao: "Só entrega de segunda a sexta, antes das 10h.",
      ativo: true,
    },
  });
  await page.request.post("/api/cadastros/ingredientes/lote", {
    data: [{ nome: "Farinha de trigo (captura)", unidadeBase: "g", area: "cozinha", fornecedorId: null, embalagens: [{ nome: "saco 25 kg", quantidadeBase: "25000" }, { nome: "pacote 1 kg", quantidadeBase: "1000" }] }],
  });
  await page.goto("/cadastros");
  await expect(page.getByTestId("ingrediente-Ovo")).toBeVisible();
  await salvar(page, "01-ingredientes-computador");
  await page.setViewportSize(CELULAR);
  await page.goto("/cadastros");
  await expect(page.getByTestId("ingrediente-Ovo")).toBeVisible();
  await salvar(page, "02-ingredientes-celular");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/cadastros/fornecedores");
  await expect(page.getByTestId("lista-fornecedores")).toBeVisible();
  await salvar(page, "07-fornecedores-computador");
  await page.setViewportSize(CELULAR);
  await page.goto("/cadastros/fornecedores");
  await expect(page.getByTestId("lista-fornecedores")).toBeVisible();
  await salvar(page, "08-fornecedores-celular");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/cadastros/cnpj/*", (rota) =>
    rota.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cnpj: "11222333000181",
        razaoSocial: "BOA SAFRA DISTRIBUIDORA DE ALIMENTOS LTDA",
        nomeFantasia: "Boa Safra Distribuidora",
        situacao: "ATIVA",
        ativa: true,
        endereco: "Rua das Flores, 120 - Centro - Campinas/SP - CEP 13010-000",
        telefone: "1933334444",
        email: "vendas@boasafra.exemplo.com",
      }),
    }),
  );
  await page.goto("/cadastros/fornecedores");
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  await page.getByLabel("CPF ou CNPJ").fill("11222333000181");
  await page.getByRole("button", { name: "Buscar dados do CNPJ" }).click();
  await expect(page.getByTestId("resultado-cnpj")).toContainText("ATIVA");
  await salvar(page, "09-resultado-cnpj", page.getByTestId("resultado-cnpj"));
});

test("cadastro rápido e sugestões", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await abrirAdicionar(page, "Rápido");
  const busca = page.getByLabel("Procurar no catálogo");
  for (const [termo, nome] of [["mussarela", "Queijo muçarela"], ["bacon", "Bacon"], ["presunto", "Presunto"]] as const) {
    await busca.fill(termo);
    await page.getByRole("checkbox", { name: nome, exact: true }).check();
  }
  await busca.fill("");
  const painel = page.locator("#painel-catalogo");
  await page.addStyleTag({ content: ".rapido__barra { position: static !important; }" });
  await expect(page.getByRole("region", { name: "Itens selecionados" })).toContainText("Selecionados (3)");
  await salvar(page, "03-cadastro-rapido-marcados", painel);
  await page.setViewportSize(CELULAR);
  await salvar(page, "03b-cadastro-rapido-marcados-celular", painel);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole("tab", { name: "Colar uma lista" }).click();
  await page.getByLabel("Cole sua lista de ingredientes").fill("Alface\nLimão - saco 3 kg\nOvo; caixa com 30\nTempero da casa - pote 500 g");
  await page.getByRole("button", { name: "Ler a lista" }).click();
  await expect(page.getByTestId("resumo-da-lista")).toBeVisible();
  await salvar(page, "04-lista-colada-previa", page.locator("#painel-lista"));
  await page.setViewportSize(CELULAR);
  await salvar(page, "04b-lista-colada-previa-celular", page.locator("#painel-lista"));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/cadastros");
  await abrirAdicionar(page, "Comum");
  await page.getByLabel("Nome", { exact: true }).fill("mussa");
  await expect(page.getByRole("listbox", { name: "Sugestões do catálogo" })).toBeVisible();
  await salvar(page, "05-sugestoes-ao-digitar", page.locator(".sugestao"));
  await page.setViewportSize(CELULAR);
  await page.getByLabel("Nome", { exact: true }).fill("ovo");
  await salvar(page, "06-sugestoes-celular", page.locator(".sugestao"));
});

test("avisos e comunicados", async ({ browser, page }) => {
  await entrar(page, "gerente.geral");
  await page.request.post("/api/comunicados", { data: { texto: "Reunião de equipe hoje às 14h, antes da abertura da tarde. Presença de todos.", cargos: ["caixa", "atendente"], prioridade: "urgente" } });
  await page.request.post("/api/comunicados", { data: { texto: "Aniversariante do mês: parabéns, equipe da cozinha!", cargos: ["cozinheira"], prioridade: "informativo" } });
  await page.goto("/comunicados");
  await expect(page.getByTestId("comunicado-enviado").first()).toBeVisible();
  await salvar(page, "10-comunicados");

  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport: CELULAR, deviceScaleFactor: 2 });
  const caixa = await contexto.newPage();
  await entrar(caixa, "caixa");
  await caixa.goto("/caixa");
  await caixa.getByRole("button", { name: /^Avisos:/ }).click();
  await expect(caixa.getByTestId("painel-avisos")).toBeVisible();
  await expect(caixa.getByTestId("aviso-item").first()).toBeVisible();
  await salvar(caixa, "11-avisos-celular", caixa.getByTestId("painel-avisos"));
  await contexto.close();
});
