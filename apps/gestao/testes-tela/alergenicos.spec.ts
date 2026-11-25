import { expect, test, type Page } from "@playwright/test";
import { entrar, semEstouroDeLargura, sql } from "./ajudas";

// Alergênicos calculados da ficha (S1, migração 0020, decisão 0026). Um lanche com farinha (num preparo
// da casa) e leite começa "Alergênicos em conferência"; o gerente segue o link "Conferir" de cada
// ingrediente, marca na janela dele e toca em "Conferido"; a ficha passa a mostrar os selos (ícone e
// texto), sai do filtro "Alergênicos em conferência" e a versão da cozinha mostra os alergênicos.
// Na aba Alergênicos o gerente adiciona, desativa e reativa um; a cozinheira só lê. Só dados fictícios.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const SUFIXO = Math.random().toString(36).slice(2, 9).replace(/[0-9]/g, (c) => "qrstuvwxyz"[Number(c)]!);
const FARINHA = `Farinha tela ${SUFIXO}`;
const LEITE = `Leite tela ${SUFIXO}`;
const MASSA = `Massa tela ${SUFIXO}`;
const LANCHE = `Lanche alergia ${SUFIXO}`;
const OUTRO = `Suco alergia ${SUFIXO}`;
const FRUTA = `Fruta tela ${SUFIXO}`;
const NOVO = `Gergelim ${SUFIXO}`;

let idDoLanche = 0;

/** Ficha com versão 1 e os itens dados, direto no banco (o editor tem teste próprio em fichas.spec). */
function fichaPorSql(alvo: string, itens: { ingrediente?: string; preparo?: string; quantidade: string }[]) {
  sql(`INSERT INTO ficha ${alvo}`);
  const ficha = "(SELECT max(id) FROM ficha)";
  sql(`INSERT INTO ficha_versao (ficha_id, numero, rende, criada_por) SELECT ${ficha}, 1, 1, id FROM usuario WHERE login = 'gerente.geral'`);
  itens.forEach((i, k) => {
    const alvoDoItem = i.ingrediente
      ? `(SELECT id FROM ingrediente WHERE nome = '${i.ingrediente}'), NULL`
      : `NULL, (SELECT id FROM ficha WHERE nome = '${i.preparo}')`;
    sql(`INSERT INTO ficha_item (versao_id, ordem, ingrediente_id, preparo_id, quantidade) SELECT max(id), ${k + 1}, ${alvoDoItem}, ${i.quantidade} FROM ficha_versao`);
  });
  sql(`UPDATE ficha SET versao_atual_id = (SELECT max(id) FROM ficha_versao WHERE ficha_id = ${ficha}) WHERE id = ${ficha}`);
}

test.beforeAll(() => {
  sql(
    `INSERT INTO ingrediente (nome, unidade_base, unidade_exibicao, area_estoque) VALUES ('${FARINHA}', 'g', 'g', 'cozinha'), ('${LEITE}', 'ml', 'ml', 'cozinha'), ('${FRUTA}', 'g', 'g', 'cozinha')`,
  );
  sql(
    `INSERT INTO produto (nome, categoria_id, preco_centavos, ordem) SELECT n, (SELECT id FROM categoria WHERE ativo ORDER BY id LIMIT 1), 2500, 0 FROM unnest(ARRAY['${LANCHE}', '${OUTRO}']) n`,
  );
  fichaPorSql(`(tipo, nome, unidade_rendimento) VALUES ('preparo', '${MASSA}', 'g')`, [{ ingrediente: FARINHA, quantidade: "500" }]);
  fichaPorSql(`(tipo, produto_id) SELECT 'produto', id FROM produto WHERE nome = '${LANCHE}'`, [
    { preparo: MASSA, quantidade: "100" },
    { ingrediente: LEITE, quantidade: "50" },
  ]);
  fichaPorSql(`(tipo, produto_id) SELECT 'produto', id FROM produto WHERE nome = '${OUTRO}'`, [{ ingrediente: FRUTA, quantidade: "300" }]);
});

async function abrirAba(page: Page, nome: RegExp | string) {
  const aba = page.getByRole("tab", { name: nome });
  await aba.click();
  await expect(aba).toHaveAttribute("aria-selected", "true");
}

/** Segue "Conferir X" da ficha aberta, marca na janela do ingrediente e toca em Conferido. */
async function conferir(page: Page, ingrediente: string, marcas: Record<string, "Contém" | "Pode conter traços">) {
  await page.getByRole("link", { name: `Conferir ${ingrediente}` }).click();
  const janela = page.getByRole("dialog", { name: `Editar ${ingrediente}` });
  await expect(janela).toBeVisible();
  const bloco = janela.getByTestId("alergenicos-do-ingrediente");
  await expect(bloco.getByTestId("situacao-alergenicos")).toContainText("Ainda não conferido");
  for (const [alergenico, escolha] of Object.entries(marcas)) await bloco.getByRole("combobox", { name: alergenico, exact: true }).selectOption({ label: escolha });
  await expect(bloco).toContainText("Você mudou e ainda não tocou em Conferido.");
  await bloco.getByRole("button", { name: "Conferido: este ingrediente está certo" }).click();
  await expect(bloco.getByTestId("situacao-alergenicos")).toContainText("Conferido por Teste gerente geral");
  await expect(janela).toContainText("Alergênicos do ingrediente conferidos.");
  // Conferido e gravado: fechar não pergunta nada.
  await janela.getByRole("button", { name: "Fechar" }).click();
  await expect(janela).toHaveCount(0);
}

test("ficha com ingrediente não conferido fica em conferência; conferir pelo link mostra os selos", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fichas");
  const cartao = page.getByTestId(`ficha-${LANCHE}`);
  await expect(cartao.getByTestId("alergenicos-em-conferencia")).toHaveText("Alergênicos em conferência");
  await cartao.getByRole("link", { name: `Abrir a ficha de ${LANCHE}` }).click();
  await page.waitForURL(/\/cadastros\/fichas\/\d+$/);
  idDoLanche = Number(/(\d+)$/.exec(page.url())![1]);
  const bloco = page.getByTestId("bloco-alergenicos");
  await expect(bloco.getByTestId("alergenicos-a-conferir")).toContainText("Ainda não dá para garantir");
  // A farinha vem de dentro do preparo da casa: aparece também.
  await expect(bloco.getByRole("link", { name: `Conferir ${FARINHA}` })).toBeVisible();
  await expect(bloco.getByRole("link", { name: `Conferir ${LEITE}` })).toBeVisible();
  // Nunca "não contém" enquanto houver algo a conferir.
  await expect(bloco.getByTestId("alergenicos-nenhum")).toHaveCount(0);

  await conferir(page, FARINHA, { Glúten: "Contém" });
  await page.goto(`/cadastros/fichas/${idDoLanche}`);
  await expect(page.getByTestId("bloco-alergenicos").getByRole("link", { name: `Conferir ${FARINHA}` })).toHaveCount(0);
  await conferir(page, LEITE, { Leite: "Contém", Lactose: "Contém", Soja: "Pode conter traços" });

  await page.goto(`/cadastros/fichas/${idDoLanche}`);
  const depois = page.getByTestId("bloco-alergenicos");
  await expect(depois.getByTestId("alergenicos-da-ficha")).toHaveAttribute("data-situacao", "conferido");
  await expect(depois.getByTestId("contem-gluten")).toHaveText("Contém glúten");
  await expect(depois.getByTestId("contem-leite")).toHaveText("Contém leite");
  await expect(depois.getByTestId("contem-lactose")).toHaveText("Contém lactose");
  await expect(depois.getByTestId("tracos-soja")).toHaveText("Pode conter traços de soja");
  // Selo com ícone e texto (não depende só de cor).
  await expect(depois.getByTestId("contem-gluten").locator("svg")).toHaveCount(1);
  await expect(depois.getByTestId("alergenicos-em-conferencia")).toHaveCount(0);

  // Versão para a cozinha mostra os alergênicos.
  await page.getByRole("button", { name: "Versão para a cozinha" }).click();
  await expect(page.getByTestId("alergenicos-cozinha").getByTestId("contem-gluten")).toBeVisible();
  await expect(page.getByTestId("alergenicos-cozinha").getByTestId("tracos-soja")).toBeVisible();
});

test("filtro 'Alergênicos em conferência' no painel", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fichas");
  await page.getByLabel("Procurar ficha").fill("alergia");
  await expect(page.getByTestId(`ficha-${LANCHE}`)).toBeVisible();
  await page.getByLabel("Situação").selectOption({ label: "Alergênicos em conferência" });
  await expect(page.getByTestId(`ficha-${OUTRO}`)).toBeVisible();
  await expect(page.getByTestId(`ficha-${LANCHE}`)).toHaveCount(0);
  // Cartão da lista: selos compactos do lanche.
  await page.getByLabel("Situação").selectOption({ label: "Todas" });
  await expect(page.getByTestId(`ficha-${LANCHE}`).getByTestId("contem-gluten")).toBeVisible();
});

test("catálogo: adicionar, desativar e reativar (nada se apaga)", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/fichas?aba=alergenicos");
  await expect(page.getByRole("tab", { name: /^Alergênicos/ })).toHaveAttribute("aria-selected", "true");
  const lista = page.getByTestId("catalogo-de-alergenicos");
  await expect(lista.getByTestId("alergenico-gluten")).toContainText("Trigo, centeio, cevada, aveia");
  const novo = page.getByTestId("novo-alergenico");
  await novo.getByLabel("Nome do alergênico").fill(NOVO);
  await novo.getByLabel("O que entra nele").fill("Sementes e tahine.");
  const codigo = `gergelim_${SUFIXO}`;
  await expect(novo).toContainText(`Código: ${codigo}`);
  await novo.getByRole("button", { name: "Adicionar" }).click();
  const linha = lista.getByTestId(`alergenico-${codigo}`);
  await expect(linha).toContainText(NOVO);
  // Alergênico novo na lista: o lanche, conferido antes, volta a "em conferência" com o motivo.
  await page.goto(`/cadastros/fichas/${idDoLanche}`);
  const blocoDoLanche = page.getByTestId("bloco-alergenicos");
  await expect(blocoDoLanche.getByTestId("alergenicos-em-conferencia")).toBeVisible();
  await expect(blocoDoLanche.getByTestId("motivo-da-conferencia").first()).toHaveText(`conferido antes de ${NOVO} entrar na lista`);
  await page.goto("/cadastros/fichas?aba=alergenicos");
  await linha.getByRole("button", { name: `Desativar ${NOVO}` }).click();
  await expect(linha).toContainText("Desativado");
  await linha.getByRole("button", { name: `Reativar ${NOVO}` }).click();
  await expect(linha).not.toContainText("Desativado");
  await linha.getByRole("button", { name: `Editar ${NOVO}` }).click();
  await page.getByTestId(`editar-alergenico-${codigo}`).getByLabel("Nome do alergênico").fill(`${NOVO} e tahine`);
  await page.getByTestId(`editar-alergenico-${codigo}`).getByRole("button", { name: "Salvar" }).click();
  await expect(linha).toContainText(`${NOVO} e tahine`);
  // Desativado não volta para a escolha do ingrediente (a não ser que o ingrediente já o tenha).
  await linha.getByRole("button", { name: `Desativar ${NOVO} e tahine` }).click();
  await expect(linha).toContainText("Desativado");
  await page.goto("/cadastros");
  await page.getByRole("button", { name: `Editar ${FRUTA}`, exact: true }).click();
  const bloco = page.getByRole("dialog", { name: `Editar ${FRUTA}` }).getByTestId("alergenicos-do-ingrediente");
  await expect(bloco.getByRole("combobox", { name: "Glúten", exact: true })).toBeVisible();
  await expect(bloco.getByRole("combobox", { name: new RegExp(`^${NOVO}`) })).toHaveCount(0);
});

test("cozinheira vê os alergênicos e o catálogo, sem botões de mudar; celular sem rolagem de lado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, "cozinheira");
  await page.goto(`/cadastros/fichas/${idDoLanche}`);
  await expect(page.getByTestId("bloco-alergenicos").getByTestId("contem-gluten")).toBeVisible();
  await semEstouroDeLargura(page);
  await page.goto("/cadastros/fichas");
  await abrirAba(page, /^Alergênicos/);
  await expect(page.getByTestId("alergenico-gluten")).toBeVisible();
  await expect(page.getByText("Para mudar a lista, peça a quem cuida dos cadastros.")).toBeVisible();
  await expect(page.getByTestId("catalogo-de-alergenicos").getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("novo-alergenico")).toHaveCount(0);
  await semEstouroDeLargura(page);
});
