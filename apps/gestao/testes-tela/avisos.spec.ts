import { expect, test, type Browser, type Page } from "@playwright/test";
import { entrar, semEstouroDeLargura } from "./ajudas";

test.describe.configure({ mode: "serial" });

const TAMANHOS = [
  { nome: "celular", width: 390, height: 844 },
  { nome: "tablet", width: 1280, height: 800 },
  { nome: "computador", width: 1440, height: 900 },
] as const;

/** Uma pessoa entra em um aparelho próprio (contexto separado), como na loja. */
async function pessoa(browser: Browser, login: string) {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({ baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await entrar(page, login);
  return { context, page };
}

const unico = (rotulo: string) => `${rotulo} ${Date.now()}`;

async function enviarPelaTela(page: Page, texto: string, cargoRotulo: string) {
  await page.goto("/comunicados");
  await page.getByLabel("Recado").fill(texto);
  await page.getByLabel(cargoRotulo, { exact: true }).check();
  await page.getByRole("button", { name: "Enviar comunicado" }).click();
  await expect(page.getByText("Comunicado enviado.")).toBeVisible();
}

test("gerente envia, o caixa vê no sino, confirma, e o gerente vê quem confirmou", async ({ browser }) => {
  const texto = unico("Reunião antes de abrir");
  const gerente = await pessoa(browser, "gerente.geral");
  const caixa = await pessoa(browser, "caixa");
  try {
    await enviarPelaTela(gerente.page, texto, "Caixa");

    // O caixa vê o aviso na próxima consulta (ou ao voltar ao foco).
    await caixa.page.reload();
    await expect(caixa.page.getByTestId("avisos-contador")).toBeVisible();
    await caixa.page.getByRole("button", { name: /Avisos: \d+ avisos? novos?/ }).click();
    const painel = caixa.page.getByTestId("painel-avisos");
    await expect(painel).toBeVisible();
    const item = painel.getByTestId("aviso-item").filter({ hasText: texto });
    await expect(item).toContainText(/De\s*\S+/);
    await expect(item.getByRole("button", { name: "Li e entendi" })).toBeVisible();
    await item.getByRole("button", { name: "Li e entendi" }).click();
    await expect(item).toContainText("Leitura confirmada");
    await expect(caixa.page.getByTestId("avisos-contador")).toHaveCount(0);

    await gerente.page.reload();
    const enviado = gerente.page.getByTestId("comunicado-enviado").filter({ hasText: texto });
    await expect(enviado).toContainText(/1 de \d+ confirmaram/);
    await enviado.getByText("Ver quem leu").click();
    await expect(enviado.getByText(/Confirmou/)).toBeVisible();
  } finally {
    await gerente.context.close();
    await caixa.context.close();
  }
});

test("o comunicado para o caixa não aparece para atendente nem supervisor", async ({ browser }) => {
  const texto = unico("Só para o caixa");
  const gerente = await pessoa(browser, "gerente.geral");
  try {
    await enviarPelaTela(gerente.page, texto, "Caixa");
    for (const login of ["atendente", "supervisor"]) {
      const outro = await pessoa(browser, login);
      try {
        const r = await outro.page.request.get("/api/avisos");
        expect(r.status()).toBe(200);
        expect(JSON.stringify(await r.json())).not.toContain(texto);
        await outro.page.goto("/avisos");
        await expect(outro.page.getByRole("heading", { name: "Todos os avisos" })).toBeVisible();
        await expect(outro.page.getByText(texto)).toHaveCount(0);
      } finally {
        await outro.context.close();
      }
    }
  } finally {
    await gerente.context.close();
  }
});

test("o aviso chega sem recarregar a página", async ({ browser }) => {
  test.setTimeout(90_000);
  const caixa = await pessoa(browser, "caixa");
  const gerente = await pessoa(browser, "gerente.geral");
  try {
    const texto = unico("Chegou sozinho");
    // Zera o contador atual: abre o painel (marca como visto) e fecha.
    await caixa.page.getByRole("button", { name: /^Avisos:/ }).click();
    await caixa.page.getByRole("button", { name: "Fechar" }).click();
    await expect(caixa.page.getByTestId("avisos-contador")).toHaveCount(0);

    const r = await gerente.context.request.post("/api/comunicados", { data: { texto, cargos: ["caixa"] } });
    expect(r.status()).toBe(201);

    await expect(caixa.page.getByTestId("avisos-contador")).toHaveText("1", { timeout: 25_000 });
  } finally {
    await caixa.context.close();
    await gerente.context.close();
  }
});

test("supervisor e caixa não abrem a tela de comunicados", async ({ browser }) => {
  for (const login of ["supervisor", "caixa"]) {
    const p = await pessoa(browser, login);
    try {
      await p.page.goto("/comunicados");
      await expect(p.page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
      await expect(p.page.getByRole("button", { name: "Enviar comunicado" })).toHaveCount(0);
    } finally {
      await p.context.close();
    }
  }
});

test("sino e painel cabem nos 3 tamanhos", async ({ browser }) => {
  const gerente = await pessoa(browser, "gerente.geral");
  const caixa = await pessoa(browser, "caixa");
  try {
    for (const t of TAMANHOS) {
      const r = await gerente.context.request.post("/api/comunicados", {
        data: { texto: `${t.nome} ${unico("Texto longo ").repeat(20)}`.slice(0, 480), cargos: ["caixa"], prioridade: "urgente" },
      });
      expect(r.status()).toBe(201);
      await caixa.page.setViewportSize({ width: t.width, height: t.height });
      await caixa.page.goto("/caixa");
      await expect(caixa.page.getByTestId("avisos-contador")).toBeVisible();
      await semEstouroDeLargura(caixa.page);
      await semEstouroDeLargura(caixa.page);
      await caixa.page.getByRole("button", { name: /^Avisos:/ }).click();
      await expect(caixa.page.getByTestId("painel-avisos")).toBeVisible();
      await semEstouroDeLargura(caixa.page);
      await caixa.page.getByRole("button", { name: "Fechar" }).click();
      await caixa.page.goto("/avisos");
      await semEstouroDeLargura(caixa.page);
    }
  } finally {
    await gerente.context.close();
    await caixa.context.close();
  }
});

test("gerente geral muda a margem de troca de turno; supervisor não abre a tela", async ({ browser }) => {
  const g = await pessoa(browser, "gerente.geral");
  try {
    await g.page.goto("/turnos");
    await expect(g.page.getByTestId("lista-turnos")).toBeVisible();
    const campo = g.page.getByTestId("margem-minutos");
    await expect(campo).toHaveValue("30");
    await campo.fill("40");
    await g.page.getByRole("button", { name: "Salvar margem" }).click();
    await expect(g.page.getByText("Margem salva.")).toBeVisible();
    await g.page.reload();
    await expect(g.page.getByTestId("margem-minutos")).toHaveValue("40");
    await semEstouroDeLargura(g.page);
    await g.page.getByTestId("margem-minutos").fill("30");
    await g.page.getByRole("button", { name: "Salvar margem" }).click();
    await expect(g.page.getByText("Margem salva.")).toBeVisible();
  } finally {
    await g.context.close();
  }
  const s = await pessoa(browser, "supervisor");
  try {
    await s.page.goto("/turnos");
    await expect(s.page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
    await expect(s.page.getByTestId("margem-minutos")).toHaveCount(0);
  } finally {
    await s.context.close();
  }
});
