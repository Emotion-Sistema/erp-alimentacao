import { expect, test } from "@playwright/test";
import { entrar, janelaNoCentro, janelaSemEstouro, semEstouroDeLargura } from "./ajudas";

// Tipos de produção (RC-10, decisão 0017): os 3 iniciais por área, novo tipo, editar a capacidade,
// desativar com "Desfazer" e o supervisor só lendo. Só dados fictícios.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const NOME = `Salgados tela ${Math.random().toString(36).slice(2, 7)}`;

test("gerente vê os tipos por área, cria um, edita a capacidade, desativa e desfaz", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/tipos-producao");
  await expect(page.getByRole("heading", { name: "Tipos de produção", level: 1 })).toBeVisible();
  await expect(page.getByText("Produto sem tipo não passa pela produção")).toBeVisible();

  // Os 3 iniciais, cada um na sua área, com a frase de onde sai.
  const cozinha = page.getByTestId("area-cozinha");
  const cafeteria = page.getByTestId("area-cafeteria");
  await expect(cozinha.getByRole("heading", { name: "Cozinha", level: 2 })).toBeVisible();
  await expect(cozinha).toContainText("Sai pelo elevador.");
  await expect(cafeteria).toContainText("Sai no balcão da cafeteria.");
  expect((await cozinha.locator(".hor-cat__nome").allTextContents()).slice(0, 2)).toEqual(["Hambúrgueres", "Pratos e grelhados"]);
  expect((await cafeteria.locator(".hor-cat__nome").allTextContents())[0]).toBe("Cafeteria");
  await expect(cozinha.getByTestId("tipo-Hambúrgueres")).toContainText(/Faz \d+ ao mesmo tempo/);

  // Novo tipo: nome curto recusado na tela.
  await page.getByRole("button", { name: "Novo tipo" }).click();
  const janela = page.getByRole("dialog", { name: "Novo tipo de produção" });
  await janelaNoCentro(page, janela);
  const previa = janela.getByRole("list", { name: "Como a lista vai ficar:" });
  await expect(previa).toContainText("Hambúrgueres");
  await expect(previa).toContainText("Cafeteria");
  await expect(janela.getByText("Quantos itens este tipo consegue preparar ao mesmo tempo. Usado para prever o tempo de espera.")).toBeVisible();
  await janela.getByLabel("Nome").fill("x");
  await janela.getByRole("button", { name: "Criar tipo" }).click();
  await expect(janela.getByRole("alert")).toHaveText("Escreva o nome (pelo menos 2 letras).");
  await janela.getByLabel("Nome").fill(NOME);
  await janela.getByRole("button", { name: "Criar tipo" }).click();
  await expect(janela.getByRole("alert")).toHaveText("Escolha onde é preparado: cozinha ou cafeteria.");
  await janela.getByRole("radio", { name: "Cozinha: sai pelo elevador" }).check();
  await janela.getByLabel("Quantos ao mesmo tempo").fill("3");
  // Escolhe o 1º lugar: a prévia mostra o novo no topo, e a lista da cozinha também.
  await janela.getByLabel("Posição na lista").selectOption({ index: 0 });
  await expect(previa.locator("li").first()).toContainText(`${NOME} ← este`);
  await janelaSemEstouro(page);
  await janela.getByRole("button", { name: "Criar tipo" }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Tipo ${NOME} criado.`);
  await expect(cozinha.getByTestId(`tipo-${NOME}`)).toContainText("Faz 3 ao mesmo tempo");
  expect((await cozinha.locator(".hor-cat__nome").allTextContents())[0]).toBe(NOME);

  // Nome igual a um ativo: o servidor recusa e a mensagem aparece.
  await page.getByRole("button", { name: "Novo tipo" }).click();
  const repetido = page.getByRole("dialog", { name: "Novo tipo de produção" });
  await repetido.getByLabel("Nome").fill("hamburgueres");
  await repetido.getByRole("radio", { name: "Cozinha: sai pelo elevador" }).check();
  await repetido.getByRole("button", { name: "Criar tipo" }).click();
  await expect(repetido.getByRole("alert")).toHaveText("Já existe um tipo de produção ativo com esse nome.");
  await repetido.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Descartar" }).click();

  // Editar a capacidade (a área continua a mesma).
  await page.getByRole("button", { name: `Editar ${NOME}` }).click();
  const editar = page.getByRole("dialog", { name: `Editar ${NOME}` });
  await janelaNoCentro(page, editar);
  await expect(editar.getByLabel("Nome")).toHaveValue(NOME);
  await expect(editar.getByRole("radio", { name: "Cozinha: sai pelo elevador" })).toBeChecked();
  await editar.getByLabel("Quantos ao mesmo tempo").fill("51");
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(editar.getByRole("alert")).toHaveText("Quantos ao mesmo tempo: um número inteiro de 1 a 50.");
  await editar.getByLabel("Quantos ao mesmo tempo").fill("6");
  await editar.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Tipo ${NOME} salvo.`);
  await expect(cozinha.getByTestId(`tipo-${NOME}`)).toContainText("Faz 6 ao mesmo tempo");

  // Desativar com Desfazer (nada se apaga; a capacidade fica).
  await page.getByRole("button", { name: `Desativar ${NOME}` }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Tipo ${NOME} desativado.`);
  await expect(cozinha.getByTestId(`tipo-${NOME}`)).toHaveCount(0);
  await expect(page.getByTestId("tipos-desativados").getByTestId(`tipo-${NOME}`)).toContainText("Desativado");
  await page.getByTestId("aviso-rapido").getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Pronto: ${NOME} voltou.`);
  await expect(cozinha.getByTestId(`tipo-${NOME}`)).toContainText("Faz 6 ao mesmo tempo");
  await expect(page.getByTestId("tipos-desativados")).toHaveCount(0);

  // Desativar de novo e reativar pelo botão do cartão.
  await page.getByRole("button", { name: `Desativar ${NOME}` }).click();
  await page.getByRole("button", { name: `Reativar ${NOME}` }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Tipo ${NOME} reativado.`);
  await expect(cozinha.getByTestId(`tipo-${NOME}`)).toBeVisible();
  await semEstouroDeLargura(page);
});

test("supervisor vê os tipos só para ler", async ({ page }) => {
  await entrar(page, "supervisor");
  await page.goto("/cadastros/tipos-producao");
  await expect(page.getByTestId("area-cozinha").getByTestId(`tipo-${NOME}`)).toContainText("Faz 6 ao mesmo tempo");
  await expect(page.getByRole("button", { name: "Novo tipo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Editar ${NOME}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Desativar ${NOME}` })).toHaveCount(0);
  // O servidor recusa mesmo se alguém mandar direto.
  const r = await page.request.post("/api/cadastros/tipos-producao", { data: { nome: "Proibido tela", area: "cozinha" } });
  expect(r.status()).toBe(403);
});

test("celular (390 px): lista e janela sem estouro", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/tipos-producao");
  await expect(page.getByTestId("area-cozinha")).toBeVisible();
  await semEstouroDeLargura(page);
  await page.getByRole("button", { name: "Novo tipo" }).click();
  await janelaSemEstouro(page);
});
