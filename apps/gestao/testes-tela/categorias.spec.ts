import { expect, test } from "@playwright/test";
import { entrar, janelaSemEstouro, semEstouroDeLargura } from "./ajudas";

// Categorias (E07 parte 2): cartões com a situação agora, nova categoria, editar, desativar com
// "Desfazer" e o horário de cada categoria por canal (a mesma grade de 7 dias da tela de horários).

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const NOME = "Sobremesas (tela)";

test("gerente cria uma categoria, dá um horário a ela no delivery, edita, desativa e desfaz", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/categorias");
  await expect(page.getByRole("heading", { name: "Categorias", level: 1 })).toBeVisible();
  // As da semente, em ordem, com a situação agora nos dois canais.
  const almoco = page.getByTestId("categoria-Almoço");
  await expect(almoco).toContainText("Ordem 20");
  await expect(almoco.getByTestId("situacao-da-categoria")).toContainText("Loja:");
  await expect(almoco.getByTestId("situacao-da-categoria")).toContainText("Delivery:");
  const nomes = await page.getByTestId("lista-categorias").locator(".hor-cat__nome").allTextContents();
  expect(nomes.slice(0, 3)).toEqual(["Cafeteria", "Almoço", "Porções"]);

  // Nova categoria (a ordem já vem sugerida depois da última).
  await page.getByRole("button", { name: "Nova categoria" }).click();
  const janela = page.getByRole("dialog", { name: "Nova categoria" });
  await expect(janela.getByLabel("Ordem no cardápio")).toHaveValue(/^\d+$/);
  await janela.getByLabel("Nome").fill("x");
  await janela.getByRole("button", { name: "Criar categoria" }).click();
  await expect(janela.getByRole("alert")).toHaveText("Escreva o nome (pelo menos 2 letras).");
  await janela.getByLabel("Nome").fill(NOME);
  await janela.getByLabel("Descrição (opcional)").fill("Doces da casa.");
  await janela.getByLabel("Ordem no cardápio").fill("70");
  await janelaSemEstouro(page);
  await janela.getByRole("button", { name: "Criar categoria" }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Categoria ${NOME} criada.`);
  const cartao = page.getByTestId(`categoria-${NOME}`);
  await expect(cartao).toContainText("Ordem 70");
  await expect(cartao).toContainText("Doces da casa.");
  await expect(cartao.getByTestId("situacao-da-categoria")).toContainText("Delivery:");

  // Mesmo nome de uma ativa: o servidor recusa e a mensagem aparece.
  await page.getByRole("button", { name: "Nova categoria" }).click();
  const repetida = page.getByRole("dialog", { name: "Nova categoria" });
  await repetida.getByLabel("Nome").fill("almoço");
  await repetida.getByRole("button", { name: "Criar categoria" }).click();
  await expect(repetida.getByRole("alert")).toHaveText("Já existe uma categoria ativa com esse nome.");
  await repetida.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Descartar" }).click();

  // Horário da categoria no delivery.
  const abrirHorario = cartao.getByRole("button", { name: `Horário de ${NOME}`, exact: true });
  await expect(abrirHorario).toHaveAttribute("aria-expanded", "false");
  await abrirHorario.click();
  await expect(abrirHorario).toHaveAttribute("aria-expanded", "true");
  await cartao.getByRole("tab", { name: "Delivery" }).click();
  await expect(cartao.getByRole("group", { name: `Horário de ${NOME} no delivery em cada dia` })).toBeVisible();
  const sabado = cartao.getByRole("group", { name: "Sábado", exact: true });
  await expect(sabado.getByRole("radio", { name: "Igual ao canal" })).toBeChecked();
  await sabado.getByRole("radio", { name: "Fechado" }).check();
  await expect(sabado.getByTestId("vale")).toContainText("Não vende");
  const domingo = cartao.getByRole("group", { name: "Domingo", exact: true });
  await domingo.getByRole("radio", { name: "Horário próprio" }).check();
  await domingo.getByLabel("Início (domingo)").fill("14:00");
  await domingo.getByLabel("Fim (domingo)").fill("18:00");
  await domingo.getByLabel("Fim (domingo)").blur();
  await expect(domingo.getByTestId("vale")).toContainText("14h às 18h");
  await cartao.getByRole("button", { name: `Salvar horário de ${NOME} no delivery` }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Horário de ${NOME} no delivery salvo.`);
  await page.reload();
  await page.getByTestId(`categoria-${NOME}`).getByRole("button", { name: `Horário de ${NOME}`, exact: true }).click();
  await page.getByTestId(`categoria-${NOME}`).getByRole("tab", { name: "Delivery" }).click();
  await expect(page.getByTestId(`categoria-${NOME}`).getByRole("group", { name: "Domingo", exact: true }).getByLabel("Início (domingo)")).toHaveValue("14:00");
  await page.getByTestId(`categoria-${NOME}`).getByRole("tab", { name: "Loja" }).click();
  await expect(page.getByTestId(`categoria-${NOME}`).getByRole("group", { name: "Domingo", exact: true }).getByRole("radio", { name: "Igual ao canal" })).toBeChecked();

  // Editar a descrição.
  await page.getByRole("button", { name: `Editar ${NOME}` }).click();
  const editar = page.getByRole("dialog", { name: `Editar ${NOME}` });
  await expect(editar.getByLabel("Nome")).toHaveValue(NOME);
  await editar.getByLabel("Descrição (opcional)").fill("Doces e tortas da casa.");
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Categoria ${NOME} salva.`);
  await expect(page.getByTestId(`categoria-${NOME}`)).toContainText("Doces e tortas da casa.");

  // Desativar com Desfazer (nada se apaga; a descrição fica).
  await page.getByRole("button", { name: `Desativar ${NOME}` }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Categoria ${NOME} desativada.`);
  await expect(page.getByTestId("lista-categorias").getByTestId(`categoria-${NOME}`)).toHaveCount(0);
  await expect(page.getByTestId(`categoria-${NOME}`)).toContainText("Desativada");
  await page.getByTestId("aviso-rapido").getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Pronto: ${NOME} voltou.`);
  await expect(page.getByTestId("lista-categorias").getByTestId(`categoria-${NOME}`)).toContainText("Doces e tortas da casa.");
  await semEstouroDeLargura(page);
});

test("supervisor vê as categorias e o horário delas só para ler", async ({ page }) => {
  await entrar(page, "supervisor");
  await page.goto("/cadastros/categorias");
  const cartao = page.getByTestId(`categoria-${NOME}`);
  await expect(cartao).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova categoria" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Editar ${NOME}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Desativar ${NOME}` })).toHaveCount(0);
  await cartao.getByRole("button", { name: `Horário de ${NOME}`, exact: true }).click();
  await expect(cartao).toContainText("Só o gerente geral, o dono e o administrador mudam horários.");
  await cartao.getByRole("tab", { name: "Delivery" }).click();
  await expect(cartao.getByRole("group", { name: "Sábado", exact: true }).getByRole("radio", { name: "Fechado" })).toBeChecked();
  await expect(cartao.getByRole("group", { name: "Sábado", exact: true }).getByRole("radio", { name: "Fechado" })).toBeDisabled();
  await expect(cartao.getByRole("button", { name: /^Salvar horário/ })).toHaveCount(0);
  // O servidor recusa mesmo se alguém mandar direto.
  const r = await page.request.post("/api/cadastros/categorias", { data: { nome: "Proibida (tela)" } });
  expect(r.status()).toBe(403);
});

test("celular (390 px): cartões e horário da categoria sem estouro", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/categorias");
  await page.getByRole("button", { name: "Horário de Almoço", exact: true }).click();
  await page.getByTestId("categoria-Almoço").getByRole("group", { name: "Terça", exact: true }).getByRole("radio", { name: "Horário próprio" }).check();
  await semEstouroDeLargura(page);
  await page.getByRole("button", { name: "Nova categoria" }).click();
  await janelaSemEstouro(page);
});
