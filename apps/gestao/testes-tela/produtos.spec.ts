import { expect, test } from "@playwright/test";
import {
  avisoNaTela,
  entrar,
  janelaNoCentro,
  janelaSemEstouro,
  semEstouroDeLargura,
} from "./ajudas";

// Produtos (E07 parte 2, decisão 0018): lista por categoria, novo produto com preço em reais,
// produto sem tipo (sem tempo), posição na categoria com a prévia, editar o preço, desativar com
// "Desfazer" e o supervisor só lendo. Só dados fictícios (a semente cria um cardápio inventado).

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const SUFIXO = Math.random().toString(36).slice(2, 7);
const BURGER = `Burger tela ${SUFIXO}`;
const SUCO = `Suco tela ${SUFIXO}`;

/** Quantos produtos com esse nome o servidor tem (para conferir que nada foi gravado). */
async function quantosComNome(
  page: import("@playwright/test").Page,
  nome: string,
) {
  const r = await page.request.get("/api/cadastros/produtos");
  expect(r.ok()).toBe(true);
  return ((await r.json()) as { nome: string }[]).filter((p) => p.nome === nome)
    .length;
}

test("gerente vê os produtos por categoria, cria, edita o preço, desativa e desfaz", async ({
  page,
}) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  await expect(
    page.getByRole("heading", { name: "Produtos", level: 1 }),
  ).toBeVisible();

  // Os da semente, agrupados por categoria na ordem do cardápio.
  // A lista chega depois da página (busca no servidor): espera os grupos aparecerem antes de ler.
  // allTextContents() não espera; lido cedo demais, voltava vazio (falha no CI de 18/11/2026).
  await expect
    .poll(async () =>
      (await page.locator(".hor-secao h2").allTextContents()).slice(0, 6),
    )
    .toEqual([
      "Cafeteria",
      "Almoço",
      "Porções",
      "Hambúrgueres",
      "Salgados",
      "Bebidas",
    ]);
  const hamburgueres = page.getByTestId("categoria-Hambúrgueres");
  const bebidas = page.getByTestId("categoria-Bebidas");
  const xSalada = hamburgueres.getByTestId("produto-X-Salada");
  await expect(xSalada).toContainText("1º na categoria");
  await expect(xSalada.getByTestId("preco-do-produto")).toHaveText("R$ 25,90");
  await expect(xSalada.getByTestId("producao-do-produto")).toContainText(
    "Hambúrgueres (Cozinha)",
  );
  await expect(xSalada.getByTestId("producao-do-produto")).toContainText(
    "12 min",
  );
  await expect(
    bebidas
      .getByTestId("produto-Refrigerante lata")
      .getByTestId("producao-do-produto"),
  ).toHaveText("Não passa pela produção");

  // Novo produto: a categoria é escolhida na lista do que existe e a posição mostra os dela.
  await page.getByRole("button", { name: "Novo produto" }).click();
  const janela = page.getByRole("dialog", { name: "Novo produto" });
  await janelaNoCentro(page, janela);
  await expect(
    janela.getByText(
      "Aparece no site. Uma frase curta sobre o produto, até 300 letras.",
    ),
  ).toBeVisible();
  await expect(janela.getByTestId("posicao-na-lista")).toHaveCount(0);
  await janela.getByLabel("Nome").fill(BURGER);
  await janela
    .getByLabel("Categoria", { exact: true })
    .selectOption({ label: "Hambúrgueres" });
  const previa = janela.getByRole("list", { name: "Como a lista vai ficar:" });
  await expect(previa).toContainText("X-Salada");
  await expect(previa).toContainText("X-Bacon");
  await expect(
    janela.getByLabel("Posição na categoria").locator("option:checked"),
  ).toContainText("(no fim)");
  await expect(previa.locator("li").last()).toContainText(`${BURGER} ← este`);
  await janela.getByLabel("Posição na categoria").selectOption({ index: 0 });
  await expect(previa.locator("li").first()).toContainText(`${BURGER} ← este`);

  // Trocar a categoria troca a lista da posição e volta para "no fim".
  await janela
    .getByLabel("Categoria", { exact: true })
    .selectOption({ label: "Porções" });
  await expect(previa).toContainText("Porção de batata frita");
  await expect(previa).not.toContainText("X-Salada");
  await expect(
    janela.getByLabel("Posição na categoria").locator("option:checked"),
  ).toContainText("(no fim)");
  await expect(previa.locator("li").last()).toContainText(`${BURGER} ← este`);
  await janela
    .getByLabel("Categoria", { exact: true })
    .selectOption({ label: "Hambúrgueres" });
  await expect(previa).toContainText("X-Salada");
  await janela.getByLabel("Posição na categoria").selectOption({ index: 0 });
  await expect(previa.locator("li").first()).toContainText(`${BURGER} ← este`);

  // O tempo de preparo só aparece quando o produto passa pela produção.
  const tempo = janela.getByLabel("Tempo de preparo (minutos)");
  await expect(tempo).toHaveCount(0);
  await janela
    .getByLabel("Passa pela produção?")
    .selectOption({ label: "Hambúrgueres (Cozinha)" });
  await expect(tempo).toBeVisible();
  await janela
    .getByLabel("Passa pela produção?")
    .selectOption({
      label: "Não passa pela produção (ex.: bebida da geladeira)",
    });
  await expect(tempo).toHaveCount(0);
  await janela
    .getByLabel("Passa pela produção?")
    .selectOption({ label: "Hambúrgueres (Cozinha)" });
  await tempo.fill("10");

  // Preço inválido: a tela explica e nada é gravado.
  await janela.getByLabel("Preço (R$)").fill("25,9a");
  await janela.getByRole("button", { name: "Criar produto" }).click();
  await expect(avisoNaTela(page)).toHaveText(
    "Preço inválido. Escreva em reais, com vírgula nos centavos, por exemplo 12,50.",
  );
  await expect(janela).toBeVisible();
  expect(await quantosComNome(page, BURGER)).toBe(0);
  await janela.getByLabel("Preço (R$)").fill("0");
  await janela.getByRole("button", { name: "Criar produto" }).click();
  await expect(avisoNaTela(page)).toHaveText(
    "O preço precisa ser de R$ 0,01 até R$ 9.999,99.",
  );
  expect(await quantosComNome(page, BURGER)).toBe(0);

  await janela.getByLabel("Preço (R$)").fill("25,90");
  await janela
    .getByLabel("Descrição (opcional)")
    .fill("Lanche inventado para o teste.");
  await janelaSemEstouro(page);
  await janela.getByRole("button", { name: "Criar produto" }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(
    `Produto ${BURGER} criado.`,
  );
  const cartao = hamburgueres.getByTestId(`produto-${BURGER}`);
  await expect(cartao.getByTestId("preco-do-produto")).toHaveText("R$ 25,90");
  await expect(cartao).toContainText("1º na categoria");
  await expect(cartao.getByTestId("producao-do-produto")).toContainText(
    "Hambúrgueres (Cozinha)",
  );
  await expect(cartao.getByTestId("producao-do-produto")).toContainText(
    "10 min",
  );
  await expect(cartao).toContainText("Lanche inventado para o teste.");
  expect(
    (await hamburgueres.locator(".hor-cat__nome").allTextContents())[0],
  ).toBe(BURGER);
  await expect(hamburgueres.getByTestId("produto-X-Salada")).toContainText(
    "2º na categoria",
  );

  // Nome igual a um ativo: o servidor recusa e a mensagem aparece.
  await page.getByRole("button", { name: "Novo produto" }).click();
  const repetido = page.getByRole("dialog", { name: "Novo produto" });
  await repetido.getByLabel("Nome").fill("x-salada");
  await repetido
    .getByLabel("Categoria", { exact: true })
    .selectOption({ label: "Hambúrgueres" });
  await repetido.getByLabel("Preço (R$)").fill("10");
  await repetido
    .getByLabel("Passa pela produção?")
    .selectOption({
      label: "Não passa pela produção (ex.: bebida da geladeira)",
    });
  await repetido.getByRole("button", { name: "Criar produto" }).click();
  await expect(avisoNaTela(page)).toHaveText(
    "Já existe um produto ativo com esse nome.",
  );
  await repetido.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Descartar" }).click();

  // Produto que não passa pela produção: sem tempo de preparo.
  await page.getByRole("button", { name: "Novo produto" }).click();
  const suco = page.getByRole("dialog", { name: "Novo produto" });
  await suco.getByLabel("Nome").fill(SUCO);
  await suco
    .getByLabel("Categoria", { exact: true })
    .selectOption({ label: "Bebidas" });
  await suco.getByLabel("Preço (R$)").fill("7,5");
  await suco.getByRole("button", { name: "Criar produto" }).click();
  await expect(avisoNaTela(page)).toHaveText(
    "Escolha se passa pela produção (e em qual tipo) ou que não passa.",
  );
  await suco
    .getByLabel("Passa pela produção?")
    .selectOption({
      label: "Não passa pela produção (ex.: bebida da geladeira)",
    });
  await expect(suco.getByLabel("Tempo de preparo (minutos)")).toHaveCount(0);
  await suco.getByRole("button", { name: "Criar produto" }).click();
  await expect(suco).toBeHidden();
  const cartaoSuco = bebidas.getByTestId(`produto-${SUCO}`);
  await expect(cartaoSuco.getByTestId("preco-do-produto")).toHaveText(
    "R$ 7,50",
  );
  await expect(cartaoSuco.getByTestId("producao-do-produto")).toHaveText(
    "Não passa pela produção",
  );
  expect(
    (await bebidas.locator(".hor-cat__nome").allTextContents()).at(-1),
  ).toBe(SUCO);

  // Editar o preço: o resto (e o lugar na categoria) fica como está.
  await page.getByRole("button", { name: `Editar ${BURGER}` }).click();
  const editar = page.getByRole("dialog", { name: `Editar ${BURGER}` });
  await janelaNoCentro(page, editar);
  await expect(editar.getByLabel("Nome")).toHaveValue(BURGER);
  await expect(editar.getByLabel("Preço (R$)")).toHaveValue("25,90");
  await expect(editar.getByLabel("Tempo de preparo (minutos)")).toHaveValue(
    "10",
  );
  await expect(
    editar.getByLabel("Posição na categoria").locator("option:checked"),
  ).toContainText("1º: no começo");
  await editar.getByLabel("Preço (R$)").fill("27,00");
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(
    `Produto ${BURGER} salvo.`,
  );
  await expect(cartao.getByTestId("preco-do-produto")).toHaveText("R$ 27,00");
  await expect(cartao).toContainText("1º na categoria");
  await expect(cartao.getByTestId("producao-do-produto")).toContainText(
    "10 min",
  );

  // Desativar com Desfazer (nada se apaga; o preço fica).
  await page.getByRole("button", { name: `Desativar ${BURGER}` }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(
    `Produto ${BURGER} desativado.`,
  );
  await expect(hamburgueres.getByTestId(`produto-${BURGER}`)).toHaveCount(0);
  const desativado = page
    .getByTestId("produtos-desativados")
    .getByTestId(`produto-${BURGER}`);
  await expect(desativado).toContainText("Desativado");
  await expect(desativado).toContainText("Categoria: Hambúrgueres");
  await expect(desativado.getByTestId("preco-do-produto")).toHaveText(
    "R$ 27,00",
  );
  await page
    .getByTestId("aviso-rapido")
    .getByRole("button", { name: "Desfazer" })
    .click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(
    `Pronto: ${BURGER} voltou.`,
  );
  await expect(
    hamburgueres
      .getByTestId(`produto-${BURGER}`)
      .getByTestId("preco-do-produto"),
  ).toHaveText("R$ 27,00");

  // Desativar de novo e reativar pelo botão do cartão.
  await page.getByRole("button", { name: `Desativar ${BURGER}` }).click();
  await page.getByRole("button", { name: `Reativar ${BURGER}` }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(
    `Produto ${BURGER} reativado.`,
  );
  await expect(hamburgueres.getByTestId(`produto-${BURGER}`)).toBeVisible();
  await semEstouroDeLargura(page);
});

test("supervisor vê os produtos só para ler", async ({ page }) => {
  await entrar(page, "supervisor");
  await page.goto("/cadastros/produtos");
  await expect(
    page
      .getByTestId("categoria-Hambúrgueres")
      .getByTestId(`produto-${BURGER}`)
      .getByTestId("preco-do-produto"),
  ).toHaveText("R$ 27,00");
  await expect(page.getByRole("button", { name: "Novo produto" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: `Editar ${BURGER}` }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Desativar ${BURGER}` }),
  ).toHaveCount(0);
  // O servidor recusa mesmo se alguém mandar direto.
  const r = await page.request.post("/api/cadastros/produtos", {
    data: { nome: "Proibido tela", categoriaId: 1, precoCentavos: 100 },
  });
  expect(r.status()).toBe(403);
});

test("celular (390 px): lista e janela sem estouro", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  await expect(page.getByTestId("categoria-Hambúrgueres")).toBeVisible();
  await semEstouroDeLargura(page);
  await page.getByRole("button", { name: "Novo produto" }).click();
  const janela = page.getByRole("dialog", { name: "Novo produto" });
  await janela
    .getByLabel("Categoria", { exact: true })
    .selectOption({ label: "Hambúrgueres" });
  await janela
    .getByLabel("Passa pela produção?")
    .selectOption({ label: "Hambúrgueres (Cozinha)" });
  await janelaSemEstouro(page);
});
