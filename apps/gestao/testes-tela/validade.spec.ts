import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { entrar, semEstouroDeLargura, sql } from "./ajudas";
import { BANCO } from "./playwright.config";

// Desperdício por vencimento (ideia nº 15), no celular:
// - D1: o bloco "Dinheiro em risco" do painel do estoque (R$ que vence em 3 e 7 dias e o vencido
//   que continua no estoque), com a lista por item e área; quem não vê custos nem chama a rota;
// - D4a: o campo "Validade mínima na entrada (dias)" no cadastro do ingrediente (salvar sem mexer
//   mantém o valor) e o alerta de validade curta depois de gravar a entrada; o aviso ao gerente
//   aparece na central quando quem deu entrada não é de compras.
// Só itens inventados.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 } });

const SUFIXO = Math.random().toString(36).slice(2, 9).replace(/[0-9]/g, (c) => "qrstuvwxyz"[Number(c)]!);
const NATA = `Nata validade ${SUFIXO}`;
const CREME = `Creme validade ${SUFIXO}`;
const LEITE = `Leite validade ${SUFIXO}`;
const REQUEIJAO = `Requeijão validade ${SUFIXO}`;
const IOGURTE = `Iogurte validade ${SUFIXO}`;

/** Só no teste: um valor do banco de teste de tela. */
function valor(comando: string): string {
  return execFileSync("psql", [BANCO, "-tA", "-v", "ON_ERROR_STOP=1", "-c", comando], { encoding: "utf8" }).trim();
}
const idDe = (nome: string) => Number(valor(`SELECT id FROM ingrediente WHERE nome = '${nome}'`));

/** Hoje (fuso da loja) + n dias, em AAAA-MM-DD. */
function dia(n: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + n)).toISOString().slice(0, 10);
}
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** O valor de um dado (rótulo + valor) da ficha dentro de `onde`. */
const dado = (onde: Locator, rotulo: string) => onde.locator(".erp-dado").filter({ has: onde.page().locator("dt", { hasText: new RegExp(`^${rotulo}$`) }) }).locator("dd");

async function darEntrada(page: Page, itens: Record<string, unknown>[]) {
  const r = await page.request.post("/api/estoque/entradas", { data: { chave: crypto.randomUUID(), itens } });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()) as { validadeCurta: { nome: string; dias: number; minimoDias: number }[] };
}

/** O vencido que já estava na loja só entra pelo saldo inicial (entra bloqueado). */
async function saldoInicialVencido(page: Page, nome: string) {
  const csv = `Item;Quantidade;Unidade;Local;Validade;Valor total (R$)\n${nome};0,5;kg;Guardado;${ddmm(dia(-1))}/${dia(-1).slice(0, 4)};5,00\n`;
  const arquivo = { nome: "saldo.csv", conteudo: Buffer.from(csv, "utf8").toString("base64") };
  const conf = await page.request.post("/api/estoque/saldo-inicial", { data: { arquivo, aplicar: false } });
  expect(conf.ok(), await conf.text()).toBe(true);
  const { chave } = (await conf.json()) as { chave: string };
  const r = await page.request.post("/api/estoque/saldo-inicial", { data: { arquivo, aplicar: true, chave } });
  expect(r.status(), await r.text()).toBe(201);
}

test.beforeAll(() => {
  for (const nome of [NATA, CREME, LEITE, IOGURTE]) sql(`INSERT INTO ingrediente (nome, unidade_base, unidade_exibicao, area_estoque) VALUES ('${nome}', 'g', 'kg', 'cozinha')`);
  sql(`INSERT INTO ingrediente (nome, unidade_base, unidade_exibicao, area_estoque, validade_minima_dias) VALUES ('${REQUEIJAO}', 'g', 'kg', 'cozinha', 5)`);
});

test("D1: o painel mostra o dinheiro em risco e a lista por item abre o item", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await darEntrada(page, [
    { ingredienteId: idDe(NATA), quantidade: "1", unidade: "kg", local: "guardado", validade: dia(2), valorCentavos: 1000 },
    { ingredienteId: idDe(CREME), quantidade: "2", unidade: "kg", local: "em_uso", validade: dia(6), valorCentavos: 3000 },
  ]);
  await saldoInicialVencido(page, LEITE);

  await page.goto("/estoque");
  const bloco = page.getByTestId("dinheiro-em-risco");
  await expect(bloco.getByRole("heading", { name: "Dinheiro em risco" })).toBeVisible();
  // Os totais somam tudo o que há no banco de tela; aqui confere o formato e que não é zero.
  const resumo = bloco.getByTestId("em-risco-resumo");
  for (const rotulo of ["Vence em até 3 dias", "Em até 7 dias", "Vencido ainda no estoque"]) await expect(dado(resumo, rotulo)).toHaveText(/^R\$ [\d.]+,\d{2}$/);
  await expect(dado(resumo, "Vence em até 3 dias")).not.toHaveText("R$ 0,00");
  await expect(dado(resumo, "Vencido ainda no estoque")).not.toHaveText("R$ 0,00");
  await expect(bloco.getByTestId("em-risco-itens")).toHaveCount(0);
  await bloco.getByRole("button", { name: "Ver os itens" }).click();
  const lista = bloco.getByTestId("em-risco-itens");

  const nata = lista.getByTestId(`em-risco-${NATA}-cozinha`);
  await expect(nata).toContainText("Alimentos da cozinha");
  await expect(dado(nata, "Até 3 dias")).toHaveText("1 kg, R$ 10,00");
  await expect(dado(nata, "Até 7 dias")).toHaveText("1 kg, R$ 10,00");
  await expect(dado(nata, "Vencido")).toHaveCount(0);
  await expect(dado(nata, "Primeira validade")).toHaveText(ddmm(dia(2)));
  const creme = lista.getByTestId(`em-risco-${CREME}-cozinha`);
  await expect(dado(creme, "Até 3 dias")).toHaveText("0 g, R$ 0,00");
  await expect(dado(creme, "Até 7 dias")).toHaveText("2 kg, R$ 30,00");
  await expect(dado(creme, "Primeira validade")).toHaveText(ddmm(dia(6)));
  const leite = lista.getByTestId(`em-risco-${LEITE}-cozinha`);
  await expect(leite.getByText("Tem vencido")).toBeVisible();
  await expect(dado(leite, "Vencido")).toHaveText("500 g, R$ 5,00");
  await expect(dado(leite, "Primeira validade")).toHaveText(ddmm(dia(-1)));
  await semEstouroDeLargura(page);
  // Com CAPTURAS=<pasta>, salva o bloco aberto para conferir com o protótipo.
  if (process.env.CAPTURAS) await bloco.screenshot({ path: join(process.env.CAPTURAS, "dinheiro-em-risco-celular.png"), animations: "disabled" });

  // Tocar abre o item (lotes e lançamentos) na gaveta.
  await nata.getByRole("button", { name: `Abrir o item ${NATA} (Alimentos da cozinha)` }).click();
  const detalhe = page.getByTestId("detalhe-do-item");
  await expect(detalhe).toBeVisible();
  await expect(detalhe).toContainText(NATA);
  await detalhe.getByRole("button", { name: "Fechar" }).click();
  await bloco.getByRole("button", { name: "Esconder os itens" }).click();
  await expect(bloco.getByTestId("em-risco-itens")).toHaveCount(0);
});

test("D1: quem não vê custos não vê o bloco nem chama a rota (o servidor recusa)", async ({ page }) => {
  await entrar(page, "cozinheira");
  const chamadas: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/estoque/em-risco")) chamadas.push(r.url());
  });
  await page.goto("/estoque");
  await expect(page.getByTestId("itens-do-estoque")).toBeVisible();
  await expect(page.getByTestId("dinheiro-em-risco")).toHaveCount(0);
  expect(chamadas).toEqual([]);
  expect((await page.request.get("/api/estoque/em-risco")).status()).toBe(403);
});

test("D4a: validade mínima no cadastro; salvar sem mexer mantém; vazio tira", async ({ page }) => {
  await entrar(page, "gerente.geral");
  const minimo = () => valor(`SELECT coalesce(validade_minima_dias::text, 'nulo') FROM ingrediente WHERE nome = '${IOGURTE}'`);
  const abrir = async () => {
    await page.goto("/cadastros");
    await page.getByRole("searchbox", { name: "Buscar por nome" }).fill(IOGURTE);
    await page.getByRole("button", { name: `Editar ${IOGURTE}`, exact: true }).click();
    const janela = page.getByRole("dialog", { name: `Editar ${IOGURTE}` });
    await expect(janela).toBeVisible();
    return janela;
  };
  const rotulo = "Validade mínima na entrada (dias)";

  let janela = await abrir();
  const campo = janela.getByLabel(rotulo);
  await expect(campo).toHaveValue("");
  await expect(campo).toHaveAccessibleDescription(/Se a compra chegar com menos dias de validade que isto, o sistema avisa\. Deixe vazio para não avisar\./);
  // Texto que não é número: a tela avisa e não grava.
  await campo.fill("uma semana");
  await janela.getByRole("button", { name: "Salvar ingrediente" }).click();
  await expect(janela.getByText("Validade mínima: um número inteiro de dias, de 1 a 365. Deixe vazio para não avisar.")).toBeVisible();
  expect(minimo()).toBe("nulo");
  // Fora de 1 a 365: o servidor recusa e a mensagem dele aparece.
  await campo.fill("400");
  await janela.getByRole("button", { name: "Salvar ingrediente" }).click();
  await expect(janela.getByText("Validade mínima: de 1 a 365 dias.")).toBeVisible();
  expect(minimo()).toBe("nulo");
  await campo.fill("7");
  await semEstouroDeLargura(page);
  await janela.getByRole("button", { name: "Salvar ingrediente" }).click();
  await expect(janela).toHaveCount(0);
  expect(minimo()).toBe("7");

  // Abrir e salvar sem mexer: o valor continua.
  janela = await abrir();
  await expect(janela.getByLabel(rotulo)).toHaveValue("7");
  await janela.getByRole("button", { name: "Salvar ingrediente" }).click();
  await expect(janela).toHaveCount(0);
  expect(minimo()).toBe("7");

  // Vazio: deixa de avisar.
  janela = await abrir();
  await janela.getByLabel(rotulo).fill("");
  await janela.getByRole("button", { name: "Salvar ingrediente" }).click();
  await expect(janela).toHaveCount(0);
  expect(minimo()).toBe("nulo");
});

test("D4a: a entrada com validade curta grava e mostra o alerta", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/estoque/compras");
  await page.getByRole("tab", { name: "Dar entrada" }).click();
  const linha = page.getByTestId("linha-da-entrada-1");
  await linha.getByLabel("Ingrediente").selectOption({ label: REQUEIJAO });
  await linha.getByLabel("Quantidade").fill("1");
  await linha.getByLabel("Validade").fill(dia(3));
  await page.getByRole("button", { name: "Dar entrada em 1 item" }).click();
  await expect(page.getByTestId("entrada-gravada")).toHaveText("Entrada gravada: 1 item.");
  const alerta = page.getByTestId("validade-curta");
  await expect(alerta).toHaveText(`Entrada registrada. Atenção, validade curta:"${REQUEIJAO}" vence ${ddmm(dia(3))} (3 dias; mínimo 5).`);
  // É alerta, não erro: a entrada valeu e nada aparece como erro.
  await expect(page.getByTestId("erro-da-entrada")).toHaveCount(0);
  await expect(alerta).not.toHaveAttribute("role", "alert");
  await semEstouroDeLargura(page);

  // Outra compra com validade boa: sem alerta.
  await page.getByRole("button", { name: "Dar entrada em outra compra" }).click();
  await page.getByTestId("linha-da-entrada-1").getByLabel("Ingrediente").selectOption({ label: REQUEIJAO });
  await page.getByTestId("linha-da-entrada-1").getByLabel("Quantidade").fill("1");
  await page.getByTestId("linha-da-entrada-1").getByLabel("Validade").fill(dia(10));
  await page.getByRole("button", { name: "Dar entrada em 1 item" }).click();
  await expect(page.getByTestId("entrada-gravada")).toHaveText("Entrada gravada: 1 item.");
  await expect(page.getByTestId("validade-curta")).toHaveCount(0);
});

test("D4a: quem não é de compras dá entrada curta e o gerente vê o aviso na central", async ({ page, browser }) => {
  await entrar(page, "cozinheira");
  const r = await darEntrada(page, [{ ingredienteId: idDe(REQUEIJAO), quantidade: "1", unidade: "kg", local: "guardado", validade: dia(2) }]);
  expect(r.validadeCurta.map((c) => [c.dias, c.minimoDias])).toEqual([[2, 5]]);

  const baseURL = test.info().project.use.baseURL!;
  const contexto = await browser.newContext({ baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport: { width: 390, height: 844 } });
  try {
    const gerente = await contexto.newPage();
    await entrar(gerente, "gerente.geral");
    await gerente.getByRole("button", { name: /Avisos: \d+ avisos? novos?/ }).click();
    const painel = gerente.getByTestId("painel-avisos");
    await expect(painel.getByTestId("aviso-item").filter({ hasText: `Entrada com validade curta: "${REQUEIJAO}" vence ${ddmm(dia(2))} (mínimo 5 dias). Fale com o fornecedor.` })).toBeVisible();
  } finally {
    await contexto.close();
  }
});
