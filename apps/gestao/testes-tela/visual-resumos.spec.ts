import { expect, test } from "@playwright/test";
import { entrar, semEstouroDeLargura } from "./ajudas";

// Padrão visual dos resumos (decisão 0012): ficha de dados, selos, chips, itens de lista.
// Fundo sempre claro, mesmo com o aparelho no modo escuro (pedido do responsável, 15/11/2026).

test.describe.configure({ mode: "serial" });

test.describe("fundo sempre claro", () => {
  test.use({ colorScheme: "dark", viewport: { width: 390, height: 844 } });

  test("com o aparelho no modo escuro, a entrada e a lista continuam com fundo claro", async ({
    page,
  }) => {
    await page.goto("/entrar");
    await expect(page.locator("body")).toBeVisible();
    const fundo = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // Espuma de Leite (#FDF8F0), o fundo claro da marca (decisão 0019).
    expect(await fundo()).toBe("rgb(253, 248, 240)");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      ),
    ).toBe("light only");
    // O aviso ao navegador do celular para não escurecer a página sozinho.
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute(
      "content",
      "only light",
    );
    expect(
      await page.evaluate(
        () => matchMedia("(prefers-color-scheme: dark)").matches,
      ),
    ).toBe(true);

    await entrar(page, "gerente.geral");
    await page.goto("/cadastros");
    await expect(page.getByTestId("ingrediente-Ovo")).toBeVisible();
    expect(await fundo()).toBe("rgb(253, 248, 240)");
    const cartao = await page
      .getByTestId("ingrediente-Ovo")
      .locator("article")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    // Leite Fresco (#FFFDF9), o cartão claro da marca.
    expect(cartao).toBe("rgb(255, 253, 249)");
  });
});

test.describe("resumos organizados", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("ingrediente vira cartão com rótulos, selo da área e chips; sem ponto do meio", async ({
    page,
  }) => {
    await entrar(page, "gerente.geral");
    await page.goto("/cadastros");
    const ovo = page.getByTestId("ingrediente-Ovo");
    await expect(
      ovo.getByRole("heading", { level: 2, name: "Ovo" }),
    ).toBeVisible();
    await expect(ovo.getByText("Ativo", { exact: true })).toBeVisible();
    await expect(ovo.locator("dt")).toHaveText([
      "Unidade do estoque",
      "Área",
      "Fornecedor",
    ]);
    await expect(ovo.locator("dd").first()).toContainText("Unidades (un)");
    await expect(ovo.locator(".erp-selo--cozinha")).toContainText(
      "Alimentos da cozinha",
    );
    await expect(ovo.getByRole("list", { name: "Embalagens" })).toContainText(
      "caixa = 30 un",
    );
    expect(await ovo.innerText()).not.toContain("·");
    // Ações viram linha inteira no celular, com alvo de toque grande.
    const editar = await ovo
      .getByRole("button", { name: "Editar Ovo" })
      .boundingBox();
    expect(editar!.height).toBeGreaterThanOrEqual(44);
    expect(editar!.width).toBeGreaterThan(300);
  });

  test("fornecedor completo para o gerente; a cozinheira vê só nome, prazo e situação", async ({
    page,
  }) => {
    await entrar(page, "gerente.geral");
    const r = await page.request.post("/api/cadastros/fornecedores", {
      data: {
        nome: "Distribuidora Aurora (tela)",
        documento: "11444777000161",
        contato: "Carlos",
        telefone: "(19) 3333-4444",
        email: "vendas@aurora.exemplo.com",
        endereco: "Rua das Flores, 120 - Centro - Campinas/SP",
        prazoEntregaDias: 2,
        observacao: "",
        ativo: true,
      },
    });
    expect(r.ok(), await r.text()).toBe(true);
    await page.goto("/cadastros/fornecedores");
    const cartao = page.getByTestId("fornecedor-Distribuidora Aurora (tela)");
    await expect(cartao.locator("dt")).toHaveText([
      "CPF/CNPJ",
      "Contato",
      "Telefone",
      "E-mail",
      "Prazo de entrega",
      "Endereço",
    ]);
    await expect(
      cartao.getByRole("link", { name: "(19) 3333-4444" }),
    ).toHaveAttribute("href", "tel:1933334444");
    await expect(
      cartao.getByRole("link", { name: "vendas@aurora.exemplo.com" }),
    ).toHaveAttribute("href", "mailto:vendas@aurora.exemplo.com");
    await expect(cartao).toContainText("2 dias");
    // Fornecedor da semente, sem telefone: o gerente vê "Não informado" (nunca texto solto).
    await expect(
      page
        .getByTestId("fornecedor-Atacado Exemplo (fictício)")
        .getByText("Não informado")
        .first(),
    ).toBeVisible();

    await page.context().clearCookies();
    await entrar(page, "cozinheira");
    await page.goto("/cadastros/fornecedores");
    const vista = page.getByTestId("fornecedor-Distribuidora Aurora (tela)");
    await expect(vista).toBeVisible();
    await expect(vista.locator("dt")).toHaveText(["Prazo de entrega"]);
    await expect(vista).not.toContainText("Não informado");
    await expect(vista).not.toContainText("CPF/CNPJ");
  });

  for (const [largura, altura] of [
    [390, 844],
    [768, 1024],
    [1280, 800],
  ] as const) {
    test(`sem estouro de largura em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await entrar(page, "gerente.geral");
      for (const caminho of [
        "/cadastros",
        "/cadastros/fornecedores",
        "/comunicados",
        "/minha-conta",
        "/turnos",
        "/auditoria",
      ]) {
        await page.goto(caminho);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await semEstouroDeLargura(page);
      }
    });
  }
});
