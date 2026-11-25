import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { abrirAdicionar, entrar, semEstouroDeLargura, SENHA, sql, zerarSegundoFator } from "./ajudas";

// Padrão do sistema (decisão 0012, 15/11/2026): todo campo de digitar ou escolher tem uma explicação
// sempre visível e um botão que abre e fecha um exemplo. Este teste FALHA se aparecer campo sem ajuda.

test.use({ viewport: { width: 390, height: 844 } });

let totalDeCampos = 0;

/** Confere todo input, select e textarea visível da página: explicação ligada por aria-describedby e botão de exemplo. */
async function conferirAjuda(page: Page, tela: string, minimo = 1) {
  const resultado = await page.evaluate(() => {
    const problemas: string[] = [];
    let conferidos = 0;
    const campos = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"));
    for (const c of campos) {
      if (c instanceof HTMLInputElement && c.type === "hidden") continue;
      const visivel = c.getClientRects().length > 0 && getComputedStyle(c).visibility !== "hidden";
      if (!visivel) continue;
      conferidos++;
      const nome = c.getAttribute("id") ?? c.getAttribute("name") ?? c.tagName;
      const rotulo = (c.labels?.[0]?.textContent ?? "").trim() || nome;
      const ids = (c.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      const textos = ids.map((i) => document.getElementById(i)?.textContent?.trim() ?? "");
      if (ids.length === 0 || !textos.some((t) => t.length > 0)) {
        problemas.push(`"${rotulo}": sem explicação ligada por aria-describedby`);
        continue;
      }
      const bloco = c.closest("[data-campo-ajuda]");
      const botao = bloco?.querySelector<HTMLButtonElement>("button[aria-controls][aria-expanded]");
      const exemplo = botao ? document.getElementById(botao.getAttribute("aria-controls") ?? "") : null;
      if (!botao || !exemplo || !(exemplo.textContent ?? "").trim()) problemas.push(`"${rotulo}": sem botão de exemplo ou exemplo vazio`);
    }
    return { conferidos, problemas };
  });
  expect(resultado.problemas, `Campos sem ajuda na tela ${tela}`).toEqual([]);
  expect(resultado.conferidos, `A tela ${tela} deveria ter campos`).toBeGreaterThanOrEqual(minimo);
  totalDeCampos += resultado.conferidos;
}

test("entrada (login) tem ajuda em todos os campos", async ({ page }) => {
  await page.goto("/entrar");
  await expect(page.getByLabel("Usuário")).toBeVisible();
  await conferirAjuda(page, "entrar", 2);
  await semEstouroDeLargura(page);
});

test("segundo fator tem ajuda no campo do código", async ({ page }) => {
  zerarSegundoFator("administrador");
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill("administrador");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/segundo-fator");
  await expect(page.getByLabel("Código do aplicativo autenticador")).toBeVisible();
  await conferirAjuda(page, "segundo-fator");
});

test.describe("telas internas do administrador", () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, "administrador", true);
  });

  test("cadastros: ingredientes e conversões", async ({ page }) => {
    await page.goto("/cadastros");
    await expect(page.getByTestId("ingrediente-Ovo")).toBeVisible();
    await conferirAjuda(page, "ingredientes (busca e filtro)", 2);
    await abrirAdicionar(page, "Comum");
    await conferirAjuda(page, "novo ingrediente", 6);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Editar Ovo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Editar Ovo" })).toBeVisible();
    // Os 5 campos do ingrediente e os 10 alergênicos da lista inicial (S1).
    await expect(page.getByTestId("alergenicos-do-ingrediente").getByRole("combobox", { name: "Glúten" })).toBeVisible();
    await conferirAjuda(page, "editar ingrediente", 15);
    await page.getByRole("button", { name: /^Mostrar Embalagens/ }).click();
    await page.getByRole("button", { name: "Escolher do catálogo" }).click();
    await page.getByRole("checkbox", { name: "Saco 25 kg" }).check();
    await expect(page.getByLabel("Quantas unidades (un) vêm em 1 saco 25 kg?")).toBeVisible();
    await conferirAjuda(page, "embalagens do ingrediente (escolher do catálogo)", 9);
    await page.getByRole("button", { name: "Criar nova embalagem" }).click();
    await expect(page.getByRole("dialog", { name: "Nova embalagem" })).toBeVisible();
    await conferirAjuda(page, "painel de nova embalagem", 10);
    await page.getByRole("button", { name: "Cancelar" }).last().click();
    await semEstouroDeLargura(page);
  });

  test("cadastros: cadastro rápido (catálogo, ajuste, lista colada) e embalagem de um toque", async ({ page }) => {
    await page.goto("/cadastros");
    await expect(page.getByTestId("ingrediente-Ovo")).toBeVisible();
    await abrirAdicionar(page, "Rápido");
    // Os corredores começam fechados: a busca abre o que tem resultado.
    await expect(page.getByRole("button", { name: "Hortifrúti", exact: true })).toHaveAttribute("aria-expanded", "false");
    await page.getByLabel("Procurar no catálogo").fill("tomate");
    await expect(page.getByRole("checkbox", { name: "Tomate", exact: true })).toBeVisible();
    await conferirAjuda(page, "cadastro rápido: catálogo", 4);
    await page.getByRole("checkbox", { name: "Tomate", exact: true }).check();
    await page.getByRole("button", { name: "Ajustar Tomate" }).click();
    await page.getByTestId("catalogo-Tomate").getByRole("button", { name: /^Mostrar Embalagens/ }).click();
    await page.getByTestId("catalogo-Tomate").getByRole("button", { name: "Escolher do catálogo" }).click();
    await conferirAjuda(page, "cadastro rápido: ajuste de um item", 10);
    await page.getByRole("tab", { name: "Colar uma lista" }).click();
    await conferirAjuda(page, "cadastro rápido: colar uma lista", 1);
    await page.getByLabel("Cole sua lista de ingredientes").fill("Alface\nSal - pacote");
    await page.getByRole("button", { name: "Ler a lista" }).click();
    await expect(page.getByTestId("linhas-lidas")).toBeVisible();
    await conferirAjuda(page, "cadastro rápido: prévia da lista", 8);
    await semEstouroDeLargura(page);
  });

  test("cadastros: formulário com sugestão do catálogo e salvar e próximo", async ({ page }) => {
    await page.goto("/cadastros");
    await abrirAdicionar(page, "Comum");
    await page.getByRole("combobox", { name: "Nome" }).pressSequentially("calabr");
    await expect(page.getByRole("option", { name: /Calabresa/ })).toBeVisible();
    await conferirAjuda(page, "novo ingrediente com sugestão aberta", 6);
    await page.getByRole("option", { name: /Calabresa/ }).click();
    await page.getByRole("button", { name: /^Mostrar Embalagens/ }).click();
    await page.getByRole("button", { name: "Escolher do catálogo" }).click();
    await conferirAjuda(page, "novo ingrediente com embalagem sugerida", 8);
  });

  test("cadastros: importar planilha (arquivo, mapa de colunas e resultado)", async ({ page }) => {
    await page.goto("/cadastros/importar?tipo=produtos");
    await expect(page.getByLabel("Arquivo da planilha")).toBeVisible();
    await conferirAjuda(page, "importar planilha (antes do arquivo)", 3);
    await page.getByLabel("Arquivo da planilha").setInputFiles(join(import.meta.dirname, "arquivos", "produtos-com-erros.csv"));
    await expect(page.getByTestId("resumo-da-conferencia")).toBeVisible();
    await conferirAjuda(page, "importar planilha (mapa de colunas e resultado)", 15);
    await semEstouroDeLargura(page);
    // Corrigir no painel (ideia nº 13): um campo por coluna, todos com ajuda.
    await page.getByRole("button", { name: "Corrigir aqui a linha 4" }).click();
    await expect(page.getByTestId("corrigindo-4")).toBeVisible();
    await conferirAjuda(page, "importar planilha (corrigir no painel)", 21);
    await semEstouroDeLargura(page);
  });

  test("cadastros: aba Embalagens e o painel de editar", async ({ page }) => {
    await page.goto("/cadastros/embalagens");
    await expect(page.getByTestId("contagem-do-catalogo")).toContainText("no catálogo");
    await conferirAjuda(page, "embalagens (busca)", 1);
    // No celular os corredores começam fechados; a busca abre os que têm resultado.
    await page.getByLabel("Procurar embalagem").fill("saco 25");
    await page.getByRole("button", { name: "Editar Saco 25 kg" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await conferirAjuda(page, "editar embalagem", 4);
    await semEstouroDeLargura(page);
  });

  test("cadastros: horários de venda (grades e janelas) e categorias", async ({ page }) => {
    await page.goto("/cadastros/horarios");
    await expect(page.getByTestId("semana-da-loja")).toBeVisible();
    await conferirAjuda(page, "horários de venda (semana e canal)", 18);
    await page.getByTestId("canais").getByRole("group", { name: "Sexta" }).getByRole("radio", { name: "Horário próprio" }).check();
    await conferirAjuda(page, "horários de venda (canal com horário próprio)", 20);
    await page.getByRole("button", { name: "Desfazer mudanças" }).click();
    await page.getByRole("button", { name: "Nova data especial" }).click();
    const data = page.getByRole("dialog", { name: "Nova data especial" });
    await data.getByRole("radio", { name: "Horário diferente" }).check();
    await conferirAjuda(page, "nova data especial (loja inteira)", 5);
    await data.getByRole("radio", { name: "Uma categoria num canal" }).check();
    await conferirAjuda(page, "nova data especial (categoria)", 6);
    await data.getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: "Descartar" }).click();
    await page.getByRole("button", { name: "Pausar agora" }).click();
    await page.getByRole("dialog", { name: "Pausar agora" }).getByRole("radio", { name: "Uma categoria num canal" }).check();
    await conferirAjuda(page, "pausar agora", 3);
    await page.getByRole("dialog", { name: "Pausar agora" }).getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: "Descartar" }).click();
    await semEstouroDeLargura(page);

    await page.goto("/cadastros/categorias");
    await page.getByRole("button", { name: "Horário de Almoço", exact: true }).click();
    await conferirAjuda(page, "categorias (horário da categoria)", 7);
    await page.getByRole("button", { name: "Nova categoria" }).click();
    await conferirAjuda(page, "nova categoria", 3);
    await semEstouroDeLargura(page);
  });

  test("cadastros: produtos (janela com tipo de produção)", async ({ page }) => {
    await page.goto("/cadastros/produtos");
    await page.getByRole("button", { name: "Novo produto" }).click();
    const janela = page.getByRole("dialog", { name: "Novo produto" });
    await janela.getByLabel("Categoria", { exact: true }).selectOption({ label: "Hambúrgueres" });
    await janela.getByLabel("Passa pela produção?").selectOption({ label: "Hambúrgueres (Cozinha)" });
    // Nome, categoria, preço, tipo, tempo, descrição e posição na categoria.
    await conferirAjuda(page, "novo produto", 7);
    await semEstouroDeLargura(page);
  });

  test("cadastros: adicionais (janela do grupo) e produto com tamanhos e grupos", async ({ page }) => {
    await page.goto("/cadastros/adicionais");
    await page.getByRole("button", { name: "Novo grupo" }).click();
    const janela = page.getByRole("dialog", { name: "Novo grupo de adicionais" });
    await janela.getByLabel("Escolha obrigatória?").check();
    await janela.getByRole("button", { name: "Adicionar item" }).click();
    await janela.getByLabel("Algum item tem preço diferente no delivery").check();
    // Nome, obrigatória, mínimo, máximo, item (nome, preço, delivery, vezes) e a caixa do delivery.
    await conferirAjuda(page, "novo grupo de adicionais", 9);
    await semEstouroDeLargura(page);
    await page.goto("/cadastros/produtos");
    await page.getByRole("button", { name: "Novo produto" }).click();
    const produto = page.getByRole("dialog", { name: "Novo produto" });
    await produto.getByLabel("Mesmo preço da loja").uncheck();
    await produto.getByRole("button", { name: "Adicionar tamanho" }).click();
    // Nome, categoria, preço, mesmo preço, preço no delivery, tamanho (nome, acréscimo, delivery), grupo, tipo, descrição.
    await conferirAjuda(page, "novo produto com tamanhos", 11);
  });

  test("cadastros: fichas técnicas (filtros, editor e custos)", async ({ page }) => {
    await page.goto("/cadastros/fichas");
    await expect(page.getByLabel("Procurar ficha")).toBeVisible();
    // Busca, tipo e situação.
    await conferirAjuda(page, "fichas (filtros)", 3);
    await page.getByRole("button", { name: "Nova ficha" }).click();
    const janela = page.getByRole("dialog", { name: "Nova ficha técnica" });
    await janela.getByLabel("Tipo da ficha").selectOption("preparo");
    await janela.getByLabel("Procurar ingrediente ou preparo").fill("a");
    await janela.getByTestId("achados").getByRole("button").first().click();
    await janela.getByRole("button", { name: "Anotar pendência" }).click();
    await janela.getByRole("button", { name: "Adicionar etapa" }).click();
    await janela.getByRole("button", { name: "Adicionar equipamento" }).click();
    // Tipo, unidade do preparo, nome, rende e unidade, porção e unidade, tempo, validade, procurar,
    // item (quantidade, medida, opcional), pendência, etapa e minutos, equipamento, observações.
    await conferirAjuda(page, "nova ficha (preparo com item, pendência, etapa e equipamento)", 15);
    await semEstouroDeLargura(page);
    await janela.getByRole("button", { name: "Fechar" }).click();
    await page.getByRole("button", { name: "Descartar" }).click();
    await page.getByRole("tab", { name: "Custos" }).click();
    await page.getByRole("button", { name: /^Editar o preço de / }).first().click();
    // Limite do alerta, preço, quantidade e unidade.
    await conferirAjuda(page, "fichas (custos)", 4);
    await page.getByRole("tab", { name: /^Alergênicos/ }).click();
    await page.getByRole("button", { name: /^Editar / }).first().click();
    // Novo alergênico (nome e descrição) e a edição de um (nome e descrição).
    await conferirAjuda(page, "fichas (alergênicos)", 4);
    await page.getByRole("button", { name: "Importar fichas" }).click();
    await expect(page.getByRole("dialog", { name: "Importar fichas de uma planilha" })).toBeVisible();
    // Arquivo e as duas escolhas (criar ingredientes, gravar as boas).
    await conferirAjuda(page, "importar fichas", 3);
  });

  test("cadastros: produto combo (partes e opções)", async ({ page }) => {
    await page.goto("/cadastros/produtos");
    await page.getByRole("button", { name: "Novo produto" }).click();
    const produto = page.getByRole("dialog", { name: "Novo produto" });
    await produto.getByLabel("É um combo?").check();
    await produto.getByLabel("Produto da opção 1 da parte 1", { exact: true }).selectOption({ label: "Porção de batata frita" });
    await expect(produto.getByLabel("Tamanho da opção 1 da parte 1", { exact: true })).toBeVisible();
    // Nome, categoria, preço, mesmo preço, é combo, nome da parte, produto, tamanho, acréscimo,
    // acréscimo diferente no delivery, grupo para adicionar e descrição.
    await conferirAjuda(page, "novo produto combo", 12);
    await semEstouroDeLargura(page);
  });

  test("cadastros: fornecedores", async ({ page }) => {
    await page.goto("/cadastros/fornecedores");
    await page.getByRole("button", { name: "Novo fornecedor" }).click();
    await conferirAjuda(page, "novo fornecedor", 8);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: /^Editar / }).first().click();
    await conferirAjuda(page, "editar fornecedor", 8);
    await semEstouroDeLargura(page);
  });

  test("funcionários", async ({ page }) => {
    await page.goto("/funcionarios");
    await expect(page.getByRole("table", { name: "Funcionários" })).toBeVisible();
    await conferirAjuda(page, "funcionários (novo)", 4);
    const gerenciar = page.locator("details.acoes > summary");
    for (let i = 0; i < (await gerenciar.count()); i++) await gerenciar.nth(i).click();
    await conferirAjuda(page, "funcionários (gerenciar)", 6);
  });

  test("turnos, comunicados, estações, minha conta e auditoria", async ({ page }) => {
    for (const [url, minimo] of [
      ["/turnos", 1],
      ["/comunicados", 14],
      ["/estacoes", 1],
      ["/minha-conta", 1],
      ["/auditoria", 4],
    ] as const) {
      await page.goto(url);
      await expect(page.getByRole("button", { name: /todos os exemplos/ })).toBeVisible();
      // Os campos de algumas telas chegam depois da resposta da API: espera a rede ficar quieta.
      await page.waitForLoadState("networkidle");
      await conferirAjuda(page, url, minimo);
    }
  });

  test("Clube E-MOTION: as quatro abas e as janelas", async ({ page }) => {
    await page.goto("/clube");
    await expect(page.getByTestId("aba-desconto")).toBeVisible();
    // "Só nas categorias escolhidas" mostra as caixas das categorias.
    await page.getByLabel("Só nas categorias escolhidas").check();
    await page.getByTestId("desconto-dia-2").getByLabel("Só das ... às ...").check();
    await conferirAjuda(page, "clube (desconto)", 12);
    await page.getByRole("tab", { name: "Pontos e prêmios" }).click();
    await conferirAjuda(page, "clube (pontos)", 1);
    await page.getByRole("button", { name: "Adicionar prêmio" }).click();
    await conferirAjuda(page, "clube (novo prêmio)", 4);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("tab", { name: "Presentes" }).click();
    await conferirAjuda(page, "clube (presentes)", 15);
    await page.getByRole("tab", { name: "Campanhas" }).click();
    await conferirAjuda(page, "clube (campanhas)", 1);
    await page.getByRole("button", { name: "Agendar campanha" }).click();
    await conferirAjuda(page, "clube (agendar campanha)", 4);
  });

  test("exemplo abre e fecha, 'todos' vale para a tela e a escolha sobrevive ao recarregar", async ({ page }) => {
    await page.goto("/turnos");
    const campo = page.getByLabel("Minutos (0 a 120)");
    const botao = page.getByRole("button", { name: /^Ver exemplo/ });
    const exemplo = page.locator("p.ajuda__exemplo");
    await expect(exemplo).toBeHidden();
    await expect(botao).toHaveAttribute("aria-expanded", "false");
    // Alvo de toque grande.
    expect((await botao.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await botao.click();
    await expect(exemplo).toBeVisible();
    await expect(exemplo).toContainText("30 =");
    await expect(page.getByRole("button", { name: /^Esconder exemplo/ })).toHaveAttribute("aria-expanded", "true");
    await expect(campo).toHaveAttribute("aria-describedby", /exemplo/);
    await page.getByRole("button", { name: /^Esconder exemplo/ }).click();
    await expect(exemplo).toBeHidden();

    // "Mostrar todos" abre tudo e a escolha fica guardada no aparelho.
    await page.getByRole("button", { name: "Mostrar todos os exemplos" }).click();
    await expect(exemplo).toBeVisible();
    await expect(page.getByRole("button", { name: "Esconder todos os exemplos" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Esconder todos os exemplos" })).toBeVisible();
    await expect(exemplo).toBeVisible();

    // Um toque individual continua possível depois do "todos".
    await page.getByRole("button", { name: /^Esconder exemplo/ }).click();
    await expect(exemplo).toBeHidden();

    // "Esconder todos" fecha tudo e também fica guardado.
    await page.getByRole("button", { name: "Esconder todos os exemplos" }).click();
    await expect(exemplo).toBeHidden();
    await page.reload();
    await expect(page.getByRole("button", { name: "Mostrar todos os exemplos" })).toBeVisible();
    await expect(exemplo).toBeHidden();
    await semEstouroDeLargura(page);
  });

  test("a escolha também vale em outra tela do mesmo aparelho", async ({ page }) => {
    await page.goto("/turnos");
    await page.getByRole("button", { name: "Mostrar todos os exemplos" }).click();
    await page.goto("/comunicados");
    await expect(page.getByRole("button", { name: "Esconder todos os exemplos" })).toBeVisible();
    await expect(page.locator("p.ajuda__exemplo:visible").first()).toBeVisible();
    await page.getByRole("button", { name: "Esconder todos os exemplos" }).click();
  });
});

// Estoque (E09, decisão 0027): painel, detalhe do item, contagem, compras, saldo inicial e relatórios.
// Em ordem: a entrada de mercadoria cria os dois lotes que o detalhe e a correção de custo usam.
test.describe("telas do estoque (gerente geral)", () => {
  test.describe.configure({ mode: "serial" });
  const SUFIXO = Math.random().toString(36).slice(2, 9).replace(/[0-9]/g, (c) => "qrstuvwxyz"[Number(c)]!);
  const ITEM = `Cebola ajuda ${SUFIXO}`;
  const diaDaqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

  test.beforeAll(() => {
    sql(`INSERT INTO ingrediente (nome, unidade_base, unidade_exibicao, area_estoque) VALUES ('${ITEM}', 'g', 'kg', 'cozinha')`);
  });

  test.beforeEach(async ({ page }) => {
    await entrar(page, "gerente.geral");
  });

  test("compras: entrada de mercadoria (dois itens), lista e correção de custo", async ({ page }) => {
    await page.goto("/estoque/compras");
    const form = page.getByTestId("form-entrada");
    await expect(form.getByLabel("Fornecedor")).toBeVisible();
    // Fornecedor, número, data e os 8 campos do item (com valor, pois o gerente vê custos).
    await conferirAjuda(page, "compras (dar entrada)", 11);
    await page.getByRole("button", { name: "Adicionar outro item" }).click();
    await expect(page.getByTestId("linha-da-entrada-2")).toBeVisible();
    await conferirAjuda(page, "compras (dar entrada, dois itens)", 19);
    // Dois lotes do mesmo item, com validades diferentes: o detalhe passa a pedir o lote.
    for (const [n, validade] of [[1, diaDaqui(30)], [2, diaDaqui(60)]] as const) {
      const linha = page.getByTestId(`linha-da-entrada-${n}`);
      await linha.getByLabel("Ingrediente").selectOption({ label: ITEM });
      await linha.getByLabel("Quantidade").fill("1");
      await linha.getByLabel("Validade").fill(validade);
      await linha.getByLabel("Valor pago (R$)").fill("8,00");
    }
    await page.getByRole("button", { name: "Dar entrada em 2 itens" }).click();
    await expect(page.getByTestId("entrada-gravada")).toBeVisible();
    await conferirAjuda(page, "compras (foto da nota)", 1);
    await semEstouroDeLargura(page);

    await page.getByRole("tab", { name: "Entradas" }).click();
    const entrada = page.getByTestId("lista-de-entradas").locator("li.est-linha", { hasText: ITEM }).first();
    await expect(entrada).toBeVisible();
    await conferirAjuda(page, "compras (lista de entradas)", 1);
    await entrada.getByRole("button", { name: "Anexar foto da nota" }).click();
    await entrada.getByRole("button", { name: "Corrigir o custo" }).click();
    await expect(entrada.getByLabel(`Valor certo de ${ITEM} (R$)`).first()).toBeVisible();
    await conferirAjuda(page, "compras (foto e correção de custo)", 3);
    await semEstouroDeLargura(page);
  });

  test("compras: saldo inicial por planilha (arquivo, conferência e corrigir no painel)", async ({ page }) => {
    await page.goto("/estoque/compras");
    await page.getByRole("tab", { name: "Saldo inicial" }).click();
    await expect(page.getByLabel("Arquivo da planilha")).toBeVisible();
    await conferirAjuda(page, "saldo inicial (antes do arquivo)", 1);
    // Planilha inventada: uma linha boa e uma com item que não existe (vira erro para corrigir).
    const csv = `Item;Quantidade;Unidade;Local\n${ITEM};2;kg;Guardado\nItem que nao existe ${SUFIXO};1;kg;Guardado\n`;
    await page.getByLabel("Arquivo da planilha").setInputFiles({ name: "saldo-inicial.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await expect(page.getByTestId("resumo-do-saldo")).toBeVisible();
    await conferirAjuda(page, "saldo inicial (conferência)", 2);
    await page.getByRole("button", { name: "Corrigir aqui a linha 3" }).click();
    await expect(page.getByTestId("corrigindo-3")).toBeVisible();
    await conferirAjuda(page, "saldo inicial (corrigir no painel)", 6);
    await semEstouroDeLargura(page);
  });

  test("painel da cozinha: itens e detalhe (mudar de lugar, perda, bloqueio, desbloqueio, desfazer)", async ({ page }) => {
    await page.goto("/estoque");
    await expect(page.getByLabel("Buscar item")).toBeVisible();
    await conferirAjuda(page, "estoque (painel)", 2);
    await page.getByLabel("Buscar item").fill(ITEM);
    await page.getByRole("button", { name: `Abrir ${ITEM}` }).click();
    const detalhe = page.getByTestId("detalhe-do-item");
    await expect(detalhe.getByTestId("lotes")).toBeVisible();

    await detalhe.getByRole("button", { name: "Mudar de lugar" }).click();
    const mover = detalhe.getByTestId("form-transferencia");
    // A janela abre sobre o painel (busca e "vence logo" contam). Na janela: sai de, vai para, fica em,
    // quantidade, unidade, lote (dois lotes no guardado) e observação.
    await expect(mover.getByLabel("Lote")).toBeVisible();
    await conferirAjuda(page, "estoque (mudar de lugar)", 9);
    await mover.getByLabel("Vai para").selectOption("cafeteria");
    await expect(mover.getByLabel("Quem recebe")).toBeVisible();
    await conferirAjuda(page, "estoque (mudar de lugar para outra área)", 10);
    await semEstouroDeLargura(page);

    await detalhe.getByRole("button", { name: "Perda", exact: true }).click();
    await expect(detalhe.getByTestId("form-perda")).toBeVisible();
    await conferirAjuda(page, "estoque (perda)", 8);
    await detalhe.getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(detalhe.getByTestId("form-bloqueio")).toBeVisible();
    await conferirAjuda(page, "estoque (bloquear)", 7);
    // Grava um bloqueio pequeno para ter o que desbloquear e o que desfazer.
    const bloqueio = detalhe.getByTestId("form-bloqueio");
    await bloqueio.getByLabel("Onde está").selectOption("guardado");
    await bloqueio.getByLabel("Quantidade").fill("100");
    await bloqueio.getByLabel("Unidade").selectOption("g");
    await bloqueio.getByRole("button", { name: "Gravar" }).click();
    await expect(detalhe.getByTestId("lancamento-feito")).toBeVisible();
    await detalhe.getByRole("button", { name: "Desbloquear", exact: true }).click();
    await expect(detalhe.getByTestId("form-desbloqueio")).toBeVisible();
    await conferirAjuda(page, "estoque (desbloquear)", 6);
    await detalhe.getByRole("button", { name: "Desbloquear", exact: true }).click();
    await detalhe.getByTestId("historico").getByRole("button", { name: /^Desfazer/ }).first().click();
    await expect(detalhe.getByTestId("form-desfazer")).toBeVisible();
    await conferirAjuda(page, "estoque (desfazer)", 3);
    await semEstouroDeLargura(page);
  });

  test("painel do salão: a receber (confirmar e recusar)", async ({ page }) => {
    // O gerente manda 100 g para a Cafeteria, com o supervisor como quem recebe. Quem mandou nunca
    // confirma nem recusa o próprio envio: o gerente vê o aviso, e o supervisor (outra pessoa) é quem
    // confirma ou recusa.
    await page.goto("/estoque");
    await page.getByLabel("Buscar item").fill(ITEM);
    await page.getByRole("button", { name: `Abrir ${ITEM}` }).click();
    const detalhe = page.getByTestId("detalhe-do-item");
    await detalhe.getByRole("button", { name: "Mudar de lugar" }).click();
    const mover = detalhe.getByTestId("form-transferencia");
    await mover.getByLabel("Vai para").selectOption("cafeteria");
    await mover.getByLabel("Quantidade").fill("100");
    await mover.getByLabel("Unidade").selectOption("g");
    await mover.getByLabel("Quem recebe").selectOption({ label: "Teste supervisor" });
    await mover.getByRole("button", { name: "Gravar" }).click();
    await expect(detalhe.getByTestId("lancamento-feito")).toHaveText("Fica a receber na Cafeteria até Teste supervisor confirmar.");

    await page.goto("/estoque/salao");
    const doGerente = page.getByTestId("a-receber").getByTestId(`receber-${ITEM}`);
    await expect(doGerente).toContainText("Você mandou: outra pessoa confirma ou recusa.");
    await expect(doGerente.getByRole("button", { name: `Confirmar ${ITEM}` })).toHaveCount(0);
    await expect(doGerente.getByRole("button", { name: `Recusar ${ITEM}` })).toHaveCount(0);

    await page.context().clearCookies();
    await entrar(page, "supervisor");
    await page.goto("/estoque/salao");
    const linha = page.getByTestId("a-receber").getByTestId(`receber-${ITEM}`);
    await linha.getByRole("button", { name: `Confirmar ${ITEM}` }).click();
    await expect(linha.getByLabel("Onde fica")).toBeVisible();
    // Busca, área e "vence logo" do painel, mais o "Onde fica".
    await conferirAjuda(page, "salão (confirmar recebimento)", 4);
    await linha.getByRole("button", { name: `Recusar ${ITEM}` }).click();
    await expect(linha.getByLabel("Por que recusar")).toBeVisible();
    await conferirAjuda(page, "salão (recusar recebimento)", 4);
    await semEstouroDeLargura(page);
    // Recusa: volta para a cozinha (o resto dos testes conta só a cozinha).
    await linha.getByLabel("Por que recusar").fill("Teste da ajuda nos campos");
    await linha.getByRole("button", { name: "Recusar e devolver" }).click();
    await expect(page.getByTestId("recebimento-feito")).toHaveText(`Recusado: ${ITEM} voltou para Alimentos da cozinha.`);
  });

  test("painel da cozinha: dar entrada e contagem (escolher, contar e cancelar)", async ({ page }) => {
    await page.goto("/estoque");
    await page.getByRole("tab", { name: "Dar entrada" }).click();
    await expect(page.getByTestId("form-entrada")).toBeVisible();
    await conferirAjuda(page, "estoque (dar entrada)", 11);

    await page.getByRole("tab", { name: "Contagem" }).click();
    await page.getByLabel("Buscar item para contar").fill(ITEM);
    await expect(page.getByRole("checkbox", { name: ITEM })).toBeVisible();
    await conferirAjuda(page, "estoque (contagem: escolher itens)", 3);
    await page.getByRole("checkbox", { name: ITEM }).check();
    await page.getByRole("button", { name: "Começar a contar 1 item" }).click();
    const tela = page.getByTestId("tela-de-contar");
    await expect(tela.getByTestId("situacao-da-contagem")).toHaveText("Aberta");
    await conferirAjuda(page, "estoque (contar)", 4);
    await tela.getByRole("button", { name: "Cancelar a contagem" }).click();
    await conferirAjuda(page, "estoque (cancelar a contagem)", 5);
    await semEstouroDeLargura(page);
    // Fecha sem acertar nada: o item não fica em contagem.
    await tela.getByLabel("Por que cancelar").fill("Teste da ajuda nos campos");
    await tela.locator("form").getByRole("button", { name: "Cancelar a contagem" }).click();
    await expect(tela.getByTestId("situacao-da-contagem")).toHaveText("Cancelada");
  });

  test("painel do salão: itens (com área), dar entrada e contagem", async ({ page }) => {
    await page.goto("/estoque/salao");
    await expect(page.getByLabel("Buscar item")).toBeVisible();
    // Busca, área (o salão tem três) e "só o que vence logo".
    await conferirAjuda(page, "salão (painel)", 3);
    await page.getByRole("tab", { name: "Dar entrada" }).click();
    await expect(page.getByTestId("form-entrada")).toBeVisible();
    await conferirAjuda(page, "salão (dar entrada)", 11);
    await page.getByRole("tab", { name: "Contagem" }).click();
    await expect(page.getByLabel("Buscar item para contar")).toBeVisible();
    await conferirAjuda(page, "salão (contagem)", 4);
    await semEstouroDeLargura(page);
  });

  test("custos: relatórios (período e área)", async ({ page }) => {
    await page.goto("/estoque/custos");
    await expect(page.getByTestId("relatorio-valor")).toBeVisible();
    await conferirAjuda(page, "custos (relatórios)", 3);
    await semEstouroDeLargura(page);
  });
});

test("sem armazenamento no aparelho, a ajuda funciona (só não lembra a escolha)", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("armazenamento bloqueado");
      },
    });
  });
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Mostrar todos os exemplos" }).click();
  await expect(page.getByRole("button", { name: "Esconder todos os exemplos" })).toBeVisible();
  await expect(page.locator("p.ajuda__exemplo:visible")).toHaveCount(2);
  await conferirAjuda(page, "entrar sem armazenamento", 2);
});

test.afterAll(() => {
  console.log(`Campos com ajuda conferidos: ${totalDeCampos}`);
});
