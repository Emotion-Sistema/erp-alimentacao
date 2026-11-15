import { expect, test, type Page } from "@playwright/test";
import { abrirAdicionar, entrar, semEstouroDeLargura } from "./ajudas";

// Catálogo de embalagens (ideia nº 6): aba Embalagens em Cadastros e o bloco de embalagens do
// ingrediente (recolhido, escolher do catálogo, criar nova). Roda contra o banco de tela real.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const ATACADO = "Atacado Exemplo (fictício)";
const LATICINIOS = "Laticínios Exemplo (fictício)";

async function abrirAba(page: Page) {
  await page.goto("/cadastros/embalagens");
  await expect(page.getByTestId("contagem-do-catalogo")).toContainText("no catálogo");
}

const corredor = (page: Page, titulo: RegExp) => page.locator("section.emb-corredor").filter({ has: page.getByRole("button", { name: titulo }) });

test("aba: corredores recolhíveis por tipo, cartões com selo do fornecedor e de uso", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirAba(page);
  await expect(page.getByRole("heading", { name: "Embalagens", level: 1 })).toBeVisible();
  const sacos = page.getByRole("button", { name: /^Sacos \(\d+\)$/ });
  await expect(sacos).toHaveAttribute("aria-expanded", "true");
  const cartao = page.getByTestId("modelo-Saco 25 kg");
  await expect(cartao).toBeVisible();
  await expect(cartao).toContainText("Qualquer fornecedor");
  await expect(page.getByTestId("modelo-Galão 5 L")).toContainText("volume");
  // Recolher esconde os cartões; abrir de novo mostra.
  await sacos.click();
  await expect(sacos).toHaveAttribute("aria-expanded", "false");
  await expect(cartao).toBeHidden();
  await sacos.click();
  await expect(cartao).toBeVisible();
  await semEstouroDeLargura(page);
});

test("aba: busca instantânea com realce, filtros em chips com contadores e estado vazio", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirAba(page);
  const total = Number(/(\d+) embalagens no catálogo/.exec((await page.getByTestId("contagem-do-catalogo").textContent()) ?? "")![1]);
  const busca = page.getByLabel("Procurar embalagem");
  await busca.fill("galao");
  await expect(page.getByTestId("contagem-do-catalogo")).toHaveText(`2 de ${total} embalagens`);
  await expect(page.locator("mark.emb-realce").first()).toHaveText("Galão");
  await expect(page.getByTestId("corredores").getByRole("button", { name: /^Sacos/ })).toHaveCount(0);
  // Filtro de medida com contador ao vivo (mantém a busca).
  await busca.fill("");
  const volume = page.getByRole("group", { name: "Filtrar por medida" }).getByRole("button", { name: /^Volume \d+$/ });
  const quantos = Number(((await volume.textContent()) ?? "").replace(/\D/g, ""));
  await volume.click();
  await expect(volume).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("contagem-do-catalogo")).toHaveText(`${quantos} de ${total} embalagens`);
  // Com Volume ligado, o chip "Sacos" (só peso) fica sem nada e desligado.
  await expect(page.getByRole("group", { name: "Filtrar por tipo" }).getByRole("button", { name: /^Sacos 0$/ })).toBeDisabled();
  await page.getByRole("group", { name: "Filtrar por tipo" }).getByRole("button", { name: /^Galões/ }).click();
  await expect(page.getByTestId("contagem-do-catalogo")).toHaveText(`2 de ${total} embalagens`);
  await page.getByRole("button", { name: "Limpar a busca e os filtros" }).first().click();
  await expect(page.getByTestId("contagem-do-catalogo")).toHaveText(`${total} embalagens no catálogo`);

  // Nada achado: oferece criar o que foi digitado.
  await busca.fill("saco 30 kg");
  await expect(page.getByTestId("catalogo-vazio")).toContainText("Nada achado.");
  await expect(page.getByRole("button", { name: 'Criar "saco 30 kg"' })).toBeVisible();
  await semEstouroDeLargura(page);
});

test("aba: criar com fornecedor pela busca vazia, aviso de repetido na hora e editar", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirAba(page);
  await page.getByLabel("Procurar embalagem").fill("saco 30 kg");
  await page.getByRole("button", { name: 'Criar "saco 30 kg"' }).click();
  const painel = page.getByRole("dialog", { name: "Nova embalagem" });
  await expect(painel).toBeVisible();
  // Já vem preenchido com o que foi digitado.
  await expect(painel.getByRole("button", { name: "saco", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(painel.getByLabel("Tamanho (opcional)")).toHaveValue("30");
  await expect(painel.getByLabel("Unidade do tamanho")).toHaveValue("kg");
  await painel.getByLabel("Fornecedor (opcional)").selectOption({ label: ATACADO });
  // Prévia ao vivo do cartão.
  await expect(painel.getByTestId("previa-do-modelo")).toContainText("Saco 30 kg");
  await expect(painel.getByTestId("previa-do-modelo")).toContainText(`Padrão de ${ATACADO}`);
  await painel.getByRole("button", { name: "Criar embalagem" }).click();
  await expect(painel).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText("Saco 30 kg criada no catálogo.");
  await page.getByLabel("Procurar embalagem").fill("");
  await expect(page.getByTestId(`modelo-Saco 30 kg (${ATACADO})`)).toContainText(`Padrão de ${ATACADO}`);

  // Repetido: avisa na hora e não deixa criar; para outro fornecedor pode (vira o padrão dele).
  await page.getByRole("button", { name: "Nova embalagem" }).click();
  const nova = page.getByRole("dialog", { name: "Nova embalagem" });
  await nova.getByRole("button", { name: "saco", exact: true }).click();
  await expect(nova.getByLabel("Tamanho (opcional)")).toBeFocused();
  await nova.getByLabel("Tamanho (opcional)").fill("25");
  await expect(nova.getByTestId("problema-do-painel")).toHaveText('Já existe "Saco 25 kg" para qualquer fornecedor. Mude o tipo ou o tamanho.');
  await expect(nova.getByRole("button", { name: "Criar embalagem" })).toBeDisabled();
  await nova.getByLabel("Fornecedor (opcional)").selectOption({ label: LATICINIOS });
  await expect(nova.getByTestId("problema-do-painel")).toHaveCount(0);
  await expect(nova).toContainText(`Esta vai ser o padrão de ${LATICINIOS}`);
  await expect(nova.getByRole("button", { name: "Criar embalagem" })).toBeEnabled();
  // O tipo não pode ser uma unidade (mesma regra do servidor).
  await nova.getByRole("button", { name: "Outro tipo" }).click();
  await expect(nova.getByLabel("Nome do tipo")).toBeFocused();
  await nova.getByLabel("Nome do tipo").fill("litro");
  await expect(nova.getByTestId("problema-do-painel")).toContainText("é uma unidade");
  await nova.getByRole("button", { name: "Cancelar" }).click();
  await expect(nova).toBeHidden();

  // Editar: muda o fornecedor do Fardo 12 un (não está em uso: tudo livre).
  await page.getByTestId("modelo-Fardo 12 un").getByRole("button", { name: "Editar Fardo 12 un" }).click();
  const editar = page.getByRole("dialog", { name: "Editar Fardo 12 un" });
  await expect(editar.getByLabel("Tamanho (opcional)")).toBeEnabled();
  await editar.getByLabel("Fornecedor (opcional)").selectOption({ label: LATICINIOS });
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText("Fardo 12 un salva.");
  await expect(page.getByTestId(`modelo-Fardo 12 un (${LATICINIOS})`)).toContainText(`Padrão de ${LATICINIOS}`);
});

test("aba: modelo em uso mostra os ingredientes e trava tipo e tamanho (o servidor também)", async ({ page }) => {
  await entrar(page, "gerente.geral");
  // Liga o Pacote 1 kg ao Açúcar pelo catálogo (a mesma rota que a tela usa).
  const lista = (await (await page.request.get("/api/cadastros/ingredientes")).json()) as { ingredientes: { id: number; nome: string }[] };
  const acucar = lista.ingredientes.find((i) => i.nome === "Açúcar")!;
  const modelos = (await (await page.request.get("/api/cadastros/embalagens")).json()) as { id: number; nome: string; fornecedorId: number | null }[];
  const pacote = modelos.find((m) => m.nome === "pacote 1 kg" && m.fornecedorId === null)!;
  const r = await page.request.post(`/api/cadastros/ingredientes/${acucar.id}/conversoes`, { data: { modeloId: pacote.id } });
  expect(r.status(), await r.text()).toBe(200);
  expect(((await r.json()) as { quantidadeBase: string }).quantidadeBase).toBe("1000");

  await abrirAba(page);
  const cartao = page.getByTestId("modelo-Pacote 1 kg");
  const uso = cartao.getByRole("button", { name: /^Usada em \d+ ingredientes?/ });
  await expect(uso).toHaveAttribute("aria-expanded", "false");
  await uso.click();
  await expect(cartao.getByRole("list", { name: "Ingredientes que usam Pacote 1 kg" })).toContainText("Açúcar");

  await cartao.getByRole("button", { name: "Editar Pacote 1 kg" }).click();
  const painel = page.getByRole("dialog", { name: "Editar Pacote 1 kg" });
  await expect(painel).toContainText("o tipo e o tamanho não mudam");
  await expect(painel.getByRole("button", { name: "pacote", exact: true })).toBeDisabled();
  await expect(painel.getByLabel("Tamanho (opcional)")).toBeDisabled();
  await expect(painel.getByLabel("Fornecedor (opcional)")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(painel).toBeHidden();
  // Foco volta para quem abriu.
  await expect(cartao.getByRole("button", { name: "Editar Pacote 1 kg" })).toBeFocused();
  // E o servidor recusa mudar o tamanho mesmo pedindo direto.
  const recusa = await page.request.post("/api/cadastros/embalagens", { data: { id: pacote.id, tipo: "pacote", tamanho: "2", unidade: "kg", fornecedorId: null } });
  expect(recusa.status()).toBeGreaterThanOrEqual(400);
});

test("aba: desativar com Desfazer, desativadas à parte e Reativar; nada se apaga", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrirAba(page);
  await page.getByRole("button", { name: "Desativar Balde 2 kg" }).click();
  const aviso = page.getByTestId("aviso-rapido");
  await expect(aviso).toHaveAttribute("role", "status");
  await expect(aviso).toContainText("Balde 2 kg desativada.");
  // O foco vai para o Desfazer (não se perde quando o cartão some).
  await expect(aviso.getByRole("button", { name: "Desfazer" })).toBeFocused();
  await expect(corredor(page, /^Baldes/).getByTestId("modelo-Balde 2 kg")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Desativadas \(\d+\)$/ })).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(aviso).toContainText("Pronto: Balde 2 kg voltou ao catálogo.");
  await expect(corredor(page, /^Baldes/).getByTestId("modelo-Balde 2 kg")).toBeVisible();

  // Desativa de novo e reativa pela seção das desativadas.
  await page.getByRole("button", { name: "Desativar Balde 2 kg" }).click();
  await expect(aviso).toContainText("Balde 2 kg desativada.");
  await page.getByRole("button", { name: /^Desativadas/ }).click();
  const desativada = page.getByTestId("modelo-Balde 2 kg");
  await expect(desativada).toHaveClass(/emb-cartao--inativo/);
  await expect(desativada).toContainText("desativada");
  await desativada.getByRole("button", { name: "Reativar Balde 2 kg" }).click();
  await expect(aviso).toContainText("Balde 2 kg reativada.");
  await expect(corredor(page, /^Baldes/).getByTestId("modelo-Balde 2 kg")).toBeVisible();
});

test("aba: atalhos do teclado (/, N, Esc) e movimento reduzido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await entrar(page, "gerente.geral");
  await abrirAba(page);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  await expect(page.getByLabel("Procurar embalagem")).toBeFocused();
  await page.keyboard.type("lata");
  await expect(page.getByLabel("Procurar embalagem")).toHaveValue("lata");
  // "N" digitado na busca é letra, não atalho.
  await page.keyboard.type("n");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Procurar embalagem")).toHaveValue("");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("n");
  const painel = page.getByRole("dialog", { name: "Nova embalagem" });
  await expect(painel).toBeVisible();
  expect(await painel.evaluate((d) => getComputedStyle(d).animationName)).toBe("none");
  // Foco dentro do painel, no primeiro tipo.
  await expect(painel.getByRole("button", { name: "saco", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(painel).toBeHidden();
});

for (const largura of [390, 768]) {
  test(`aba e painel cabem em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 844 });
    await entrar(page, "gerente.geral");
    await abrirAba(page);
    // No celular os corredores começam fechados (lista curta); no tablet, abertos.
    await expect(page.getByTestId("corredores").getByRole("button", { name: /^Sacos/ })).toHaveAttribute("aria-expanded", largura === 390 ? "false" : "true");
    await semEstouroDeLargura(page);
    await page.getByRole("button", { name: "Nova embalagem" }).click();
    const painel = page.getByRole("dialog", { name: "Nova embalagem" });
    await painel.getByRole("button", { name: "garrafa", exact: true }).click();
    await painel.getByLabel("Tamanho (opcional)").fill("1,5");
    await painel.getByLabel("Unidade do tamanho").selectOption("l");
    await expect(painel.getByTestId("previa-do-modelo")).toContainText("Garrafa 1,5 L");
    // Cabeça (título e fechar) e botões sempre à vista, mesmo com o campo focado.
    await expect(painel.getByRole("heading", { name: "Nova embalagem" })).toBeInViewport();
    await expect(painel.getByRole("button", { name: "Criar embalagem" })).toBeInViewport();
    const caixa = (await painel.boundingBox())!;
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura + 0.5);
    await semEstouroDeLargura(page);
    await painel.getByRole("button", { name: "Fechar" }).click();
    await expect(painel).toBeHidden();
  });
}

test("cozinheira vê o catálogo, mas não cria, não edita e o servidor recusa", async ({ page }) => {
  await entrar(page, "cozinheira");
  await abrirAba(page);
  await expect(page.getByTestId("modelo-Saco 25 kg")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova embalagem" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Editar|Desativar|Reativar) / })).toHaveCount(0);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Busca vazia sem permissão: não oferece criar.
  await page.getByLabel("Procurar embalagem").fill("tonel 200 l");
  await expect(page.getByTestId("catalogo-vazio")).toContainText("Limpe a busca ou os filtros");
  await expect(page.getByRole("button", { name: /^Criar/ })).toHaveCount(0);
  const r = await page.request.post("/api/cadastros/embalagens", { data: { tipo: "tonel", tamanho: "200", unidade: "l" } });
  expect(r.status()).toBe(403);
});

test("ingrediente novo: bloco recolhido, padrão do fornecedor no topo, escolher várias e a conta ao vivo", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await abrirAdicionar(page, "Comum");
  await page.getByRole("combobox", { name: "Nome" }).fill("Arroz (tela embalagens)");
  await page.getByLabel("Unidade do estoque").selectOption("kg");
  await page.getByLabel("Fornecedor").selectOption({ label: ATACADO });

  const bloco = page.getByTestId("bloco-embalagens");
  const mostrar = bloco.getByRole("button", { name: /^Mostrar Embalagens/ });
  await expect(bloco.getByTestId("resumo-das-embalagens")).toHaveText("Nenhuma");
  await expect(mostrar).toHaveAttribute("aria-expanded", "false");
  await expect(bloco.getByRole("button", { name: "Escolher do catálogo" })).toBeHidden();
  await mostrar.click();
  await expect(bloco.getByRole("button", { name: /^Esconder Embalagens/ })).toHaveAttribute("aria-expanded", "true");
  await bloco.getByRole("button", { name: "Escolher do catálogo" }).click();

  // Sugestões: o padrão do fornecedor do item vem primeiro, com o selo.
  const sugestoes = bloco.getByTestId("sugestoes-de-embalagem");
  await expect(sugestoes.locator("> li").first()).toContainText("Saco 30 kg");
  await expect(sugestoes.locator("> li").first()).toContainText("Padrão do fornecedor");
  // Mesma família: mostra a conta sem pedir nada; outra família: marcada "pede a quantidade".
  await expect(bloco.locator("label", { has: page.getByRole("checkbox", { name: "Saco 25 kg" }) })).toContainText("= 25 kg");
  await expect(bloco.locator("label", { has: page.getByRole("checkbox", { name: "Caixa 12 un" }) })).toContainText("pede a quantidade");

  // Escolhe várias de uma vez.
  await bloco.getByRole("checkbox", { name: "Saco 30 kg" }).check();
  await bloco.getByRole("checkbox", { name: "Saco 25 kg" }).check();
  await bloco.getByRole("checkbox", { name: "Caixa 12 un" }).check();
  const escolhidas = bloco.getByTestId("escolhidas");
  await expect(escolhidas).toContainText("Escolhidas (3)");
  await expect(escolhidas).toContainText("Saco 30 kg = 30 kg");
  await expect(escolhidas).toContainText("Saco 25 kg = 25 kg");
  const adicionar = bloco.getByRole("button", { name: "Adicionar 3 embalagens" });
  await expect(adicionar).toBeDisabled();
  await expect(bloco.getByTestId("falta-na-escolha")).toHaveText("Para adicionar, diga quantos gramas (g) vêm em 1 caixa 12 un.");
  await bloco.getByLabel("Quantos gramas (g) vêm em 1 caixa 12 un?").fill("6000");
  await expect(escolhidas).toContainText("Caixa 12 un = 6 kg");
  await adicionar.click();
  const colocadas = bloco.getByRole("list", { name: "Embalagens colocadas" });
  await expect(colocadas.locator("> li")).toHaveCount(3);
  await expect(bloco.getByTestId("resumo-das-embalagens")).toHaveText("3 embalagens: Saco 30 kg, Saco 25 kg, Caixa 12 un");

  // Trocar a unidade do estoque de família: a conta pelo nome é refeita e a digitada pede de novo.
  await page.getByLabel("Unidade do estoque").selectOption("un");
  await expect(bloco).toContainText("2 embalagens precisam da quantidade");
  await expect(bloco.getByTestId("colocada-caixa 12 un")).toContainText("= 12 un");
  await page.getByLabel("Unidade do estoque").selectOption("kg");
  await expect(bloco.getByTestId("colocada-saco 25 kg")).toContainText("= 25 kg");
  await bloco.getByLabel("Quantos gramas (g) vêm em 1 caixa 12 un?").fill("6000");
  await bloco.getByRole("button", { name: "Tirar embalagem saco 25 kg" }).click();
  await expect(bloco.getByTestId("resumo-das-embalagens")).toHaveText("2 embalagens: Saco 30 kg, Caixa 12 un");

  await page.getByRole("button", { name: "Criar ingrediente" }).click();
  await expect(page.getByText(/Ingrediente criado/)).toBeVisible();
  const item = page.getByTestId("ingrediente-Arroz (tela embalagens)");
  await expect(item).toContainText("saco 30 kg = 30 kg");
  await expect(item).toContainText("caixa 12 un = 6 kg");
  await semEstouroDeLargura(page);
});

test("ingrediente existente: 'Criar nova embalagem' no bloco grava no catálogo, já marca e liga pelo modeloId", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await page.getByRole("button", { name: "Editar Arroz (tela embalagens)", exact: true }).click();
  const bloco = page.getByTestId("bloco-embalagens");
  // Gravado, vem em ordem de nome.
  await expect(bloco.getByTestId("resumo-das-embalagens")).toHaveText("2 embalagens: Caixa 12 un, Saco 30 kg");
  await bloco.getByRole("button", { name: /^Mostrar Embalagens/ }).click();
  await bloco.getByRole("button", { name: "Criar nova embalagem" }).click();
  const painel = page.getByRole("dialog", { name: "Nova embalagem" });
  // O fornecedor do item já vem escolhido.
  await expect(painel.getByLabel("Fornecedor (opcional)")).toHaveValue(/\d+/);
  await expect(painel.getByTestId("previa-do-modelo")).toHaveCount(0);
  await painel.getByRole("button", { name: "pacote", exact: true }).click();
  await painel.getByLabel("Tamanho (opcional)").fill("2");
  // Enter no painel grava o painel, não o formulário do ingrediente atrás.
  await painel.getByLabel("Tamanho (opcional)").press("Enter");
  await expect(painel).toBeHidden();
  await expect(bloco.getByRole("checkbox", { name: "Pacote 2 kg" })).toBeChecked();
  await expect(bloco.getByTestId("escolhidas")).toContainText("Pacote 2 kg = 2 kg");
  await expect(page.getByText("Ingrediente salvo.")).toHaveCount(0);
  await bloco.getByRole("button", { name: "Adicionar 1 embalagem" }).click();
  await expect(bloco.getByText("1 embalagem adicionada.")).toBeVisible();
  await expect(page.getByTestId("ingrediente-Arroz (tela embalagens)")).toContainText("pacote 2 kg = 2 kg");

  // Gravou ligado ao modelo do catálogo (modeloId), com a conta feita pelo servidor.
  const lista = (await (await page.request.get("/api/cadastros/ingredientes")).json()) as {
    ingredientes: { nome: string; conversoes: { nome: string; quantidadeBase: string; modeloId: number | null }[] }[];
  };
  const conv = lista.ingredientes.find((i) => i.nome === "Arroz (tela embalagens)")!.conversoes.find((c) => c.nome === "pacote 2 kg")!;
  expect(conv.quantidadeBase).toBe("2000");
  expect(conv.modeloId).toEqual(expect.any(Number));
  const modelos = (await (await page.request.get("/api/cadastros/embalagens")).json()) as { id: number; nome: string; fornecedor: string | null; emUso: number }[];
  const criado = modelos.find((m) => m.id === conv.modeloId)!;
  expect(criado).toMatchObject({ nome: "pacote 2 kg", fornecedor: ATACADO, emUso: 1 });

  // Outra família no ingrediente gravado: pede a quantidade e manda junto do modeloId.
  await bloco.getByRole("button", { name: "Escolher do catálogo" }).click();
  await bloco.getByRole("checkbox", { name: "Fardo 6 un" }).check();
  await bloco.getByLabel("Quantos gramas (g) vêm em 1 fardo 6 un?").fill("3000");
  await bloco.getByRole("button", { name: "Adicionar 1 embalagem" }).click();
  await expect(page.getByTestId("ingrediente-Arroz (tela embalagens)")).toContainText("fardo 6 un = 3 kg");
});

test("lista: 'Adicionar embalagem' abre o ingrediente com o bloco já aberto", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros");
  await abrirAdicionar(page, "Comum");
  await page.getByRole("combobox", { name: "Nome" }).fill("Sal grosso (tela embalagens)");
  await page.getByRole("button", { name: "Criar ingrediente" }).click();
  await expect(page.getByText(/Ingrediente criado/)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Adicionar embalagem a Sal grosso (tela embalagens)" }).click();
  await expect(page.getByTestId("bloco-embalagens").getByRole("button", { name: /^Esconder Embalagens/ })).toBeVisible();
  await expect(page.getByTestId("bloco-embalagens").getByRole("button", { name: "Escolher do catálogo" })).toBeVisible();
});

// Capturas para o responsável conferir (só quando pedidas: CAPTURAS_EMBALAGENS=<pasta>).
test.describe("capturas", () => {
  test.skip(!process.env.CAPTURAS_EMBALAGENS, "só com CAPTURAS_EMBALAGENS");
  const pasta = process.env.CAPTURAS_EMBALAGENS ?? "";
  const salvar = (page: Page, nome: string, inteira = false) => page.screenshot({ path: `${pasta}/opus-${nome}.png`, fullPage: inteira });

  for (const largura of [1280, 390]) {
    test(`capturas ${largura}`, async ({ browser }) => {
      const contexto = await browser.newContext({ viewport: { width: largura, height: largura === 390 ? 844 : 900 }, deviceScaleFactor: 2, locale: "pt-BR", baseURL: "http://localhost:3100" });
      const page = await contexto.newPage();
      await entrar(page, "gerente.geral");
      await abrirAba(page);
      await salvar(page, `aba-${largura}`, true);
      if (largura === 1280) {
        await page.getByLabel("Procurar embalagem").fill("saco");
        await page.getByRole("group", { name: "Filtrar por fornecedor" }).getByRole("button", { name: /^Qualquer fornecedor/ }).click();
        await salvar(page, "busca-filtro-1280");
        await page.getByRole("button", { name: "Limpar a busca e os filtros" }).first().click();
      }
      await page.getByRole("button", { name: "Nova embalagem" }).click();
      const painel = page.getByRole("dialog", { name: "Nova embalagem" });
      await painel.getByRole("button", { name: "galão", exact: true }).click();
      await painel.getByLabel("Tamanho (opcional)").fill("2,5");
      await painel.getByLabel("Unidade do tamanho").selectOption("l");
      await painel.getByLabel("Fornecedor (opcional)").selectOption({ label: ATACADO });
      await salvar(page, `painel-nova-${largura}`);
      await page.keyboard.press("Escape");

      await page.goto("/cadastros");
      await page.getByRole("button", { name: "Editar Arroz (tela embalagens)", exact: true }).click();
      const bloco = page.getByTestId("bloco-embalagens");
      if (largura === 1280) {
        await bloco.evaluate((e) => e.scrollIntoView({ block: "center" }));
        await salvar(page, "ingrediente-recolhido-1280");
      }
      await bloco.getByRole("button", { name: /^Mostrar Embalagens/ }).click();
      await bloco.getByRole("button", { name: "Escolher do catálogo" }).click();
      await bloco.getByRole("checkbox", { name: "Saco 50 kg" }).check();
      await bloco.getByRole("checkbox", { name: "Pacote 5 kg" }).check();
      await bloco.getByRole("checkbox", { name: "Bandeja 30 un" }).check();
      await bloco.getByTestId("escolhidas").scrollIntoViewIfNeeded();
      await salvar(page, `escolhendo-${largura}`);
      await contexto.close();
    });
  }
});
