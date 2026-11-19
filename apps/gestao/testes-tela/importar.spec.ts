import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { entrar, semEstouroDeLargura } from "./ajudas";

// Importar planilha (E07 parte 3, decisão 0020). Critério da etapa: "planilha de exemplo importada
// com os erros apontados". Arquivos de exemplo (dados inventados) em ./arquivos/.
// Fluxo: escolher o arquivo, ver o mapa de colunas, conferir (nada gravado), ver os erros com linha
// e coluna, filtrar, baixar o relatório, pular as linhas com erro e gravar (clique duplo não duplica).

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const ARQUIVOS = join(import.meta.dirname, "arquivos");
const arquivo = (nome: string) => join(ARQUIVOS, nome);

async function quantosProdutos(page: Page, nome: string) {
  const r = await page.request.get("/api/cadastros/produtos");
  expect(r.ok()).toBe(true);
  return ((await r.json()) as { nome: string }[]).filter((p) => p.nome === nome).length;
}

const linha = (page: Page, n: number) => page.getByTestId(`linha-${n}`);
const resumo = (page: Page) => page.getByTestId("resumo-da-conferencia");

test("supervisor não vê o botão nem entra na tela; o servidor recusa", async ({ page }) => {
  await entrar(page, "supervisor");
  await page.goto("/cadastros/produtos");
  await expect(page.getByRole("heading", { name: "Produtos", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Importar planilha" })).toHaveCount(0);
  await page.goto("/cadastros");
  await expect(page.getByRole("heading", { name: "Ingredientes", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Importar planilha" })).toHaveCount(0);
  await page.goto("/cadastros/importar");
  await expect(page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
  const r = await page.request.post("/api/cadastros/importar/conferir", { data: { tipo: "produtos", arquivo: { nome: "a.csv", conteudo: "" } } });
  expect(r.status()).toBe(403);
});

test("produtos: planilha de exemplo com os erros apontados, nada gravado até Gravar, e gravar uma vez só", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  await page.getByRole("link", { name: "Importar planilha" }).click();
  await expect(page.getByRole("heading", { name: "Importar planilha", level: 1 })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Produtos" })).toBeChecked();
  // Modelo para baixar, com as colunas certas.
  const [modelo] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Baixar modelo (.csv)" }).click()]);
  expect(modelo.suggestedFilename()).toBe("modelo-produtos.csv");
  expect(readFileSync(await modelo.path(), "utf8")).toContain("Nome;Categoria;Tipo de produção;Preço (R$);Tempo de preparo (min);Descrição");

  await page.getByLabel("Arquivo da planilha").setInputFiles(arquivo("produtos-com-erros.csv"));
  await expect(resumo(page)).toHaveText("2 prontas, 3 com erro, 1 já cadastrada.");
  // Nada foi gravado na conferência.
  expect(await quantosProdutos(page, "Misto quente da tela")).toBe(0);

  // Mapa de colunas: cada campo com a coluna entendida.
  const mapa = page.getByTestId("mapa-de-colunas");
  await expect(mapa.getByLabel("Preço (R$) (obrigatório)")).toHaveValue("3");
  await expect(mapa.getByLabel("Preço (R$) (obrigatório)").locator("option:checked")).toHaveText("Coluna D: Preço");
  await expect(mapa.getByLabel("Categoria (obrigatório)").locator("option:checked")).toHaveText("Coluna B: Categoria");

  // Erros com a linha e a coluna da planilha.
  await expect(linha(page, 2)).toContainText("Pronta");
  await expect(linha(page, 2)).toContainText("Salgados, R$ 9,50, Tipo: Salgados, 6 min");
  await expect(linha(page, 4)).toContainText("Com erro");
  await expect(linha(page, 4)).toContainText('Coluna B (Categoria): Não existe a categoria "Sobremesas"');
  await expect(linha(page, 5)).toContainText('Coluna D (Preço): Preço inválido: "sete reais"');
  await expect(linha(page, 6)).toContainText("Já cadastrada");
  await expect(linha(page, 7)).toContainText("Coluna E (Tempo de preparo (min)): Falta o tempo de preparo");
  const gravar = page.getByRole("button", { name: /^Gravar/ });
  await expect(gravar).toBeDisabled();
  await expect(page.getByText("Para gravar, corrija 3 linhas com erro")).toBeVisible();

  // Filtro por situação.
  await page.getByRole("radio", { name: "Com erro (3)" }).check();
  await expect(page.locator(".imp-linha")).toHaveCount(3);
  await page.getByRole("radio", { name: "Todas (6)" }).check();
  await expect(page.locator(".imp-linha")).toHaveCount(6);

  // Relatório de erros (.csv) com linha, coluna e motivo.
  const [relatorio] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar relatório de erros (.csv)" }).click()]);
  expect(relatorio.suggestedFilename()).toBe("erros-produtos-com-erros.csv");
  const texto = readFileSync(await relatorio.path(), "utf8");
  expect(texto).toContain("4;Com erro;Bolo de pote da tela;Coluna B (Categoria);");
  expect(texto).toContain("6;Já cadastrada;X-Salada");

  // Trocar a coluna: sem a descrição, confere de novo e continua igual no resto.
  await mapa.getByLabel("Descrição").selectOption({ label: "Não usar" });
  await expect(mapa.getByLabel("Descrição")).toHaveValue("");
  await expect(resumo(page)).toHaveText("2 prontas, 3 com erro, 1 já cadastrada.");

  // Pula as linhas com erro, de propósito: o botão habilita.
  for (const n of [4, 5, 7]) await linha(page, n).getByRole("checkbox", { name: `Pular a linha ${n}` }).check();
  await expect(resumo(page)).toHaveText("2 prontas, 1 já cadastrada, 3 puladas.");
  await expect(gravar).toBeEnabled();
  await expect(gravar).toHaveText("Gravar 2 produtos");
  expect(await quantosProdutos(page, "Misto quente da tela")).toBe(0);

  // Clique duplo: grava uma vez só.
  await gravar.dblclick();
  await expect(page.getByTestId("importacao-gravada")).toHaveText(
    "Pronto: 2 produtos cadastrados. 1 já estava cadastrado e foi pulado. 3 linhas puladas por você.",
  );
  expect(await quantosProdutos(page, "Misto quente da tela")).toBe(1);
  expect(await quantosProdutos(page, "Suco de uva da tela")).toBe(1);
  expect(await quantosProdutos(page, "Pastel da tela")).toBe(0);
  await page.getByRole("link", { name: "Ver os produtos" }).click();
  await expect(page.getByTestId("categoria-Salgados").getByTestId("produto-Misto quente da tela")).toContainText("R$ 9,50");
});

test("ingredientes em .xlsx: unidade, área e fornecedor apontados; grava com as embalagens", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await page.getByRole("link", { name: "Importar planilha" }).click();
  await expect(page.getByRole("radio", { name: "Ingredientes" })).toBeChecked();
  await page.getByLabel("Arquivo da planilha").setInputFiles(arquivo("ingredientes-com-erros.xlsx"));
  await expect(resumo(page)).toHaveText("2 prontas, 2 com erro, 1 já cadastrada.");
  await expect(linha(page, 2)).toContainText("Quilos (kg), Alimentos da cozinha, Fornecedor: Atacado Exemplo (fictício), Embalagens: saco 5 kg, pacote 1 kg");
  await expect(linha(page, 4)).toContainText('Coluna B (Unidade): Unidade "pacote" desconhecida');
  await expect(linha(page, 5)).toContainText("Já cadastrada");
  await expect(linha(page, 6)).toContainText('Coluna D (Fornecedor): Não existe o fornecedor "Distribuidora Inexistente"');
  for (const n of [4, 6]) await linha(page, n).getByRole("checkbox", { name: `Pular a linha ${n}` }).check();
  await page.getByRole("button", { name: "Gravar 2 ingredientes" }).click();
  await expect(page.getByTestId("importacao-gravada")).toContainText("Pronto: 2 ingredientes cadastrados.");
  const r = await page.request.get("/api/cadastros/ingredientes");
  const lista = (await r.json()) as { ingredientes: { nome: string; unidadeExibicao: string; conversoes: { nome: string }[] }[] };
  const fuba = lista.ingredientes.find((i) => i.nome === "Fubá da tela");
  expect(fuba).toMatchObject({ unidadeExibicao: "kg" });
  expect(fuba!.conversoes.map((c) => c.nome).sort()).toEqual(["pacote 1 kg", "saco 5 kg"]);
});

test(".html com tabela é lido como dado; arquivo que não é planilha é recusado pelo conteúdo", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/importar?tipo=produtos");
  let alertas = 0;
  page.on("dialog", (d) => {
    alertas++;
    void d.dismiss();
  });
  await page.getByLabel("Arquivo da planilha").setInputFiles(arquivo("produtos-tabela.html"));
  await expect(resumo(page)).toHaveText("2 prontas.");
  await expect(linha(page, 3)).toContainText("Pão na chapa da tela");
  await expect(page.getByRole("button", { name: "Gravar 2 produtos" })).toBeEnabled();
  expect(alertas).toBe(0);
  // Uma imagem com nome de .csv: recusada pelo conteúdo, sem conferência.
  await page.getByLabel("Arquivo da planilha").setInputFiles({ name: "lista.csv", mimeType: "text/csv", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]) });
  await expect(page.getByTestId("erro-da-importacao")).toContainText("não é uma planilha");
  await expect(page.getByTestId("resultado-da-conferencia")).toHaveCount(0);
});

test("celular (390 px): a tela inteira, com o resultado, cabe sem rolar para o lado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/importar?tipo=produtos");
  await page.getByLabel("Arquivo da planilha").setInputFiles(arquivo("produtos-com-erros.csv"));
  // Os da primeira gravação agora já estão cadastrados.
  await expect(resumo(page)).toHaveText("0 prontas, 3 com erro, 3 já cadastradas.");
  await expect(page.locator(".barra__nav")).toBeVisible();
  await semEstouroDeLargura(page);
});
