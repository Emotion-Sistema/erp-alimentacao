import { expect, test, type Locator, type Page } from "@playwright/test";
import { abrirAdicionar, entrar, semEstouroDeLargura } from "./ajudas";

// Cadastro rápido de ingredientes e fornecedores (ideia nº 4): catálogo pronto, lista colada,
// sugestão ao digitar, embalagens do catálogo, duplicar, salvar e próximo, máscaras e consulta de CNPJ.
// A consulta de CNPJ é interceptada: nenhum teste depende da internet.

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

/** Todo botão e campo tocável tem de ter pelo menos 44 px de altura (aparelho de toque). */
async function altoDeToque(...itens: Locator[]) {
  for (const item of itens) {
    const caixa = await item.first().boundingBox();
    expect(caixa, "elemento não apareceu").not.toBeNull();
    expect(caixa!.height).toBeGreaterThanOrEqual(44);
  }
}

async function abrirRapido(page: Page) {
  await page.goto("/cadastros");
  await expect(page.getByTestId("ingrediente-Ovo")).toBeVisible();
  await abrirAdicionar(page, "Rápido");
  await expect(page.getByRole("tab", { name: "Catálogo pronto" })).toHaveAttribute("aria-selected", "true");
}

test("catálogo pronto: busca sem acento, marca 3, ajusta uma embalagem e grava", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirRapido(page);
  const busca = page.getByLabel("Procurar no catálogo");

  // "mussarela" acha "Queijo muçarela" (sem acento e por apelido).
  await busca.fill("mussarela");
  await expect(page.getByRole("checkbox", { name: "Queijo muçarela" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Bacon", exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Queijo muçarela" }).check();
  // Ao marcar, mostra unidade, área e embalagens.
  const mini = page.getByTestId("catalogo-Queijo muçarela");
  for (const t of ["Gramas (g)", "Alimentos da cozinha", "peça 4 kg = 4.000 g", "pacote 1 kg = 1.000 g"]) await expect(mini).toContainText(t);

  await busca.fill("bacon");
  await page.getByRole("checkbox", { name: "Bacon", exact: true }).check();
  await busca.fill("presunto");
  await page.getByRole("checkbox", { name: "Presunto", exact: true }).check();

  // Já cadastrado (veio da semente): aparece marcado como tal e não dá para marcar.
  await busca.fill("ovo");
  const ovo = page.getByRole("checkbox", { name: "Ovo (já cadastrado)" });
  await expect(ovo).toBeDisabled();

  // Ajusta as embalagens do Presunto antes de gravar: o bloco vem recolhido, com o resumo.
  await busca.fill("presunto");
  await page.getByRole("button", { name: "Ajustar Presunto" }).click();
  const item = page.getByTestId("catalogo-Presunto");
  await expect(item.getByTestId("resumo-das-embalagens")).toHaveText("1 embalagem: Peça");
  await item.getByRole("button", { name: /^Mostrar Embalagens/ }).click();
  await item.getByRole("button", { name: "Tirar embalagem peça" }).click();
  await item.getByRole("button", { name: "Escolher do catálogo" }).click();
  await item.getByRole("checkbox", { name: "Pacote 1 kg" }).check();
  await item.getByRole("button", { name: "Adicionar 1 embalagem" }).click();
  await expect(item.getByRole("list", { name: "Embalagens colocadas" })).toContainText("Pacote 1 kg = 1.000 g");
  await busca.fill("");

  await expect(page.getByText("3 itens marcados")).toBeVisible();
  await altoDeToque(page.getByRole("button", { name: "Gravar 3 itens" }), page.getByRole("tab", { name: "Colar uma lista" }));
  await semEstouroDeLargura(page);
  await page.getByRole("button", { name: "Gravar 3 itens" }).click();
  await expect(page.getByText("3 ingredientes gravados.")).toBeVisible();

  // A lista de trás atualiza e o catálogo passa a mostrar os três como já cadastrados.
  await expect(page.getByTestId("ingrediente-Queijo muçarela")).toContainText("peça 4 kg = 4.000 g");
  await expect(page.getByTestId("ingrediente-Presunto")).toContainText("pacote 1 kg = 1.000 g");
  await expect(page.getByTestId("ingrediente-Presunto")).not.toContainText("peça");
  await expect(page.getByTestId("ingrediente-Bacon")).toContainText("pacote 1 kg = 1.000 g");
  await busca.fill("presunto");
  await expect(page.getByRole("checkbox", { name: "Presunto (já cadastrado)" })).toBeDisabled();
});

test("catálogo pronto: corredores recolhíveis, cartões selecionáveis e bandeja de selecionados", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirRapido(page);

  // Na primeira vez, todos os corredores começam fechados, com a quantidade de itens em selo.
  const botoes = page.locator(".catalogo__alternar");
  await expect(botoes.first()).toBeVisible(); // o catálogo chega do servidor: espera antes de contar
  const total = await botoes.count();
  expect(total).toBeGreaterThan(5);
  for (let i = 0; i < total; i++) await expect(botoes.nth(i)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByTestId("corredor-Hortifrúti").locator(".erp-selo").first()).toContainText(/\d+ itens?/);
  expect((await page.locator("#painel-catalogo").boundingBox())!.height).toBeLessThan(3500);

  // Abrir pelo cabeçalho mostra os cartões; marcar dá destaque, ícone ok e selo "marcados".
  await page.getByRole("button", { name: "Hortifrúti", exact: true }).click();
  const tomate = page.getByRole("checkbox", { name: "Tomate", exact: true });
  await tomate.check();
  const cartao = page.locator("label.cartao-sel", { has: tomate });
  await expect(cartao).toHaveClass(/cartao-sel--marcado/);
  await expect(cartao.locator("svg.erp-icone").first()).toBeVisible();
  await expect(cartao).toContainText("Gramas (g)");
  await expect(page.getByTestId("corredor-Hortifrúti")).toContainText("1 marcado");
  await expect(page.getByRole("region", { name: "Itens selecionados" })).toContainText("Selecionados (1)");
  // O cartão inteiro é a área de toque (pelo menos 44 px) e o foco aparece.
  expect((await cartao.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await tomate.focus();
  await expect(cartao).toHaveCSS("outline-style", "solid");

  // Item já cadastrado: esmaecido, com selo, e não marca.
  await page.getByLabel("Procurar no catálogo").fill("ovo");
  const ovo = page.getByRole("checkbox", { name: "Ovo (já cadastrado)" });
  await expect(ovo).toBeDisabled();
  await expect(page.locator("label.cartao-sel", { has: ovo })).toContainText("Já cadastrado");

  // Tirar da bandeja desmarca o cartão.
  await page.getByLabel("Procurar no catálogo").fill("");
  await page.getByRole("button", { name: "Desmarcar Tomate" }).click();
  await expect(page.getByText("Nenhum item marcado")).toBeVisible();
  await semEstouroDeLargura(page);
});

test("item marcado vem com a unidade sugerida já escolhida e a pessoa pode trocar (resposta de 19/11/2026)", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirRapido(page);
  await page.getByLabel("Corredor").selectOption("Hortifrúti");
  // Fruta não tem mais asterisco nem bloqueio: marca como qualquer outro item.
  await expect(page.getByText(/a confirmar/i)).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Laranja", exact: true }).check();
  const item = page.getByTestId("catalogo-Laranja");
  const unidade = item.getByLabel("Unidade do estoque");
  await expect(unidade).toHaveValue("un");
  // O campo tem a ajuda do padrão (explicação sempre à vista e exemplo).
  await expect(item.getByText(/Por dentro o sistema conta em gramas/)).toBeVisible();
  await unidade.selectOption("kg");
  await expect(unidade).toHaveValue("kg");
  // No Ajustar não aparece outro campo de unidade (um só por item).
  await page.getByRole("button", { name: "Ajustar Laranja" }).click();
  await expect(item.getByLabel("Unidade do estoque")).toHaveCount(1);
  await item.getByRole("button", { name: /^Mostrar Embalagens/ }).click();
  await item.getByRole("button", { name: "Tirar embalagem saco 3 kg" }).click();
  await page.getByRole("button", { name: "Gravar 1 item" }).click();
  await expect(page.getByText("1 ingrediente gravado.")).toBeVisible();
  await expect(page.getByTestId("ingrediente-Laranja")).toContainText("Quilos (kg)");

  // Marcar todos também leva os itens que antes estavam em dúvida.
  await page.getByRole("button", { name: "Marcar todos de Hortifrúti" }).click();
  await expect(page.getByRole("button", { name: "Desmarcar Banana" })).toBeVisible();
  await expect(page.getByTestId("catalogo-Banana").getByLabel("Unidade do estoque")).toHaveValue("un");
  await page.getByRole("button", { name: "Desmarcar tudo" }).click();
});

test("catálogo pronto: marcar todos do corredor pula o que já existe; servidor recusa com a mensagem do item", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirRapido(page);
  await page.getByLabel("Corredor").selectOption("Laticínios e ovos");
  await page.getByRole("button", { name: "Marcar todos de Laticínios e ovos" }).click();
  // Ovo e Leite integral já existem: ficam de fora; o resto do corredor é marcado.
  await expect(page.getByRole("checkbox", { name: "Ovo (já cadastrado)" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Queijo muçarela (já cadastrado)" })).toBeDisabled();
  const marcados = page.getByText(/\d+ itens? marcados?/);
  await expect(marcados).toBeVisible();
  await page.getByRole("button", { name: "Desmarcar tudo" }).click();
  await expect(page.getByText("Nenhum item marcado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gravar", exact: true })).toBeDisabled();

  // Nome repetido dentro do lote: o servidor recusa e a mensagem aparece (nada é gravado).
  await page.getByLabel("Corredor").selectOption("Hortifrúti");
  await page.getByRole("checkbox", { name: "Tomate", exact: true }).check();
  await page.getByRole("button", { name: "Ajustar Tomate" }).click();
  await page.getByTestId("catalogo-Tomate").getByLabel("Nome do ingrediente").fill("Ovo");
  await page.getByRole("button", { name: "Gravar 1 item" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Ovo/ })).toBeVisible();
  await expect(page.getByText(/gravados?\./)).toHaveCount(0);
});

test("colar uma lista: prévia verde, amarela e vermelha; corrige uma linha; grava só as prontas", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirRapido(page);
  await page.getByRole("tab", { name: "Colar uma lista" }).click();
  await expect(page.getByRole("button", { name: "Ler a lista" })).toBeDisabled();
  await page.getByLabel("Cole sua lista de ingredientes").fill("Alface\nLimão - saco 3 kg\nOvo; caixa com 30\nTempero da casa - pote 500 g");
  await page.getByRole("button", { name: "Ler a lista" }).click();

  await expect(page.getByTestId("resumo-da-lista")).toContainText(/1 pronta.*2 para conferir.*1 com erro/);
  await expect(page.getByTestId("linha-1")).toHaveAttribute("data-situacao", "pronto");
  await expect(page.getByTestId("linha-2")).toHaveAttribute("data-situacao", "conferir");
  await expect(page.getByTestId("linha-3")).toHaveAttribute("data-situacao", "erro");
  await expect(page.getByTestId("linha-3")).toContainText("Já está cadastrado.");
  await expect(page.getByTestId("linha-4")).toHaveAttribute("data-situacao", "conferir");
  // A linha com erro fica fora (não dá para marcar) e a do Limão pede a quantidade da embalagem.
  await expect(page.getByRole("checkbox", { name: /Linha 3/ })).toBeDisabled();
  await expect(page.getByTestId("linha-2")).toContainText("Falta a quantidade da embalagem");
  await expect(page.getByRole("button", { name: "Gravar as 2 linhas prontas" })).toBeVisible();

  // Corrige o Limão: quantidade que veio em branco. O bloco de embalagens já abre sozinho, com o aviso.
  const limao = page.getByTestId("linha-2");
  await expect(limao.getByTestId("bloco-embalagens")).toContainText("1 embalagem precisa da quantidade");
  await limao.getByLabel(/^Quantas unidades \(un\) vêm em 1 saco 3 kg/).fill("40");
  await expect(limao.getByRole("list", { name: "Embalagens colocadas" })).toContainText("= 40 un");
  await expect(limao).toHaveAttribute("data-situacao", "pronto");
  await expect(page.getByTestId("resumo-da-lista")).toContainText(/2 prontas.*1 para conferir.*1 com erro/);
  await semEstouroDeLargura(page);
  await altoDeToque(page.getByRole("button", { name: "Gravar as 3 linhas prontas" }));

  await page.getByRole("button", { name: "Gravar as 3 linhas prontas" }).click();
  await expect(page.getByText("3 ingredientes gravados. Sobrou 1 linha para corrigir.")).toBeVisible();
  // Só a linha com erro continua na tela.
  await expect(page.getByTestId("linhas-lidas").locator("> li")).toHaveCount(1);
  await expect(page.getByTestId("ingrediente-Limão")).toContainText("saco 3 kg = 40 un");
  await expect(page.getByTestId("ingrediente-Alface")).toBeVisible();
  await expect(page.getByTestId("ingrediente-Tempero da casa")).toContainText("pote 500 g = 500 g");

  // Corrigir o nome da linha com erro a libera.
  await page.getByTestId("linha-3").getByLabel("Nome do ingrediente").fill("Ovo de codorna");
  await expect(page.getByTestId("linha-3")).toHaveAttribute("data-situacao", "pronto");
  await page.getByRole("button", { name: "Gravar 1 linha pronta" }).click();
  await expect(page.getByTestId("ingrediente-Ovo de codorna")).toBeVisible();
});

test("ao digitar o nome, sugere do catálogo (teclado e leitor de tela) e preenche unidade, área e embalagens", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await abrirAdicionar(page, "Comum");
  const nome = page.getByRole("combobox", { name: "Nome" });
  await expect(nome).toHaveAttribute("aria-expanded", "false");
  await nome.pressSequentially("calabr");
  await expect(nome).toHaveAttribute("aria-expanded", "true");
  const lista = page.getByRole("listbox", { name: "Sugestões do catálogo" });
  await expect(lista.getByRole("option")).toHaveCount(1);
  await expect(lista).toContainText("Calabresa");

  // Esc fecha; seta para baixo abre e escolhe; Enter aplica.
  await nome.press("Escape");
  await expect(nome).toHaveAttribute("aria-expanded", "false");
  await nome.press("ArrowDown");
  await expect(nome).toHaveAttribute("aria-expanded", "true");
  await expect(lista.getByRole("option", { selected: true })).toContainText("Calabresa");
  await expect(nome).toHaveAttribute("aria-activedescendant", /.+/);
  await nome.press("Enter");

  await expect(nome).toHaveValue("Calabresa");
  await expect(page.getByLabel("Unidade do estoque")).toHaveValue("g");
  await expect(page.getByLabel("Área", { exact: true })).toHaveValue("cozinha");
  await expect(page.getByTestId("resumo-das-embalagens")).toHaveText("1 embalagem: Pacote 2,5 kg");
  await expect(page.getByText(/Sugestão aplicada: Calabresa/)).toBeVisible();
  await expect(lista).toBeHidden();

  // Quem já existe aparece como "já cadastrado" e não é escolhido.
  await nome.fill("");
  await nome.pressSequentially("ovo");
  const opcao = lista.getByRole("option").first();
  await expect(opcao).toContainText("já cadastrado");
  await expect(opcao).toHaveAttribute("aria-disabled", "true");
  await nome.fill("Calabresa");
  await nome.press("Escape");

  // Com o mouse (ou o dedo) também funciona; e a pessoa confirma gravando.
  await page.getByRole("button", { name: "Criar ingrediente" }).click();
  await expect(page.getByText(/Ingrediente criado/)).toBeVisible();
  await expect(page.getByTestId("ingrediente-Calabresa")).toContainText("pacote 2,5 kg = 2.500 g");
});

test("sugestão escolhida com o dedo preenche unidade em ml e área da cafeteria", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await abrirAdicionar(page, "Comum");
  const nome = page.getByRole("combobox", { name: "Nome" });
  await nome.pressSequentially("chantil");
  await page.getByRole("option", { name: /Chantilly/ }).click();
  await expect(page.getByLabel("Unidade do estoque")).toHaveValue("ml");
  await expect(page.getByLabel("Área", { exact: true })).toHaveValue("cafeteria");
  await altoDeToque(page.getByRole("button", { name: "Criar ingrediente" }));
  // Algo foi digitado: Cancelar pergunta antes de descartar.
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("alertdialog", { name: "Descartar o que foi digitado?" })).toBeVisible();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("duplicar copia tudo, deixa o nome '(cópia)' selecionado e grava um novo", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await page.getByRole("button", { name: "Duplicar Farinha de trigo", exact: true }).click();
  const janela = page.getByRole("dialog", { name: "Adicionar ingrediente" });
  await expect(janela.getByRole("tab", { name: "Comum", exact: true })).toHaveAttribute("aria-selected", "true");
  const nome = page.getByRole("combobox", { name: "Nome" });
  await expect(nome).toHaveValue("Farinha de trigo (cópia)");
  await expect(nome).toBeFocused();
  const selecao = await nome.evaluate((e: HTMLInputElement) => [e.selectionStart, e.selectionEnd, e.value.length]);
  expect(selecao).toEqual([0, "Farinha de trigo (cópia)".length, "Farinha de trigo (cópia)".length]);
  await expect(page.getByLabel("Unidade do estoque")).toHaveValue("g");
  await expect(page.getByLabel("Área", { exact: true })).toHaveValue("cozinha");
  await expect(page.getByLabel("Fornecedor")).not.toHaveValue("");
  await expect(page.getByTestId("resumo-das-embalagens")).toHaveText("1 embalagem: Saco 25 kg");

  // Digitar por cima troca o nome inteiro; o original não é tocado.
  await page.keyboard.type("Farinha integral (tela)");
  await expect(nome).toHaveValue("Farinha integral (tela)");
  await page.getByRole("button", { name: "Criar ingrediente" }).click();
  await expect(page.getByText(/Ingrediente criado/)).toBeVisible();
  await expect(page.getByTestId("ingrediente-Farinha integral (tela)")).toContainText("saco 25 kg = 25.000 g");
  await expect(page.getByTestId("ingrediente-Farinha de trigo")).toContainText("saco 25 kg = 25.000 g");
});

test("salvar e cadastrar o próximo: limpa, mantém área e unidade e volta o foco ao nome", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await abrirAdicionar(page, "Comum");
  const nome = page.getByRole("combobox", { name: "Nome" });
  await nome.fill("Canela em pó (tela)");
  await page.getByLabel("Unidade do estoque").selectOption("g");
  await page.getByLabel("Área", { exact: true }).selectOption("cafeteria");
  await page.getByRole("button", { name: "Salvar e cadastrar o próximo" }).click();

  await expect(page.getByText('Ingrediente "Canela em pó (tela)" criado. Pode cadastrar o próximo.')).toBeVisible();
  await expect(nome).toHaveValue("");
  await expect(nome).toBeFocused();
  await expect(page.getByLabel("Unidade do estoque")).toHaveValue("g");
  await expect(page.getByLabel("Área", { exact: true })).toHaveValue("cafeteria");
  await expect(page.getByTestId("ingrediente-Canela em pó (tela)")).toBeVisible();

  await nome.fill("Cravo (tela)");
  await page.getByRole("button", { name: "Salvar e cadastrar o próximo" }).click();
  await expect(page.getByTestId("ingrediente-Cravo (tela)")).toContainText("Cafeteria");
  await expect(nome).toHaveValue("");
  await semEstouroDeLargura(page);
});

test("fornecedores: máscaras de CPF, CNPJ e telefone enquanto digita", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fornecedores");
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  const doc = page.getByLabel("CPF ou CNPJ");
  await doc.pressSequentially("12345678909");
  await expect(doc).toHaveValue("123.456.789-09");
  await doc.fill("");
  await doc.pressSequentially("11222333000181");
  await expect(doc).toHaveValue("11.222.333/0001-81");
  await doc.press("Backspace");
  await expect(doc).toHaveValue("11.222.333/0001-8");

  const tel = page.getByLabel("Telefone");
  await tel.pressSequentially("1133334444");
  await expect(tel).toHaveValue("(11) 3333-4444");
  await tel.fill("");
  await tel.pressSequentially("11912345678");
  await expect(tel).toHaveValue("(11) 91234-5678");
  // Apagar um número volta ao formato de telefone fixo (10 números).
  await tel.press("Backspace");
  await expect(tel).toHaveValue("(11) 9123-4567");
  await semEstouroDeLargura(page);
});

const DADOS_ATIVA = {
  cnpj: "11222333000181",
  razaoSocial: "BOA SAFRA DISTRIBUIDORA DE ALIMENTOS LTDA",
  nomeFantasia: "Boa Safra Distribuidora",
  situacao: "ATIVA",
  ativa: true,
  endereco: "Rua das Flores, 120 - Centro - Campinas/SP - CEP 13010-000",
  telefone: "1933334444",
  email: "vendas@boasafra.exemplo.com",
};

async function interceptarCnpj(page: Page, resposta: { status: number; corpo: unknown }) {
  const pedidos: string[] = [];
  await page.route("**/api/cadastros/cnpj/*", async (rota) => {
    pedidos.push(new URL(rota.request().url()).pathname);
    await rota.fulfill({ status: resposta.status, contentType: "application/json", body: JSON.stringify(resposta.corpo) });
  });
  return pedidos;
}

test("fornecedores: buscar dados do CNPJ (sucesso), pergunta antes de trocar o que foi digitado, e grava com endereço", async ({ page }) => {
  const pedidos = await interceptarCnpj(page, { status: 200, corpo: DADOS_ATIVA });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fornecedores");
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  const botao = page.getByRole("button", { name: "Buscar dados do CNPJ" });
  await expect(botao).toHaveCount(0);

  // 14 números, mas com dígito verificador errado: o botão não aparece.
  await page.getByLabel("CPF ou CNPJ").fill("11222333000182");
  await expect(botao).toHaveCount(0);
  await page.getByLabel("CPF ou CNPJ").fill("11222333000181");
  await expect(botao).toBeVisible();
  await altoDeToque(botao);

  // O nome já digitado não é trocado sem perguntar; o telefone vazio é preenchido.
  await page.getByLabel("Nome", { exact: true }).fill("Meu apelido para a Boa Safra");
  await botao.click();
  const resultado = page.getByTestId("resultado-cnpj");
  await expect(resultado).toContainText("BOA SAFRA DISTRIBUIDORA DE ALIMENTOS LTDA");
  await expect(resultado).toContainText("Boa Safra Distribuidora");
  await expect(resultado).toContainText("ATIVA");
  await expect(resultado).toContainText("Rua das Flores, 120");
  await expect(resultado).toContainText("(19) 3333-4444");
  await expect(resultado).toContainText("vendas@boasafra.exemplo.com");
  await expect(resultado.getByRole("alert")).toHaveCount(0);
  expect(pedidos).toEqual(["/api/cadastros/cnpj/11222333000181"]);
  await resultado.getByRole("button", { name: "Usar estes dados" }).click();
  await expect(resultado).toContainText("Você já digitou: Nome");
  await resultado.getByRole("button", { name: "Manter o que digitei" }).click();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Meu apelido para a Boa Safra");
  await expect(page.getByLabel("Telefone")).toHaveValue("(19) 3333-4444");
  await expect(page.getByLabel("E-mail")).toHaveValue("vendas@boasafra.exemplo.com");
  await expect(page.getByLabel("Endereço")).toHaveValue(DADOS_ATIVA.endereco);
  await expect(resultado).toHaveCount(0);

  // Trocar pelo da Receita quando a pessoa aceita.
  await page.getByLabel("Telefone").fill("(11) 90000-0000");
  await botao.click();
  await resultado.getByRole("button", { name: "Usar estes dados" }).click();
  await expect(resultado).toContainText("Nome, Telefone");
  await resultado.getByRole("button", { name: "Trocar pelo da Receita" }).click();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Boa Safra Distribuidora");
  await expect(page.getByLabel("Telefone")).toHaveValue("(19) 3333-4444");

  await semEstouroDeLargura(page);
  await page.getByRole("button", { name: "Criar fornecedor" }).click();
  await expect(page.getByText("Fornecedor criado.")).toBeVisible();
  const cartao = page.getByTestId("fornecedor-Boa Safra Distribuidora");
  await expect(cartao).toContainText("11.222.333/0001-81");
  await expect(cartao).toContainText("Rua das Flores, 120");
});

test("fornecedores: CNPJ que não está ATIVO aparece em alerta", async ({ page }) => {
  await interceptarCnpj(page, { status: 200, corpo: { ...DADOS_ATIVA, situacao: "BAIXADA", ativa: false, nomeFantasia: null } });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fornecedores");
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  await page.getByLabel("CPF ou CNPJ").fill("11222333000181");
  await page.getByRole("button", { name: "Buscar dados do CNPJ" }).click();
  const alerta = page.getByTestId("resultado-cnpj").getByRole("alert");
  await expect(alerta).toContainText("BAIXADA");
  await expect(alerta).toContainText("não está ATIVA");
  // Sem nome fantasia, usa a razão social.
  await page.getByRole("button", { name: "Usar estes dados" }).click();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("BOA SAFRA DISTRIBUIDORA DE ALIMENTOS LTDA");
});

test("fornecedores: consulta do CNPJ fora do ar mostra a mensagem e a pessoa segue à mão", async ({ page }) => {
  await interceptarCnpj(page, {
    status: 409,
    corpo: { mensagem: "A consulta do CNPJ não respondeu agora. Preencha à mão ou tente de novo em instantes." },
  });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fornecedores");
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  await page.getByLabel("CPF ou CNPJ").fill("11222333000181");
  await page.getByRole("button", { name: "Buscar dados do CNPJ" }).click();
  await expect(page.getByTestId("resultado-cnpj")).toContainText("A consulta do CNPJ não respondeu agora");
  await expect(page.getByTestId("resultado-cnpj")).toContainText("seguir preenchendo à mão");
  await expect(page.getByRole("button", { name: "Usar estes dados" })).toHaveCount(0);
  // Segue à mão: os campos continuam livres e o cadastro grava.
  await page.getByLabel("Nome", { exact: true }).fill("Fornecedor à mão (tela)");
  // Esse CNPJ já foi gravado no teste anterior: o servidor recusa repetido, então segue sem documento.
  await page.getByLabel("CPF ou CNPJ").fill("");
  await page.getByLabel("Endereço").fill("Avenida Central, 50");
  await page.getByRole("button", { name: "Criar fornecedor" }).click();
  await expect(page.getByTestId("fornecedor-Fornecedor à mão (tela)")).toContainText("Avenida Central, 50");
});

test("fornecedores: sem internet (rede caída) também mostra mensagem simples", async ({ page }) => {
  await page.route("**/api/cadastros/cnpj/*", (rota) => rota.abort("failed"));
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fornecedores");
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  await page.getByLabel("CPF ou CNPJ").fill("11222333000181");
  await page.getByRole("button", { name: "Buscar dados do CNPJ" }).click();
  await expect(page.getByTestId("resultado-cnpj")).toContainText("Sem conexão com o servidor");
});

test("cozinheira vê a lista, mas não vê Adicionar ingrediente, Duplicar nem Buscar CNPJ", async ({ page }) => {
  await entrar(page, "cozinheira");
  await page.goto("/cadastros");
  await expect(page.getByTestId("ingrediente-Ovo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cadastro rápido" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Duplicar/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Novo ingrediente" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adicionar ingrediente" })).toHaveCount(0);
  // O servidor também recusa quem não tem a permissão (não é só esconder o botão).
  const catalogo = await page.request.get("/api/cadastros/catalogo");
  expect(catalogo.status()).toBe(403);
  const cnpj = await page.request.get("/api/cadastros/cnpj/11222333000181");
  expect(cnpj.status()).toBe(403);
});

for (const tela of [
  { nome: "celular", largura: 390, altura: 844 },
  { nome: "tablet", largura: 768, altura: 1024 },
  { nome: "computador", largura: 1280, altura: 800 },
]) {
  test(`o cadastro rápido cabe na tela do ${tela.nome} (sem estouro de largura)`, async ({ page }) => {
    await page.setViewportSize({ width: tela.largura, height: tela.altura });
    await entrar(page, "gerente.geral");
    await abrirRapido(page);
    await page.getByLabel("Corredor").selectOption("Carnes e frios");
    await page.getByRole("button", { name: "Marcar todos de Carnes e frios" }).click();
    // Cada toque troca o nome do botão para "Fechar o ajuste de...", então o próximo "Ajustar" passa a ser o primeiro.
    const ajustar = page.getByRole("button", { name: /^Ajustar / });
    while ((await ajustar.count()) > 0) await ajustar.first().click();
    await expect(page.getByRole("button", { name: /^Mostrar Embalagens/ }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Mostrar Embalagens/ }).first().click();
    await page.getByRole("button", { name: "Escolher do catálogo" }).first().click();
    await expect(page.getByRole("checkbox", { name: "Saco 25 kg" }).first()).toBeVisible();
    await semEstouroDeLargura(page);
    await altoDeToque(page.getByRole("button", { name: /^Ajustar|^Fechar o ajuste/ }), page.getByRole("tab", { name: "Colar uma lista" }), page.getByRole("button", { name: "Desmarcar tudo" }));
    await page.getByRole("tab", { name: "Colar uma lista" }).click();
    await page.getByLabel("Cole sua lista de ingredientes").fill("Farinha de trigo - saco 25 kg com um nome bem comprido para testar quebra de linha na tela do celular\nSal grosso; pacote");
    await page.getByRole("button", { name: "Ler a lista" }).click();
    await expect(page.getByTestId("linhas-lidas")).toBeVisible();
    await semEstouroDeLargura(page);
    await page.goto("/cadastros/fornecedores");
    await page.getByRole("button", { name: "Novo fornecedor" }).click();
    await page.getByLabel("CPF ou CNPJ").fill("11222333000181");
    await semEstouroDeLargura(page);
  });
}
