import { expect, test, type Page } from "@playwright/test";
import { entrar, semEstouroDeLargura, sql } from "./ajudas";

test.use({ viewport: { width: 1280, height: 800 } });
test.describe.configure({ mode: "serial" });

async function digitar(page: Page, codigo: string) {
  const teclado = page.getByRole("dialog");
  for (const d of codigo) await teclado.getByRole("button", { name: d, exact: true }).click();
}

async function tocarNaPessoa(page: Page, nome: string) {
  await page.getByRole("region", { name: "Equipe da cozinha" }).getByRole("button", { name: new RegExp(nome) }).click();
}

test("sem cadastro, o aparelho avisa", async ({ page }) => {
  await page.goto("/estacao");
  await expect(page.getByText("Este aparelho não está cadastrado como estação. Peça ao gerente.")).toBeVisible();
});

test.describe("tablet da cozinha", () => {

  test("gerente cadastra o aparelho e a equipe entra pelo teclado", async ({ page }) => {
    await entrar(page, "gerente.geral");
    await page.goto("/estacoes");
    await expect(page.getByText("Faça isso no próprio tablet da cozinha", { exact: false })).toBeVisible();
    await page.getByLabel("Nome da estação").fill("Cozinha 1");
    await page.getByRole("button", { name: "Cadastrar ESTE aparelho como estação" }).click();

    // O servidor encerra o acesso do gerente neste aparelho e ele vira a estação (cookie do aparelho).
    await page.waitForURL("**/estacao");
    await page.goto("/api/eu");
    expect(await page.locator("body").textContent()).toContain("Entre com seu usuário");
    await page.goto("/estacao");
    await expect(page.getByRole("heading", { level: 1, name: "Cozinha 1" })).toBeVisible();
    await expect(page.getByText("As telas de produção chegam na etapa E14")).toBeVisible();
    await expect(page.getByText("Nenhuma pessoa ativa")).toBeVisible();

    // Cozinheira entra com 2580.
    await tocarNaPessoa(page, "Teste cozinheira");
    await expect(page.getByRole("dialog")).toBeVisible();
    // Botões do teclado com pelo menos 64px.
    const caixa = await page.getByRole("dialog").getByRole("button", { name: "5", exact: true }).boundingBox();
    expect(caixa!.width).toBeGreaterThanOrEqual(64);
    expect(caixa!.height).toBeGreaterThanOrEqual(64);
    await digitar(page, "2580");
    const aqui = page.getByRole("list", { name: "Quem está aqui" });
    await expect(aqui.getByRole("button", { name: "Teste cozinheira, ativa agora" })).toBeVisible();
    await expect(page.getByText("Iniciar e finalizar preparos")).toBeVisible();

    // Auxiliar entra e passa a ser a ativa.
    await tocarNaPessoa(page, "Teste auxiliar cozinha");
    await digitar(page, "2580");
    await expect(aqui.getByRole("button", { name: "Teste auxiliar cozinha, ativa agora" })).toBeVisible();
    await expect(aqui.getByRole("button", { name: "Tornar Teste cozinheira a pessoa ativa" })).toBeVisible();
    await expect(page.getByText("Registrar perda, ajuste ou item que acabou")).toHaveCount(0);

    // Um toque troca a ativa, sem código.
    await aqui.getByRole("button", { name: "Tornar Teste cozinheira a pessoa ativa" }).click();
    await expect(aqui.getByRole("button", { name: "Teste cozinheira, ativa agora" })).toBeVisible();
    await expect(page.getByText("Registrar perda, ajuste ou item que acabou")).toBeVisible();
    await semEstouroDeLargura(page);
    // Tablet em pé e deitado, sem a página ficar mais larga que a tela.
    await page.setViewportSize({ width: 800, height: 1280 });
    await semEstouroDeLargura(page);
    await expect(page.getByRole("heading", { level: 1, name: "Cozinha 1" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await semEstouroDeLargura(page);

    // A tela do gestor mostra quem está na estação.
    await entrar(page, "gerente.geral");
    await page.goto("/estacoes");
    const cartao = page.getByTestId("estacao-Cozinha 1");
    await expect(cartao).toContainText("Teste cozinheira");
    await expect(cartao).toContainText("Teste auxiliar cozinha");
    await expect(cartao.getByText("Ativa agora")).toHaveCount(1);
  });

  test("sair da estação e bloqueio depois de 3 códigos errados", async ({ page }) => {
    // Reaproveita o aparelho cadastrado: o cookie da estação foi gravado no contexto do teste anterior,
    // por isso este teste cadastra de novo uma estação própria (cookie novo).
    await entrar(page, "gerente.geral");
    await page.goto("/estacoes");
    await page.getByLabel("Nome da estação").fill("Cozinha 2");
    await page.getByRole("button", { name: "Cadastrar ESTE aparelho como estação" }).click();
    await page.waitForURL("**/estacao");
    await expect(page.getByRole("heading", { level: 1, name: "Cozinha 2" })).toBeVisible();

    // A auxiliar ainda está na Cozinha 1: aparece como "Em outra estação".
    await expect(page.getByText("Em outra estação").first()).toBeVisible();

    // Sai da Cozinha 1 pela própria estação 2? Não: entra aqui (sai da outra automaticamente).
    await tocarNaPessoa(page, "Teste auxiliar cozinha");
    await digitar(page, "2580");
    const aqui = page.getByRole("list", { name: "Quem está aqui" });
    await expect(aqui.getByRole("button", { name: "Teste auxiliar cozinha, ativa agora" })).toBeVisible();

    // Toca no nome e escolhe Sair.
    await aqui.getByRole("button", { name: "Opções de Teste auxiliar cozinha" }).click();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByText("Ninguém entrou ainda.")).toBeVisible();

    // Código errado: mostra as tentativas e, no terceiro erro, bloqueia.
    await tocarNaPessoa(page, "Teste auxiliar cozinha");
    await digitar(page, "1357");
    await expect(page.getByText("Código errado. Restam 2 tentativas.")).toBeVisible();
    await digitar(page, "1357");
    await expect(page.getByText("Código errado. Restam 1 tentativa.")).toBeVisible();
    await digitar(page, "1357");
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Código bloqueado: chame o supervisor")).toBeVisible();
  });

  test("gerente desbloqueia o código e desliga a estação", async ({ page }) => {
    await entrar(page, "gerente.geral");
    await page.goto("/funcionarios");
    const linha = page.getByTestId("linha-auxiliar.cozinha");
    await expect(linha).toContainText("Bloqueado");
    await linha.getByText("Gerenciar Teste auxiliar cozinha").click();
    await linha.getByRole("button", { name: "Desbloquear código" }).click();
    await expect(page.getByText("Código desbloqueado.")).toBeVisible();
    await expect(page.getByTestId("linha-auxiliar.cozinha")).toContainText("Definido");

    // Este aparelho vira a estação "Cozinha 3".
    await page.goto("/estacoes");
    await page.getByLabel("Nome da estação").fill("Cozinha 3");
    await page.getByRole("button", { name: "Cadastrar ESTE aparelho como estação" }).click();
    await page.waitForURL("**/estacao");
    await expect(page.getByRole("heading", { level: 1, name: "Cozinha 3" })).toBeVisible();

    // O gerente entra de novo e desliga a Cozinha 3.
    await entrar(page, "gerente.geral");
    await page.goto("/estacoes");
    const cartao = page.getByTestId("estacao-Cozinha 3");
    await cartao.getByRole("button", { name: "Desligar estação" }).click();
    await expect(page.getByText("Desligar a estação tira o acesso deste tablet na hora. Confirmar?")).toBeVisible();
    await page.getByRole("button", { name: "Sim, desligar Cozinha 3" }).click();
    await expect(page.getByText("Estação desligada.")).toBeVisible();
    await expect(page.getByTestId("estacao-Cozinha 3")).toHaveCount(0);

    // O tablet desligado perde o acesso.
    await page.goto("/estacao");
    await expect(page.getByText("Este aparelho não está cadastrado como estação.")).toBeVisible();
  });
  test("faixa de aviso perto do fim do turno: estender 30 min", async ({ page }) => {
    await entrar(page, "gerente.geral");
    await page.goto("/estacoes");
    await page.getByLabel("Nome da estação").fill("Cozinha 4");
    await page.getByRole("button", { name: "Cadastrar ESTE aparelho como estação" }).click();
    await page.waitForURL("**/estacao");
    await tocarNaPessoa(page, "Teste cozinheira");
    await digitar(page, "2580");
    await expect(page.getByRole("button", { name: "Teste cozinheira, ativa agora" })).toBeVisible();
    // Longe do fim: só a linha discreta. O tablet sai às 00h30; entre 00h e 00h30 o fim real
    // já está perto, por isso o teste afasta o fim antes de conferir (não depende do relógio).
    sql("UPDATE estacao_presenca SET expira_em = now() + interval '3 hours' WHERE saiu_em IS NULL");
    await page.reload();
    await expect(page.getByText(/^Desliga às \d{2}:\d{2}$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Estender 30 min" })).toHaveCount(0);

    // Faltam 10 minutos: a faixa aparece.
    sql("UPDATE estacao_presenca SET expira_em = now() + interval '10 minutes' WHERE saiu_em IS NULL");
    await page.reload();
    const faixa = page.getByRole("alert", { name: "Aviso de desligamento" });
    await expect(faixa).toContainText(/O tablet desliga em (9|10) min/);
    const botao = faixa.getByRole("button", { name: "Estender 30 min" });
    expect((await botao.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    expect(await page.evaluate(() => window.__bipes ?? 0)).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: process.env.CAPTURA_AVISO ?? "test-results/estacao-aviso.png" });

    await botao.click();
    await expect(faixa).toHaveCount(0);
    await expect(page.getByText(/^Desliga às \d{2}:\d{2}$/)).toBeVisible();
  });
});
