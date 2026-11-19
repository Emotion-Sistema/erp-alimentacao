import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { avisoNaTela, entrar, janelaNoCentro, janelaSemEstouro, nomesDoMenu, semEstouroDeLargura, sql } from "./ajudas";

// Fichas técnicas (E08, migração 0019): o gerente geral cria um preparo da casa (rendimento digitado em
// kg), cria a ficha de um produto do cardápio usando o preparo, anota uma pendência (selo Incompleta),
// vê o custo parcial e o % do preço; grava o custo de referência "R$ 45,90 por 1 kg" e o custo muda;
// o limite do alerta põe a ficha em destaque; grava a versão 2 resolvendo a pendência, compara com a 1
// e abre a versão para a cozinha multiplicando por 2. A cozinheira consulta sem custo e sem editar;
// o atendente é bloqueado (tela e API); celular sem rolagem de lado. Só dados fictícios.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const SUFIXO = Math.random().toString(36).slice(2, 7);
const CARNE = `Carne tela ${SUFIXO}`;
const PAO = `Pão tela ${SUFIXO}`;
const MOLHO = `Molho tela ${SUFIXO}`;
const LANCHE = `Lanche ficha ${SUFIXO}`;
const PENDENCIA = "Confirmar o peso do molho";

let idDoPreparo = 0;
let idDoLanche = 0;

test.beforeAll(() => {
  // Ingredientes e produto próprios deste teste (o banco de tela é o mesmo das outras telas).
  sql(
    `INSERT INTO ingrediente (nome, unidade_base, unidade_exibicao, area_estoque) VALUES ('${CARNE}', 'g', 'g', 'cozinha'), ('${PAO}', 'un', 'un', 'cozinha')`,
  );
  // O pão já tem preço: R$ 1,00 por unidade. A carne fica sem (o custo do lanche começa parcial).
  sql(`UPDATE ingrediente SET custo_ref_centavos = 100, custo_ref_quantidade = 1, custo_ref_em = now() WHERE nome = '${PAO}'`);
  sql(
    `INSERT INTO produto (nome, categoria_id, preco_centavos, preco_delivery_centavos, ordem) SELECT '${LANCHE}', id, 3000, 3500, 0 FROM categoria WHERE ativo ORDER BY id LIMIT 1`,
  );
  sql(`UPDATE ficha_config SET limite_custo_pb = 3500 WHERE id = 1`);
});

test.afterAll(() => {
  sql(`UPDATE ficha_config SET limite_custo_pb = 3500 WHERE id = 1`);
});

async function abrirAba(page: Page, nome: RegExp | string) {
  const aba = page.getByRole("tab", { name: nome });
  await aba.click();
  await expect(aba).toHaveAttribute("aria-selected", "true");
}

async function porItem(janela: Locator, busca: string, nome: string, unidade: string) {
  await janela.getByLabel("Procurar ingrediente ou preparo").fill(busca);
  await janela.getByRole("button", { name: `Pôr ${nome} (${unidade})` }).click();
  await expect(janela.getByLabel(`Quantidade de ${nome}`)).toBeVisible();
}

const idDaUrl = (page: Page) => Number(/\/cadastros\/fichas\/(\d+)$/.exec(new URL(page.url()).pathname)![1]);

test("gerente cria um preparo da casa com rendimento em kg", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  expect(await nomesDoMenu(page)).toContain("Fichas técnicas");
  await page.goto("/cadastros/fichas");
  await expect(page.getByRole("heading", { name: "Fichas técnicas", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Custos" })).toBeVisible();

  await page.getByRole("button", { name: "Nova ficha" }).click();
  const janela = page.getByRole("dialog", { name: "Nova ficha técnica" });
  await janelaNoCentro(page, janela);
  await janela.getByLabel("Tipo da ficha").selectOption("preparo");
  await janela.getByLabel("O preparo rende em").selectOption("g");
  await janela.getByLabel("Nome do preparo").fill(MOLHO);
  await janela.getByLabel("Rende quanto").fill("0,5");
  await janela.getByLabel("Unidade do rendimento").selectOption("kg");
  await porItem(janela, "carne tela", CARNE, "g");
  await janela.getByLabel(`Quantidade de ${CARNE}`).fill("400");
  // Item repetido não aparece de novo na busca.
  await janela.getByLabel("Procurar ingrediente ou preparo").fill("carne tela");
  await expect(janela.getByRole("button", { name: `Pôr ${CARNE} (g)` })).toHaveCount(0);
  await janela.getByLabel("Procurar ingrediente ou preparo").fill("");
  await janela.getByRole("button", { name: "Adicionar etapa" }).click();
  await janela.getByRole("textbox", { name: "Etapa 1", exact: true }).fill("Bater tudo no liquidificador");
  await janela.getByLabel("Minutos da etapa 1").fill("5");
  await janela.getByRole("button", { name: "Criar ficha" }).click();

  await page.waitForURL(/\/cadastros\/fichas\/\d+$/);
  idDoPreparo = idDaUrl(page);
  await expect(page.getByRole("heading", { name: MOLHO, level: 1 })).toBeVisible();
  await expect(page.getByTestId("situacao-da-ficha")).toHaveText("Completa");
  await expect(page.getByTestId("versao-da-ficha")).toHaveText("Versão 1");
  // 0,5 kg foi gravado como 500 g (fração exata) e aparece de novo como 500 g.
  const r = await page.request.get(`/api/fichas/${idDoPreparo}`);
  const f = (await r.json()) as { versao: { rende: string; itens: { quantidade: string }[] } };
  expect(f.versao.rende).toBe("500");
  expect(f.versao.itens[0]!.quantidade).toBe("400");
  await expect(page.getByTestId("usado-em")).toContainText("ainda não está em nenhuma ficha ativa");
});

test("gerente cria a ficha do produto com o preparo e anota uma pendência", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fichas");
  await abrirAba(page, /^No cardápio sem ficha/);
  await page.getByRole("button", { name: `Criar ficha de ${LANCHE}` }).click();
  const janela = page.getByRole("dialog", { name: "Nova ficha técnica" });
  await expect(janela.getByLabel("Produto", { exact: true })).toHaveValue(/\d+/);
  await expect(janela.getByLabel("Rende quantas porções")).toHaveValue("1");
  await porItem(janela, "pão tela", PAO, "un");
  await janela.getByLabel(`Quantidade de ${PAO}`).fill("1");
  await porItem(janela, "molho tela", MOLHO, "g");
  await janela.getByLabel(`Quantidade de ${MOLHO}`).fill("50");
  await janela.getByLabel(`Medida caseira de ${MOLHO}`).fill("1 colher");
  await janela.getByRole("button", { name: "Anotar pendência" }).click();
  await janela.getByRole("textbox", { name: "Pendência 1", exact: true }).fill(PENDENCIA);
  await janela.getByRole("button", { name: "Criar ficha" }).click();

  await page.waitForURL(/\/cadastros\/fichas\/\d+$/);
  idDoLanche = idDaUrl(page);
  await expect(page.getByRole("heading", { name: LANCHE, level: 1 })).toBeVisible();
  await expect(page.getByTestId("situacao-da-ficha")).toHaveText("Incompleta (1 pendência)");
  await expect(page.getByTestId("pendencias")).toContainText(PENDENCIA);
  await expect(page.getByTestId("pendencias")).toContainText("Anotada");
  // Custo: só o pão tem preço (R$ 1,00); a carne do molho ainda não: parcial.
  await expect(page.getByTestId("custo-por-porcao")).toHaveText("R$ 1,00 (parcial)");
  await expect(page.getByTestId(`item-${PAO}`).getByTestId("custo-do-item")).toHaveText("R$ 1,00");
  await expect(page.getByTestId(`item-${MOLHO}`).getByTestId("custo-do-item")).toHaveText("sem preço");
  await expect(page.getByTestId("sem-custo")).toContainText(CARNE);
  // 100 / 3000 = 3,33% na loja; 100 / 3500 = 2,86% no delivery.
  await expect(page.getByTestId("custo-loja")).toHaveText("Na loja: 3,33% do preço");
  await expect(page.getByTestId("custo-delivery")).toHaveText("No delivery: 2,86% do preço");
  // Incompleta: ainda não diz o que sai do estoque.
  await expect(page.getByTestId("consumo")).toContainText("Aparece quando a ficha estiver completa");

  // O preparo agora mostra onde é usado.
  await page.goto(`/cadastros/fichas/${idDoPreparo}`);
  await expect(page.getByTestId("usado-em").getByRole("link", { name: LANCHE })).toBeVisible();
});

test("custo de referência em R$ 45,90 por 1 kg muda o custo, e o limite põe a ficha em alerta", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fichas?aba=custos");
  await expect(page.getByRole("tab", { name: "Custos" })).toHaveAttribute("aria-selected", "true");
  const linha = page.getByTestId(`preco-${CARNE}`);
  await expect(linha.getByTestId("preco-atual")).toHaveText("Sem preço");
  await expect(page.getByTestId(`preco-${PAO}`).getByTestId("preco-atual")).toHaveText("R$ 1,00 por 1 un");
  await linha.getByRole("button", { name: `Editar o preço de ${CARNE}` }).click();
  await linha.getByLabel("Preço (R$)").fill("45,90");
  await expect(linha.getByLabel("Por quanto")).toHaveValue("1");
  await expect(linha.getByLabel("Unidade")).toHaveValue("kg");
  // Quantidade inválida: a tela explica e não grava.
  await linha.getByLabel("Por quanto").fill("0");
  await linha.getByRole("button", { name: "Salvar preço" }).click();
  await expect(linha.getByRole("alert")).toContainText("Quantidade: um número maior que zero");
  await linha.getByLabel("Por quanto").fill("1");
  await linha.getByRole("button", { name: "Salvar preço" }).click();
  await expect(linha.getByTestId("preco-atual")).toHaveText("R$ 45,90 por 1 kg");
  // No banco: 4590 centavos por 1000 g (kg virou g sem float).
  const p = (await (await page.request.get("/api/fichas")).json()) as { ingredientes: { nome: string; custoCentavos: number; custoQuantidade: string }[] };
  expect(p.ingredientes.find((g) => g.nome === CARNE)).toMatchObject({ custoCentavos: 4590, custoQuantidade: "1000" });

  // Molho: 400 g x R$ 45,90/kg = R$ 18,36 por 500 g; 50 g no lanche = R$ 1,836; + pão R$ 1,00 = R$ 2,84.
  await page.goto(`/cadastros/fichas/${idDoLanche}`);
  await expect(page.getByTestId("custo-por-porcao")).toHaveText("R$ 2,84");
  await expect(page.getByTestId(`item-${MOLHO}`).getByTestId("custo-do-item")).toHaveText("R$ 1,84");
  await expect(page.getByTestId("sem-custo")).toHaveCount(0);
  await expect(page.getByTestId("custo-loja")).toHaveText("Na loja: 9,47% do preço");
  await expect(page.getByTestId("custo-delivery")).toHaveText("No delivery: 8,11% do preço");

  // Limite do alerta em 5%: a ficha passa e fica em destaque (ícone e texto, não só a cor).
  await page.goto("/cadastros/fichas?aba=custos");
  await page.getByLabel("Alertar quando o custo passar de (%)").fill("5");
  await page.getByRole("button", { name: "Salvar limite" }).click();
  await expect(page.getByTestId("limite-atual")).toHaveText("Hoje o alerta aparece acima de 5% do preço.");
  await abrirAba(page, /^Fichas \(/);
  const cartao = page.getByTestId(`ficha-${LANCHE}`);
  await expect(cartao.getByTestId("custo-da-ficha")).toContainText("R$ 2,84");
  await expect(cartao.getByTestId("custo-loja")).toHaveAttribute("data-acima", "sim");
  await expect(cartao.getByTestId("custo-loja")).toHaveText("Na loja: 9,47% do preço, acima do limite de 5%");
  await expect(cartao.getByTestId("situacao-da-ficha")).toHaveText("Incompleta (1 pendência)");
  // Filtros: incompletas mostra o lanche; preparos mostra só o molho.
  await page.getByLabel("Situação").selectOption("incompletas");
  await expect(cartao).toBeVisible();
  await expect(page.getByTestId(`ficha-${MOLHO}`)).toHaveCount(0);
  await page.getByLabel("Situação").selectOption("todas");
  await page.getByLabel("Tipo", { exact: true }).selectOption("preparo");
  await expect(page.getByTestId(`ficha-${MOLHO}`)).toBeVisible();
  await expect(cartao).toHaveCount(0);
  await page.getByLabel("Tipo", { exact: true }).selectOption("todos");
  await page.getByLabel("Procurar ficha").fill(`lanche ficha ${SUFIXO}`);
  await expect(cartao).toBeVisible();
  await expect(page.getByTestId(`ficha-${MOLHO}`)).toHaveCount(0);

  await page.goto("/cadastros/fichas?aba=custos");
  await page.getByLabel("Alertar quando o custo passar de (%)").fill("35");
  await page.getByRole("button", { name: "Salvar limite" }).click();
  await expect(page.getByTestId("limite-atual")).toHaveText("Hoje o alerta aparece acima de 35% do preço.");
});

test("versão 2 resolve a pendência; comparar com a 1; versão para a cozinha em 2x", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto(`/cadastros/fichas/${idDoLanche}`);
  await page.getByRole("button", { name: "Editar receita" }).click();
  const janela = page.getByRole("dialog", { name: `Editar a receita de ${LANCHE}` });
  await janelaNoCentro(page, janela);
  await expect(janela.getByLabel(`Quantidade de ${MOLHO}`)).toHaveValue("50");
  await expect(janela.getByRole("textbox", { name: "Pendência 1", exact: true })).toHaveValue(PENDENCIA);
  await janela.getByRole("button", { name: "Tirar a pendência 1" }).click();
  await janela.getByLabel(`Quantidade de ${MOLHO}`).fill("60");
  await janela.getByLabel("O que mudou").fill("Mais molho, peso confirmado");
  await janela.getByRole("button", { name: "Gravar versão nova" }).click();
  await expect(janela).toHaveCount(0);
  await expect(page.getByTestId("versao-da-ficha")).toHaveText("Versão 2");
  await expect(page.getByTestId("situacao-da-ficha")).toHaveText("Completa");
  await expect(page.getByTestId("pendencias")).toContainText("nada pendente");
  // 60 g de molho = R$ 2,2032 + pão R$ 1,00 = R$ 3,20.
  await expect(page.getByTestId("custo-por-porcao")).toHaveText("R$ 3,20");
  // Completa: o consumo por porção abre o preparo (60 g de molho = 48 g de carne) e soma o pão.
  await expect(page.getByTestId("consumo").getByRole("listitem").filter({ hasText: CARNE })).toContainText("48 g");
  await expect(page.getByTestId("consumo").getByRole("listitem").filter({ hasText: PAO })).toContainText("1 un");

  // Histórico e comparação (cada mudança com palavra e ícone).
  const historico = page.getByTestId("historico");
  await expect(historico.getByTestId("versao-2")).toContainText("Mais molho, peso confirmado");
  await historico.getByRole("button", { name: "Comparar a versão 1 com a atual" }).click();
  const comparacao = page.getByTestId("comparacao");
  await expect(comparacao.getByRole("heading", { name: "O que mudou da versão 1 para a 2" })).toBeVisible();
  await expect(comparacao.locator('[data-tipo="mudou"]')).toContainText(`${MOLHO}: 50 g → 60 g`);
  await expect(comparacao.locator('[data-tipo="saiu"]')).toContainText(`Pendência resolvida: ${PENDENCIA}`);
  await expect(comparacao.locator('[data-tipo="saiu"]')).toContainText("Saiu");

  // Conflito: gravar em cima da versão 1 (alguém abriu antes) é recusado pelo servidor.
  const antiga = await page.request.post("/api/fichas", { data: { id: idDoLanche, versaoBase: 1, receita: { rende: "1", itens: [] } } });
  expect(antiga.status()).toBe(409);

  // Versão para a cozinha: sem custo; 2x multiplica as quantidades.
  await page.getByRole("button", { name: "Versão para a cozinha" }).click();
  const cozinha = page.getByTestId("versao-cozinha");
  await expect(cozinha.getByRole("heading", { name: `${LANCHE}: receita para a cozinha` })).toBeVisible();
  await expect(cozinha.getByTestId(`cozinha-${PAO}`)).toContainText("1 un");
  await expect(cozinha.getByTestId(`cozinha-${MOLHO}`)).toContainText("60 g");
  await expect(cozinha.getByTestId(`cozinha-${MOLHO}`)).toContainText("medida de 1 receita: 1 colher");
  await cozinha.getByRole("radio", { name: "2x" }).check();
  await expect(cozinha.getByTestId("vezes-escolhidas")).toHaveText("Receita 2x");
  await expect(cozinha.getByTestId(`cozinha-${PAO}`)).toContainText("2 un");
  await expect(cozinha.getByTestId(`cozinha-${MOLHO}`)).toContainText("120 g");
  await expect(cozinha.getByTestId("rende-cozinha")).toHaveText("2 porções");
  await cozinha.getByRole("radio", { name: "Outro" }).check();
  await cozinha.getByLabel("Quantas vezes").fill("1,5");
  await expect(cozinha.getByTestId(`cozinha-${MOLHO}`)).toContainText("90 g");
  await expect(cozinha).not.toContainText("R$");
  await cozinha.getByRole("button", { name: "Voltar para a ficha" }).click();
  await expect(page.getByRole("heading", { name: LANCHE, level: 1 })).toBeVisible();
});

test("preparo em uso não desativa; a ficha do lanche desativa e reativa", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto(`/cadastros/fichas/${idDoPreparo}`);
  await page.getByRole("button", { name: "Desativar ficha" }).click();
  await expect(avisoNaTela(page)).toContainText("Este preparo está em uso");
  await page.goto(`/cadastros/fichas/${idDoLanche}`);
  await page.getByRole("button", { name: "Desativar ficha" }).click();
  await expect(page.getByText("Esta ficha está desativada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar receita" })).toHaveCount(0);
  await page.goto("/cadastros/fichas");
  await expect(page.getByTestId("fichas-no-fim").getByTestId(`ficha-${LANCHE}`)).toBeVisible();
  await page.goto(`/cadastros/fichas/${idDoLanche}`);
  await page.getByRole("button", { name: "Reativar ficha" }).click();
  await expect(page.getByRole("button", { name: "Editar receita" })).toBeVisible();
});

test("cozinheira consulta a ficha sem custo e sem editar", async ({ page }) => {
  await entrar(page, "cozinheira");
  await page.goto("/cadastros/fichas");
  expect(await nomesDoMenu(page)).toContain("Fichas técnicas");
  await expect(page.getByTestId("so-ler")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova ficha" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Custos" })).toHaveCount(0);
  await expect(page.getByTestId(`ficha-${LANCHE}`)).toBeVisible();
  await expect(page.getByTestId(`ficha-${LANCHE}`)).not.toContainText("R$");

  await page.goto(`/cadastros/fichas/${idDoLanche}`);
  await expect(page.getByRole("heading", { name: LANCHE, level: 1 })).toBeVisible();
  await expect(page.getByTestId(`item-${MOLHO}`)).toContainText("60 g");
  await expect(page.getByRole("button", { name: "Editar receita" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desativar ficha" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Custo" })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("R$");
  await page.getByRole("button", { name: "Versão para a cozinha" }).click();
  await expect(page.getByTestId("versao-cozinha")).toBeVisible();

  // O servidor também tira o custo e recusa gravar.
  const f = (await (await page.request.get(`/api/fichas/${idDoLanche}`)).json()) as { resumo: { custoCentavos: number | null; custoPbLoja: number | null }; custoDosItens: (number | null)[] };
  expect(f.resumo.custoCentavos).toBeNull();
  expect(f.resumo.custoPbLoja).toBeNull();
  expect(f.custoDosItens.every((c) => c === null)).toBe(true);
  const p = (await (await page.request.get("/api/fichas")).json()) as { podeVerCusto: boolean; podeGerenciar: boolean };
  expect(p).toMatchObject({ podeVerCusto: false, podeGerenciar: false });
  expect((await page.request.post("/api/fichas", { data: { id: idDoLanche, ativo: false } })).status()).toBe(403);
  expect((await page.request.post("/api/fichas/custo", { data: { ingredienteId: 1, custoCentavos: null } })).status()).toBe(403);
});

test("atendente é bloqueado na tela e na API", async ({ page }) => {
  await entrar(page, "atendente");
  for (const c of ["/cadastros/fichas", `/cadastros/fichas/${idDoLanche}`]) {
    await page.goto(c);
    await expect(page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
    await expect(page.getByText(LANCHE)).toHaveCount(0);
  }
  expect((await page.request.get("/api/fichas")).status()).toBe(403);
  expect((await page.request.get(`/api/fichas/${idDoLanche}`)).status()).toBe(403);
  expect((await page.request.post("/api/fichas/limite", { data: { limiteCustoPb: 9000 } })).status()).toBe(403);
});

test("importar fichas: modelo, conferir (criar, erro, ingrediente novo), gravar as boas e reimportar sem mudança", async ({ page }) => {
  const CREME = `Creme tela ${SUFIXO}`;
  const CEBOLA = `Cebola nova ${SUFIXO}`;
  const SUMIDO = `Produto sumido ${SUFIXO}`;
  const cabecalho = "ficha;tipo;rende;unidade do rendimento;porcao;unidade da porcao;tempo (min);validade (dias);ingrediente;quantidade;unidade;opcional;medida caseira;observacao;pendencia;etapa";
  const csv = [
    cabecalho,
    `${CREME};preparo;1;kg;;;10;2;${CARNE};0,4;kg;;;;;Refogar`,
    `${CREME};preparo;;;;;;;${CEBOLA};100;g;;1 xícara;;;Bater`,
    `${SUMIDO};produto;1;;;;;;${PAO};1;un;;;;;`,
  ].join("\n");
  const arquivo = { name: "fichas-teste.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") };

  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fichas");
  await page.getByRole("button", { name: "Importar fichas" }).click();
  const janela = page.getByRole("dialog", { name: "Importar fichas de uma planilha" });
  await janelaNoCentro(page, janela);
  await janela.getByText("Colunas da planilha").click();
  await expect(janela.getByTestId("colunas-do-modelo")).toContainText("unidade do rendimento");
  // O modelo .csv sai da própria tela, com o cabeçalho e 3 linhas de exemplo.
  const [baixado] = await Promise.all([page.waitForEvent("download"), janela.getByRole("button", { name: "Baixar modelo .csv" }).click()]);
  expect(baixado.suggestedFilename()).toBe("modelo-fichas-tecnicas.csv");
  const modelo = readFileSync((await baixado.path())!, "utf8").replace(/^\ufeff/, "").trim().split(/\r?\n/);
  expect(modelo[0]).toBe(cabecalho);
  expect(modelo).toHaveLength(4);

  await janela.getByLabel("Arquivo da planilha").setInputFiles(arquivo);
  await janela.getByRole("button", { name: "Conferir", exact: true }).click();
  const resultado = janela.getByTestId("resultado-da-conferencia");
  await expect(resultado.getByTestId(`importar-${CREME}`).getByTestId("acao")).toHaveText("Criar");
  await expect(resultado.getByTestId(`importar-${SUMIDO}`).getByTestId("acao")).toHaveText("Erro");
  await expect(resultado.getByTestId(`importar-${SUMIDO}`)).toContainText("Linha 4:");
  await expect(janela.getByTestId("ingredientes-novos")).toContainText(CEBOLA);
  const gravar = janela.getByRole("button", { name: "Gravar 1 ficha" });
  await expect(gravar).toBeDisabled();
  await janela.getByLabel("Gravar as boas e deixar de fora as com erro").check();
  await expect(gravar).toBeDisabled();
  await janela.getByLabel("Criar os ingredientes que faltam").check();
  await expect(gravar).toBeEnabled();
  await janelaSemEstouro(page);
  await gravar.click();
  await expect(janela).toHaveCount(0);
  await expect(page.getByTestId("aviso-rapido")).toContainText("1 ficha gravada.");
  await expect(page.getByTestId(`ficha-${CREME}`)).toBeVisible();
  await expect(page.getByTestId(`ficha-${SUMIDO}`)).toHaveCount(0);
  // 0,4 kg virou 400 g; a cebola nova foi cadastrada.
  await page.getByTestId(`ficha-${CREME}`).getByRole("link", { name: `Abrir a ficha de ${CREME}` }).click();
  await expect(page.getByTestId(`item-${CARNE}`)).toContainText("400 g");
  await expect(page.getByTestId(`item-${CEBOLA}`)).toContainText("100 g");

  // O mesmo arquivo de novo: nada muda.
  await page.goto("/cadastros/fichas");
  await page.getByRole("button", { name: "Importar fichas" }).click();
  await janela.getByLabel("Arquivo da planilha").setInputFiles(arquivo);
  await janela.getByRole("button", { name: "Conferir", exact: true }).click();
  await expect(resultado.getByTestId(`importar-${CREME}`).getByTestId("acao")).toHaveText("Sem mudança");
  await expect(janela.getByTestId("ingredientes-novos")).toHaveCount(0);
  await expect(janela.getByTestId("por-que-nao-grava")).toHaveText("Nada para gravar: nenhuma ficha nova ou mudada.");
});

test("celular (390 px): lista, ficha, editor e cozinha sem rolagem de lado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fichas");
  await expect(page.getByTestId(`ficha-${LANCHE}`)).toBeVisible();
  await semEstouroDeLargura(page);
  for (const aba of [/^No cardápio sem ficha/, /^Nomes parecidos/, "Custos"]) {
    await abrirAba(page, aba);
    await semEstouroDeLargura(page);
  }
  await page.goto(`/cadastros/fichas/${idDoLanche}`);
  await expect(page.getByRole("heading", { name: LANCHE, level: 1 })).toBeVisible();
  await semEstouroDeLargura(page);
  await page.getByRole("button", { name: "Comparar a versão 1 com a atual" }).click();
  await expect(page.getByTestId("comparacao")).toBeVisible();
  await semEstouroDeLargura(page);
  await page.getByRole("button", { name: "Editar receita" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await janelaSemEstouro(page);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Versão para a cozinha" }).click();
  await expect(page.getByTestId("versao-cozinha")).toBeVisible();
  await semEstouroDeLargura(page);
});
