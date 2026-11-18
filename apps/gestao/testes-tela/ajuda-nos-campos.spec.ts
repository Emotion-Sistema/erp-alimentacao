import { expect, test, type Page } from "@playwright/test";
import { abrirAdicionar, entrar, semEstouroDeLargura, SENHA, zerarSegundoFator } from "./ajudas";

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
    await conferirAjuda(page, "editar ingrediente", 5);
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
