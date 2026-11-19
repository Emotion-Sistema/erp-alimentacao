import { expect, test, type Locator, type Page } from "@playwright/test";
import { avisoNaTela, entrar, janelaNoCentro, janelaSemEstouro, semEstouroDeLargura } from "./ajudas";

// Adicionais, tamanhos e preço do delivery (decisão 0021): criar um grupo obrigatório e um opcional
// na tela Adicionais; criar um produto com preço próprio no delivery, 2 tamanhos e os 2 grupos,
// conferir a prévia "Quanto fica" e, pela API, o que foi gravado (ids e ordem); tirar um tamanho e
// reordenar; grupo desativado no produto; supervisor só lendo; celular sem rolagem de lado.
// Só dados fictícios.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const SUFIXO = Math.random().toString(36).slice(2, 7);
const PONTO = `Ponto ${SUFIXO}`;
const EXTRAS = `Extras ${SUFIXO}`;
const LANCHE = `Lanche tela ${SUFIXO}`;

type GrupoApi = { id: number; nome: string; minimo: number; maximo: number; ativo: boolean; itens: { id: number; nome: string; precoCentavos: number; precoDeliveryCentavos: number | null; maximoPorItem: number; ativo: boolean }[] };
type ProdutoApi = {
  id: number;
  nome: string;
  precoCentavos: number;
  precoDeliveryCentavos: number | null;
  tamanhos: { id: number; nome: string; acrescimoCentavos: number; acrescimoDeliveryCentavos: number | null }[];
  gruposAdicionais: number[];
};

async function grupoDaApi(page: Page, nome: string): Promise<GrupoApi | undefined> {
  const r = await page.request.get("/api/cadastros/adicionais");
  expect(r.ok()).toBe(true);
  return ((await r.json()) as GrupoApi[]).find((g) => g.nome === nome);
}

async function produtoDaApi(page: Page, nome: string): Promise<ProdutoApi | undefined> {
  const r = await page.request.get("/api/cadastros/produtos");
  expect(r.ok()).toBe(true);
  return ((await r.json()) as ProdutoApi[]).find((p) => p.nome === nome);
}

/** Linha da prévia "Quanto fica": [tamanho, loja, delivery]. */
async function linhaDaPrevia(janela: Locator, tamanho: string) {
  return janela.getByTestId(`previa-${tamanho}`).locator("th, td").allTextContents();
}

test("gerente cria um grupo obrigatório e um opcional", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/adicionais");
  await expect(page.getByRole("heading", { name: "Adicionais", level: 1 })).toBeVisible();
  // Os da semente aparecem (a lista carrega depois da página).
  await expect(page.getByTestId("grupo-Ponto da carne").getByTestId("regra-do-grupo")).toHaveText("Obrigatório: escolha 1");
  await expect(page.getByTestId("grupo-Turbine seu lanche").getByTestId("regra-do-grupo")).toHaveText("Opcional, até 5");

  // Grupo obrigatório "Ponto": mínimo só aparece se a escolha é obrigatória.
  await page.getByRole("button", { name: "Novo grupo" }).click();
  const janela = page.getByRole("dialog", { name: "Novo grupo de adicionais" });
  await janelaNoCentro(page, janela);
  await janela.getByLabel("Nome do grupo").fill(PONTO);
  await expect(janela.getByLabel("Mínimo de escolhas")).toHaveCount(0);
  await janela.getByLabel("Escolha obrigatória?").check();
  await expect(janela.getByLabel("Mínimo de escolhas")).toHaveValue("1");
  await janela.getByLabel("Máximo de escolhas").fill("1");
  // Sem itens, a escolha obrigatória não fecha: a tela explica e nada é gravado.
  await janela.getByRole("button", { name: "Criar grupo" }).click();
  await expect(avisoNaTela(page)).toHaveText("Escolha obrigatória precisa de pelo menos um item.");
  expect(await grupoDaApi(page, PONTO)).toBeUndefined();
  await janela.getByRole("button", { name: "Adicionar item" }).click();
  await janela.getByLabel("Item 1", { exact: true }).fill("Ao ponto");
  await janela.getByRole("button", { name: "Adicionar item" }).click();
  await janela.getByLabel("Item 2", { exact: true }).fill("Bem passado");
  await expect(janela.getByLabel("Preço (R$) do item 2")).toHaveValue("0,00");
  await janela.getByRole("button", { name: "Criar grupo" }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Grupo ${PONTO} criado.`);
  const ponto = page.getByTestId(`grupo-${PONTO}`);
  await expect(ponto.getByTestId("regra-do-grupo")).toHaveText("Obrigatório: escolha 1");
  const itensDoPonto = ponto.getByRole("list", { name: `Itens de ${PONTO}` }).locator("li");
  await expect(itensDoPonto.locator(".adic-itens__nome")).toHaveText(["Ao ponto", "Bem passado"]);
  await expect(itensDoPonto.locator(".adic-itens__preco")).toHaveText(["grátis", "grátis"]);
  await expect(ponto.getByTestId("uso-do-grupo")).toHaveText("Não está em nenhum produto ativo");

  // Nome igual a um grupo ativo: a mensagem do servidor aparece na janela.
  await page.getByRole("button", { name: "Novo grupo" }).click();
  const repetido = page.getByRole("dialog", { name: "Novo grupo de adicionais" });
  await repetido.getByLabel("Nome do grupo").fill("ponto da carne");
  await repetido.getByRole("button", { name: "Criar grupo" }).click();
  await expect(avisoNaTela(page)).toHaveText("Já existe um grupo de adicionais ativo com esse nome.");

  // Grupo opcional com item pago e preço próprio no delivery.
  await repetido.getByLabel("Nome do grupo").fill(EXTRAS);
  await repetido.getByLabel("Máximo de escolhas").fill("3");
  await repetido.getByRole("button", { name: "Adicionar item" }).click();
  await repetido.getByLabel("Item 1", { exact: true }).fill("Bacon");
  await repetido.getByLabel("Preço (R$) do item 1").fill("4,00");
  await repetido.getByLabel("Vezes por item do item 1").fill("2");
  await expect(repetido.getByLabel("Preço no delivery (R$) do item 1")).toHaveCount(0);
  await repetido.getByLabel("Algum item tem preço diferente no delivery").check();
  await repetido.getByLabel("Preço no delivery (R$) do item 1").fill("5,00");
  await repetido.getByRole("button", { name: "Criar grupo" }).click();
  await expect(repetido).toBeHidden();
  const extras = page.getByTestId(`grupo-${EXTRAS}`);
  await expect(extras.getByTestId("regra-do-grupo")).toHaveText("Opcional, até 3");
  const itensDoExtras = extras.getByRole("list", { name: `Itens de ${EXTRAS}` }).locator("li");
  await expect(itensDoExtras.locator(".adic-itens__nome")).toHaveText(["Bacon"]);
  await expect(itensDoExtras.locator(".adic-itens__preco")).toHaveText(["R$ 4,00 (delivery R$ 5,00), até 2 vezes"]);

  const gravado = await grupoDaApi(page, EXTRAS);
  expect(gravado).toMatchObject({ minimo: 0, maximo: 3, ativo: true });
  expect(gravado!.itens.map((i) => [i.nome, i.precoCentavos, i.precoDeliveryCentavos, i.maximoPorItem])).toEqual([["Bacon", 400, 500, 2]]);
  expect((await grupoDaApi(page, PONTO))!.itens.map((i) => [i.nome, i.precoCentavos, i.precoDeliveryCentavos])).toEqual([
    ["Ao ponto", 0, null],
    ["Bem passado", 0, null],
  ]);
  await semEstouroDeLargura(page);
});

test("gerente cria um produto com delivery, 2 tamanhos e os 2 grupos; depois tira um tamanho e reordena", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  await expect(page.getByTestId("categoria-Hambúrgueres").getByTestId("produto-X-Salada")).toBeVisible();
  const idPonto = (await grupoDaApi(page, PONTO))!.id;
  const idExtras = (await grupoDaApi(page, EXTRAS))!.id;

  await page.getByRole("button", { name: "Novo produto" }).click();
  const janela = page.getByRole("dialog", { name: "Novo produto" });
  await janela.getByLabel("Nome", { exact: true }).fill(LANCHE);
  await janela.getByLabel("Categoria", { exact: true }).selectOption({ label: "Hambúrgueres" });
  await janela.getByLabel("Preço (R$)").fill("20,00");
  await janela.getByLabel("Passa pela produção?").selectOption({ label: "Não passa pela produção (ex.: bebida da geladeira)" });

  // Preço no delivery: "Mesmo preço da loja" vem marcado; desmarcado, aparece o campo.
  const mesmo = janela.getByLabel("Mesmo preço da loja");
  await expect(mesmo).toBeChecked();
  await expect(janela.getByLabel("Preço no delivery (R$)")).toHaveCount(0);
  await expect.poll(() => linhaDaPrevia(janela, "Produto")).toEqual(["Produto", "R$ 20,00", "R$ 20,00"]);
  await mesmo.uncheck();
  await janela.getByLabel("Preço no delivery (R$)").fill("23,0x");
  await expect(janela.getByTestId("previa-do-preco")).toContainText("Confira os preços e acréscimos para ver quanto fica.");
  await janela.getByRole("button", { name: "Criar produto" }).click();
  await expect(avisoNaTela(page)).toHaveText("Preço no delivery inválido. Escreva em reais, com vírgula nos centavos, por exemplo 28,90.");
  expect(await produtoDaApi(page, LANCHE)).toBeUndefined();
  await janela.getByLabel("Preço no delivery (R$)").fill("23,00");

  // Dois tamanhos; com preço próprio no delivery, o acréscimo do delivery aparece.
  await expect(janela.getByText("Ex.: P, M, G ou 300 ml, 500 ml. O tamanho soma um acréscimo ao preço do produto (0 no menor).")).toBeVisible();
  await janela.getByRole("button", { name: "Adicionar tamanho" }).click();
  await janela.getByLabel("Tamanho 1", { exact: true }).fill("Simples");
  await janela.getByRole("button", { name: "Adicionar tamanho" }).click();
  await janela.getByLabel("Tamanho 2", { exact: true }).fill("Duplo");
  await janela.getByLabel("Acréscimo (R$) do tamanho 2").fill("6,00");
  await janela.getByLabel("Acréscimo no delivery (R$) do tamanho 2").fill("7,00");
  await expect(janela.getByRole("button", { name: "Subir Simples" })).toBeDisabled();
  await expect(janela.getByRole("button", { name: "Descer Duplo" })).toBeDisabled();

  // Os dois grupos, na ordem: só os ativos que ainda não estão no produto aparecem para escolher.
  const escolher = janela.getByLabel("Grupo para adicionar");
  await escolher.selectOption({ label: `${PONTO} (Obrigatório: escolha 1)` });
  await janela.getByRole("button", { name: "Adicionar grupo" }).click();
  await expect(escolher.locator("option", { hasText: PONTO })).toHaveCount(0);
  await escolher.selectOption({ label: `${EXTRAS} (Opcional, até 3)` });
  await janela.getByRole("button", { name: "Adicionar grupo" }).click();
  await expect(janela.getByTestId("grupos-do-produto").locator("li")).toHaveCount(2);
  await expect(janela.getByRole("link", { name: "Criar e editar grupos" })).toHaveAttribute("href", "/cadastros/adicionais");

  // A prévia usa a mesma regra do servidor: "a partir de" por causa do Ponto (itens grátis).
  const previa = janela.getByTestId("previa-do-preco");
  await expect.poll(() => linhaDaPrevia(janela, "Simples")).toEqual(["Simples", "a partir de R$ 20,00", "a partir de R$ 23,00"]);
  await expect.poll(() => linhaDaPrevia(janela, "Duplo")).toEqual(["Duplo", "a partir de R$ 26,00", "a partir de R$ 30,00"]);
  await expect(previa).toContainText(`já soma a escolha obrigatória mais barata de: ${PONTO}.`);
  await expect(previa).toContainText("Os adicionais que o cliente escolher somam a esse preço.");
  await janelaSemEstouro(page);

  await janela.getByRole("button", { name: "Criar produto" }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Produto ${LANCHE} criado.`);
  const cartao = page.getByTestId("categoria-Hambúrgueres").getByTestId(`produto-${LANCHE}`);
  await expect(cartao.getByTestId("preco-do-produto")).toHaveText("a partir de R$ 20,00");
  await expect(cartao.getByTestId("extras-do-produto")).toHaveText("Delivery a partir de R$ 23,00. 2 tamanhos. 2 grupos de adicionais");
  // Produto sem nada disso continua só com o preço.
  await expect(page.getByTestId("produto-X-Salada").getByTestId("preco-do-produto")).toHaveText("R$ 25,90");

  // O que o servidor gravou: preços, tamanhos e grupos na ordem.
  const criado = (await produtoDaApi(page, LANCHE))!;
  expect(criado.precoCentavos).toBe(2000);
  expect(criado.precoDeliveryCentavos).toBe(2300);
  expect(criado.tamanhos.map((t) => [t.nome, t.acrescimoCentavos, t.acrescimoDeliveryCentavos])).toEqual([
    ["Simples", 0, null],
    ["Duplo", 600, 700],
  ]);
  expect(criado.gruposAdicionais).toEqual([idPonto, idExtras]);
  const idDuplo = criado.tamanhos[1]!.id;
  const idSimples = criado.tamanhos[0]!.id;

  // Editar: tira o Simples, cria o Kids e sobe para o primeiro lugar; o Extras passa na frente.
  await page.getByRole("button", { name: `Editar ${LANCHE}` }).click();
  const editar = page.getByRole("dialog", { name: `Editar ${LANCHE}` });
  await expect(editar.getByLabel("Mesmo preço da loja")).not.toBeChecked();
  await expect(editar.getByLabel("Preço no delivery (R$)")).toHaveValue("23,00");
  await expect(editar.getByLabel("Tamanho 1", { exact: true })).toHaveValue("Simples");
  await expect(editar.getByLabel("Acréscimo no delivery (R$) do tamanho 2")).toHaveValue("7,00");
  await editar.getByRole("button", { name: "Remover Simples" }).click();
  await expect(editar.getByLabel("Tamanho 1", { exact: true })).toHaveValue("Duplo");
  await editar.getByRole("button", { name: "Adicionar tamanho" }).click();
  await editar.getByLabel("Tamanho 2", { exact: true }).fill("Kids");
  await editar.getByRole("button", { name: "Subir Kids" }).click();
  await expect(editar.getByLabel("Tamanho 1", { exact: true })).toHaveValue("Kids");
  await editar.getByRole("button", { name: `Subir ${EXTRAS}` }).click();
  await expect(editar.getByTestId("grupos-do-produto").locator("li").first()).toContainText(EXTRAS);
  await expect.poll(() => linhaDaPrevia(editar, "Kids")).toEqual(["Kids", "a partir de R$ 20,00", "a partir de R$ 23,00"]);
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(editar).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Produto ${LANCHE} salvo.`);

  const salvo = (await produtoDaApi(page, LANCHE))!;
  expect(salvo.tamanhos.map((t) => t.nome)).toEqual(["Kids", "Duplo"]);
  // O Duplo é o mesmo tamanho (mesmo id); o Kids é novo; o Simples saiu.
  expect(salvo.tamanhos[1]!.id).toBe(idDuplo);
  expect(salvo.tamanhos[0]!.id).not.toBe(idSimples);
  expect(salvo.tamanhos[1]).toMatchObject({ acrescimoCentavos: 600, acrescimoDeliveryCentavos: 700 });
  expect(salvo.gruposAdicionais).toEqual([idExtras, idPonto]);
  await expect(cartao.getByTestId("extras-do-produto")).toHaveText("Delivery a partir de R$ 23,00. 2 tamanhos. 2 grupos de adicionais");

  // Na tela Adicionais, os dois grupos contam o produto.
  await page.goto("/cadastros/adicionais");
  await expect(page.getByTestId(`grupo-${PONTO}`).getByTestId("uso-do-grupo")).toHaveText("Usado em 1 produto");
});

test("grupo desativado: vai para Fora de uso e, no produto, aparece marcado e pode ser tirado", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/adicionais");
  await page.getByRole("button", { name: `Desativar ${EXTRAS}` }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Grupo ${EXTRAS} desativado.`);
  await expect(page.getByTestId("grupos-fora-de-uso").getByTestId(`grupo-${EXTRAS}`)).toContainText("Desativado");
  await expect(page.getByTestId("grupos-ativos").getByTestId(`grupo-${EXTRAS}`)).toHaveCount(0);

  await page.goto("/cadastros/produtos");
  await page.getByRole("button", { name: `Editar ${LANCHE}` }).click();
  const editar = page.getByRole("dialog", { name: `Editar ${LANCHE}` });
  const ligado = editar.getByRole("group", { name: EXTRAS });
  await expect(ligado).toContainText("desativado");
  await expect(editar.getByLabel("Grupo para adicionar").locator("option", { hasText: EXTRAS })).toHaveCount(0);
  // Fora da prévia: grupo desativado não entra no preço.
  await expect(editar.getByTestId("previa-do-preco")).not.toContainText("Os adicionais que o cliente escolher");
  await editar.getByRole("button", { name: `Remover ${EXTRAS}` }).click();
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(editar).toBeHidden();
  expect((await produtoDaApi(page, LANCHE))!.gruposAdicionais).toEqual([(await grupoDaApi(page, PONTO))!.id]);

  // Reativar pelo cartão.
  await page.goto("/cadastros/adicionais");
  await page.getByRole("button", { name: `Reativar ${EXTRAS}` }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Grupo ${EXTRAS} reativado.`);
  await expect(page.getByTestId("grupos-ativos").getByTestId(`grupo-${EXTRAS}`)).toBeVisible();
});

test("supervisor vê os adicionais só para ler", async ({ page }) => {
  await entrar(page, "supervisor");
  await page.goto("/cadastros/adicionais");
  await expect(page.getByTestId(`grupo-${PONTO}`).getByTestId("regra-do-grupo")).toHaveText("Obrigatório: escolha 1");
  await expect(page.getByRole("button", { name: "Novo grupo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Editar ${PONTO}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Desativar ${PONTO}` })).toHaveCount(0);
  // O servidor recusa mesmo se alguém mandar direto.
  const r = await page.request.post("/api/cadastros/adicionais", { data: { nome: "Proibido tela", minimo: 0, maximo: 1 } });
  expect(r.status()).toBe(403);
  // Na lista de produtos, o supervisor vê o resumo, sem botões.
  await page.goto("/cadastros/produtos");
  await expect(page.getByTestId(`produto-${LANCHE}`).getByTestId("extras-do-produto")).toHaveText("Delivery a partir de R$ 23,00. 2 tamanhos. 1 grupo de adicionais");
  await expect(page.getByRole("button", { name: `Editar ${LANCHE}` })).toHaveCount(0);
});

test("celular (390 px): janela do grupo e do produto cabem, sem rolagem de lado, com botões grandes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/adicionais");
  await expect(page.getByTestId(`grupo-${EXTRAS}`)).toBeVisible();
  await semEstouroDeLargura(page);
  await page.getByRole("button", { name: `Editar ${EXTRAS}` }).click();
  const grupo = page.getByRole("dialog", { name: `Editar ${EXTRAS}` });
  await expect(grupo.getByLabel("Preço no delivery (R$) do item 1")).toHaveValue("5,00");
  await grupo.getByRole("button", { name: "Adicionar item" }).click();
  await grupo.getByLabel("Item 2", { exact: true }).fill("Cheddar cremoso da casa");
  await janelaSemEstouro(page);
  for (const nome of ["Subir Bacon", "Descer Bacon", "Remover Bacon"]) {
    const caixa = (await grupo.getByRole("button", { name: nome }).boundingBox())!;
    expect(caixa.height, nome).toBeGreaterThanOrEqual(44);
    expect(caixa.width, nome).toBeGreaterThanOrEqual(44);
  }
  await grupo.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Descartar" }).click();

  await page.goto("/cadastros/produtos");
  await page.getByRole("button", { name: `Editar ${LANCHE}` }).click();
  const produto = page.getByRole("dialog", { name: `Editar ${LANCHE}` });
  await expect(produto.getByLabel("Tamanho 1", { exact: true })).toHaveValue("Kids");
  await expect(produto.getByTestId("previa-do-preco")).toBeVisible();
  await janelaSemEstouro(page);
  const remover = (await produto.getByRole("button", { name: "Remover Kids" }).boundingBox())!;
  expect(remover.height).toBeGreaterThanOrEqual(44);
});
