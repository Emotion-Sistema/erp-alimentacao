import { expect, test, type Locator, type Page } from "@playwright/test";
import { avisoNaTela, entrar, janelaSemEstouro, semEstouroDeLargura } from "./ajudas";

// Combos na tela de Produtos (decisão 0023): criar um combo com 2 partes (uma opção com tamanho,
// outra com acréscimo) e conferir pela API; erro do servidor na janela (o mesmo produto duas vezes
// na parte); a prévia "Quanto fica" com "A partir de" e "Até" na loja e no delivery; editar
// (remover uma opção e reordenar as partes) mantendo os ids; opção que saiu de venda; celular;
// desmarcar "É um combo?" desmonta o combo. Só dados fictícios (a semente e produtos criados aqui).

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const SUFIXO = Math.random().toString(36).slice(2, 7);
const COMBO = `Combo tela ${SUFIXO}`;
const SUCO = `Suco combo ${SUFIXO}`;

type OpcaoApi = { id: number; produtoId: number; tamanhoId: number | null; acrescimoCentavos: number; acrescimoDeliveryCentavos: number | null };
type ProdutoApi = {
  id: number;
  nome: string;
  ativo: boolean;
  tipoProducaoId: number | null;
  tempoPreparoMin: number | null;
  precoCentavos: number;
  precoDeliveryCentavos: number | null;
  tamanhos: { id: number; nome: string }[];
  combo: { partes: { id: number; nome: string; opcoes: OpcaoApi[] }[] } | null;
};

async function produtos(page: Page): Promise<ProdutoApi[]> {
  const r = await page.request.get("/api/cadastros/produtos");
  expect(r.ok()).toBe(true);
  return (await r.json()) as ProdutoApi[];
}
const produtoDaApi = async (page: Page, nome: string) => (await produtos(page)).find((p) => p.nome === nome);
const idDe = async (page: Page, nome: string) => (await produtoDaApi(page, nome))!.id;

/** Linha da prévia "Quanto fica": [nome, loja, delivery]. */
const linhaDaPrevia = (janela: Locator, nome: string) => janela.getByTestId(`previa-${nome}`).locator("th, td").allTextContents();

/** Resumo das partes como o servidor devolve: [parte, [[produto, tamanho, acréscimo, delivery]]]. */
async function resumoDoCombo(page: Page, nome: string) {
  const todos = await produtos(page);
  const nomeDe = (id: number) => todos.find((p) => p.id === id)?.nome;
  const tamanhoDe = (o: OpcaoApi) => (o.tamanhoId === null ? null : todos.find((p) => p.id === o.produtoId)?.tamanhos.find((t) => t.id === o.tamanhoId)?.nome);
  return todos
    .find((p) => p.nome === nome)
    ?.combo?.partes.map((p) => [p.nome, p.opcoes.map((o) => [nomeDe(o.produtoId), tamanhoDe(o), o.acrescimoCentavos, o.acrescimoDeliveryCentavos])]);
}

test("gerente cria um combo com 2 partes; o servidor recusa opção repetida", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  await expect(page.getByTestId("categoria-Hambúrgueres").getByTestId("produto-X-Salada")).toBeVisible();

  await page.getByRole("button", { name: "Novo produto" }).click();
  const janela = page.getByRole("dialog", { name: "Novo produto" });
  await janela.getByLabel("Nome", { exact: true }).fill(COMBO);
  await janela.getByLabel("Categoria", { exact: true }).selectOption({ label: "Hambúrgueres" });
  await janela.getByLabel("Preço (R$)").fill("30,00");
  await janela.getByLabel("Mesmo preço da loja").uncheck();
  await janela.getByLabel("Preço no delivery (R$)").fill("33,00");

  // Sem marcar, é um produto comum: tipo de produção e tamanhos aparecem.
  await expect(janela.getByLabel("Passa pela produção?")).toBeVisible();
  await expect(janela.getByRole("group", { name: "Tamanhos (opcional)" })).toBeVisible();
  await expect(janela.getByRole("group", { name: "Partes do combo" })).toHaveCount(0);

  // Marcado: some o tipo, o tempo e os tamanhos; aparece "Partes do combo" com uma parte vazia.
  await janela.getByLabel("É um combo?").check();
  await expect(janela.getByLabel("Passa pela produção?")).toHaveCount(0);
  await expect(janela.getByLabel("Tempo de preparo (minutos)")).toHaveCount(0);
  await expect(janela.getByRole("group", { name: "Tamanhos (opcional)" })).toHaveCount(0);
  const partes = janela.getByRole("group", { name: "Partes do combo" });
  await expect(partes).toBeVisible();
  await expect(
    partes.getByText("Ex.: Lanche, Bebida, Acompanhamento. Em cada parte o cliente escolhe uma opção. Cada produto escolhido vai para a tela da cozinha dele."),
  ).toBeVisible();

  // Parte 1, Lanche: X-Salada (sem acréscimo) e, por engano, X-Salada de novo.
  await janela.getByLabel("Nome da parte 1", { exact: true }).fill("Lanche");
  const produto11 = janela.getByLabel("Produto da opção 1 da parte 1", { exact: true });
  // Os produtos vêm agrupados por categoria; combo não aparece entre eles.
  await expect(produto11.locator("optgroup")).not.toHaveCount(0);
  await expect(produto11.locator('optgroup[label="Hambúrgueres"] option', { hasText: "X-Salada" })).toHaveCount(1);
  await produto11.selectOption({ label: "X-Salada" });
  await expect(janela.getByLabel("Acréscimo (R$) da opção 1 da parte 1")).toHaveValue("0,00");
  // Sem tamanho no X-Salada, a escolha de tamanho não aparece.
  await expect(janela.getByLabel("Tamanho da opção 1 da parte 1", { exact: true })).toHaveCount(0);
  await janela.getByRole("button", { name: "Adicionar opção em Lanche" }).click();
  await janela.getByLabel("Produto da opção 2 da parte 1", { exact: true }).selectOption({ label: "X-Salada" });

  // Parte 2, Acompanhamento: batata (tem tamanhos: escolher é obrigatório) e refrigerante com acréscimo.
  await janela.getByRole("button", { name: "Adicionar parte" }).click();
  await janela.getByLabel("Nome da parte 2", { exact: true }).fill("Acompanhamento");
  await janela.getByLabel("Produto da opção 1 da parte 2", { exact: true }).selectOption({ label: "Porção de batata frita" });
  const tamanho = janela.getByLabel("Tamanho da opção 1 da parte 2", { exact: true });
  await expect(tamanho).toBeVisible();
  await expect(janela.getByTestId("previa-do-preco")).toContainText("Escolha o produto (e o tamanho) de cada opção para ver quanto fica.");
  await janela.getByRole("button", { name: "Criar produto" }).click();
  await expect(avisoNaTela(page)).toHaveText("Acompanhamento: escolha o tamanho de Porção de batata frita.");
  await tamanho.selectOption({ label: "Meia" });
  await janela.getByRole("button", { name: "Adicionar opção em Acompanhamento" }).click();
  await janela.getByLabel("Produto da opção 2 da parte 2", { exact: true }).selectOption({ label: "Refrigerante lata" });
  await janela.getByLabel("Acréscimo (R$) da opção 2 da parte 2").fill("1,50");

  // O mesmo produto duas vezes na mesma parte: quem recusa é o servidor, e a mensagem aparece aqui.
  await janela.getByRole("button", { name: "Criar produto" }).click();
  await expect(avisoNaTela(page)).toHaveText("Lanche: a mesma opção veio duas vezes.");
  expect(await produtoDaApi(page, COMBO)).toBeUndefined();

  // Troca a repetida pelo X-Bacon, com acréscimo (e acréscimo próprio no delivery: o combo tem preço lá).
  await janela.getByLabel("Produto da opção 2 da parte 1", { exact: true }).selectOption({ label: "X-Bacon" });
  await janela.getByLabel("Acréscimo (R$) da opção 2 da parte 1").fill("4,00");
  await janela.getByLabel("Acréscimo no delivery (R$) da opção 2 da parte 1").fill("5,00");

  // Prévia: a partir de = combo + menor acréscimo de cada parte; até = com o maior.
  await expect.poll(() => linhaDaPrevia(janela, "A partir de")).toEqual(["A partir de", "R$ 30,00", "R$ 33,00"]);
  await expect.poll(() => linhaDaPrevia(janela, "Até")).toEqual(["Até", "R$ 35,50", "R$ 39,50"]);
  await expect(janela.getByTestId("previa-do-preco")).toContainText('"A partir de" soma a opção mais barata de cada parte; "Até", a mais cara.');
  await janelaSemEstouro(page);

  await janela.getByRole("button", { name: "Criar produto" }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Produto ${COMBO} criado.`);

  // Cartão: selo Combo, as partes e o preço "a partir de".
  const cartao = page.getByTestId("categoria-Hambúrgueres").getByTestId(`produto-${COMBO}`);
  await expect(cartao.getByTestId("producao-do-produto")).toHaveText("Combo");
  await expect(cartao.getByTestId("partes-do-produto")).toHaveText("Partes: Lanche, Acompanhamento");
  await expect(cartao.getByTestId("preco-do-produto")).toHaveText("a partir de R$ 30,00");
  await expect(cartao.getByTestId("extras-do-produto")).toHaveText("Delivery a partir de R$ 33,00");

  // O que o servidor gravou.
  const criado = (await produtoDaApi(page, COMBO))!;
  expect(criado.tipoProducaoId).toBeNull();
  expect(criado.tempoPreparoMin).toBeNull();
  expect(criado.tamanhos).toEqual([]);
  expect(criado.precoCentavos).toBe(3000);
  expect(criado.precoDeliveryCentavos).toBe(3300);
  expect(await resumoDoCombo(page, COMBO)).toEqual([
    ["Lanche", [["X-Salada", null, 0, null], ["X-Bacon", null, 400, 500]]],
    ["Acompanhamento", [["Porção de batata frita", "Meia", 0, null], ["Refrigerante lata", null, 150, null]]],
  ]);
  const batata = (await produtoDaApi(page, "Porção de batata frita"))!;
  expect(criado.combo!.partes[1]!.opcoes[0]).toMatchObject({ produtoId: batata.id, tamanhoId: batata.tamanhos.find((t) => t.nome === "Meia")!.id });
});

test("editar: remover uma opção e reordenar as partes mantém os ids", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  const antes = (await produtoDaApi(page, COMBO))!;
  const [lanche, acomp] = antes.combo!.partes;

  await page.getByRole("button", { name: `Editar ${COMBO}` }).click();
  const editar = page.getByRole("dialog", { name: `Editar ${COMBO}` });
  await expect(editar.getByLabel("É um combo?")).toBeChecked();
  await expect(editar.getByLabel("Passa pela produção?")).toHaveCount(0);
  await expect(editar.getByLabel("Nome da parte 1", { exact: true })).toHaveValue("Lanche");
  await expect(editar.getByLabel("Tamanho da opção 1 da parte 2", { exact: true })).toHaveValue(String(acomp!.opcoes[0]!.tamanhoId));
  await expect(editar.getByLabel("Acréscimo no delivery (R$) da opção 2 da parte 1")).toHaveValue("5,00");
  await expect(editar.getByRole("button", { name: "Subir Lanche" })).toBeDisabled();

  await editar.getByRole("button", { name: "Remover Refrigerante lata (Acompanhamento)" }).click();
  await expect(editar.getByTestId("opcoes-da-parte-2").locator("li")).toHaveCount(1);
  await editar.getByRole("button", { name: "Subir Acompanhamento" }).click();
  await expect(editar.getByLabel("Nome da parte 1", { exact: true })).toHaveValue("Acompanhamento");
  await expect.poll(() => linhaDaPrevia(editar, "Até")).toEqual(["Até", "R$ 34,00", "R$ 38,00"]);
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(editar).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Produto ${COMBO} salvo.`);

  const depois = (await produtoDaApi(page, COMBO))!;
  expect(depois.combo!.partes.map((p) => [p.id, p.nome])).toEqual([
    [acomp!.id, "Acompanhamento"],
    [lanche!.id, "Lanche"],
  ]);
  expect(depois.combo!.partes[0]!.opcoes.map((o) => o.id)).toEqual([acomp!.opcoes[0]!.id]);
  expect(depois.combo!.partes[1]!.opcoes.map((o) => o.id)).toEqual(lanche!.opcoes.map((o) => o.id));
  expect(depois.combo!.partes[1]!.opcoes[1]).toMatchObject({ acrescimoCentavos: 400, acrescimoDeliveryCentavos: 500 });
  expect(depois.tipoProducaoId).toBeNull();
  await expect(page.getByTestId(`produto-${COMBO}`).getByTestId("partes-do-produto")).toHaveText("Partes: Acompanhamento, Lanche");
});

test("opção cujo produto saiu de venda aparece marcada e precisa ser removida", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  const categorias = (await (await page.request.get("/api/cadastros/categorias")).json()) as { id: number; nome: string }[];
  const r = await page.request.post("/api/cadastros/produtos", {
    data: { nome: SUCO, categoriaId: categorias.find((c) => c.nome === "Bebidas")!.id, precoCentavos: 700, tipoProducaoId: null },
  });
  expect(r.ok()).toBe(true);
  await page.reload();

  // Põe o suco como opção do Lanche.
  await page.getByRole("button", { name: `Editar ${COMBO}` }).click();
  let editar = page.getByRole("dialog", { name: `Editar ${COMBO}` });
  await editar.getByRole("button", { name: "Adicionar opção em Lanche" }).click();
  await editar.getByLabel("Produto da opção 3 da parte 2", { exact: true }).selectOption({ label: SUCO });
  await editar.getByLabel("Acréscimo (R$) da opção 3 da parte 2").fill("9,00");
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(editar).toBeHidden();
  expect((await resumoDoCombo(page, COMBO))![1]![1]).toHaveLength(3);

  // O suco sai de venda.
  const suco = await idDe(page, SUCO);
  expect((await page.request.post("/api/cadastros/produtos", { data: { id: suco, ativo: false } })).ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: `Editar ${COMBO}` }).click();
  editar = page.getByRole("dialog", { name: `Editar ${COMBO}` });
  const fora = editar.getByRole("group", { name: `${SUCO} (Lanche)` });
  await expect(fora).toContainText("fora de venda");
  await expect(fora.getByRole("combobox")).toHaveCount(0);
  // Na prévia, a opção fora de venda não conta: o "Até" continua com o X-Bacon.
  await expect.poll(() => linhaDaPrevia(editar, "Até")).toEqual(["Até", "R$ 34,00", "R$ 38,00"]);
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(avisoNaTela(page)).toHaveText(`Lanche: ${SUCO} está fora de venda. Remova esta opção para salvar.`);
  await editar.getByRole("button", { name: `Remover ${SUCO} (Lanche)` }).click();
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(editar).toBeHidden();
  expect((await resumoDoCombo(page, COMBO))![1]![1]).toEqual([
    ["X-Salada", null, 0, null],
    ["X-Bacon", null, 400, 500],
  ]);
});

test("celular (390 px): a janela do combo cabe, sem rolagem de lado, com botões grandes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  await expect(page.getByTestId(`produto-${COMBO}`)).toBeVisible();
  await semEstouroDeLargura(page);
  await page.getByRole("button", { name: `Editar ${COMBO}` }).click();
  const editar = page.getByRole("dialog", { name: `Editar ${COMBO}` });
  await expect(editar.getByLabel("Nome da parte 1", { exact: true })).toHaveValue("Acompanhamento");
  await editar.getByRole("button", { name: "Adicionar opção em Lanche" }).click();
  await editar.getByLabel("Produto da opção 3 da parte 2", { exact: true }).selectOption({ label: "Porção de batata frita" });
  await expect(editar.getByLabel("Tamanho da opção 3 da parte 2", { exact: true })).toBeVisible();
  await editar.getByRole("button", { name: "Adicionar parte" }).click();
  await editar.getByLabel("Nome da parte 3", { exact: true }).fill("Sobremesa da casa com nome comprido");
  await janelaSemEstouro(page);
  await semEstouroDeLargura(page);
  for (const nome of ["Subir Lanche", "Descer Acompanhamento", "Remover Lanche", "Subir X-Bacon (Lanche)", "Remover X-Bacon (Lanche)", "Adicionar opção em Lanche", "Adicionar parte"]) {
    const caixa = (await editar.getByRole("button", { name: nome }).boundingBox())!;
    expect(caixa.height, nome).toBeGreaterThanOrEqual(44);
    expect(caixa.width, nome).toBeGreaterThanOrEqual(44);
  }
  for (const rotulo of ["Produto da opção 1 da parte 1", "Nome da parte 1", "Tamanho da opção 3 da parte 2"]) {
    const caixa = (await editar.getByLabel(rotulo, { exact: true }).boundingBox())!;
    expect(caixa.height, rotulo).toBeGreaterThanOrEqual(44);
  }
  const marcar = (await editar.getByText("É um combo?", { exact: true }).boundingBox())!;
  expect(marcar.height).toBeGreaterThanOrEqual(44);
  await editar.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(editar).toBeHidden();
});

test("desmarcar \"É um combo?\" pede confirmação e desmonta o combo", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  await page.getByRole("button", { name: `Editar ${COMBO}` }).click();
  const editar = page.getByRole("dialog", { name: `Editar ${COMBO}` });
  const eCombo = editar.getByLabel("É um combo?");

  // "Não" deixa como estava.
  await eCombo.uncheck();
  const confirmar = editar.getByRole("alertdialog", { name: "Deixar de ser combo? As partes saem deste produto quando você salvar." });
  await expect(confirmar).toBeVisible();
  await expect(eCombo).toBeChecked();
  await confirmar.getByRole("button", { name: "Não" }).click();
  await expect(confirmar).toHaveCount(0);
  await expect(editar.getByRole("group", { name: "Partes do combo" })).toBeVisible();

  await eCombo.uncheck();
  await editar.getByRole("button", { name: "Sim, deixar de ser combo" }).click();
  await expect(eCombo).not.toBeChecked();
  await expect(editar.getByRole("group", { name: "Partes do combo" })).toHaveCount(0);
  await expect(editar.getByRole("group", { name: "Tamanhos (opcional)" })).toBeVisible();
  // Era combo: a pessoa escolhe de novo se passa pela produção.
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(avisoNaTela(page)).toHaveText("Escolha se passa pela produção (e em qual tipo) ou que não passa.");
  await editar.getByLabel("Passa pela produção?").selectOption({ label: "Não passa pela produção (ex.: bebida da geladeira)" });
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(editar).toBeHidden();

  const salvo = (await produtoDaApi(page, COMBO))!;
  expect(salvo.combo).toBeNull();
  expect(salvo.tipoProducaoId).toBeNull();
  const cartao = page.getByTestId(`produto-${COMBO}`);
  await expect(cartao.getByTestId("producao-do-produto")).toHaveText("Não passa pela produção");
  await expect(cartao.getByTestId("partes-do-produto")).toHaveCount(0);
  await expect(cartao.getByTestId("preco-do-produto")).toHaveText("R$ 30,00");
});
