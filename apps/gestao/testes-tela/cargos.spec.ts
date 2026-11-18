import { expect, test } from "@playwright/test";
import { abrirConta, avisoNaTela, entrar, loginDoCargo, semEstouroDeLargura } from "./ajudas";

// Resultado esperado escrito à mão (independente do código), conforme a decisão 0011.
const TODOS = ["Caixa", "Atendimento", "Produção", "Estoque e compras", "Gestão", "Cadastros", "Financeiro"];
type Esperado = {
  nome: string;
  /** Aplicativos do lançador (cargo com mais de um). */
  apps?: string[];
  /** Cargo com um só aplicativo: cai direto nele (caminho e itens do menu). */
  direto?: { caminho: string; itens: string[] };
  funcionarios: boolean;
  auditoria: boolean;
};
const MENU: Record<string, Esperado> = {
  dono: { nome: "Dono", apps: TODOS, funcionarios: true, auditoria: true },
  administrador: { nome: "Administrador", apps: TODOS, funcionarios: true, auditoria: true },
  gerente_geral: { nome: "Gerente geral", apps: TODOS.filter((a) => a !== "Financeiro"), funcionarios: true, auditoria: true },
  financeiro: { nome: "Financeiro", apps: ["Estoque e compras", "Cadastros", "Financeiro"], funcionarios: false, auditoria: false },
  supervisor: { nome: "Supervisor", apps: ["Caixa", "Atendimento", "Produção", "Estoque e compras", "Gestão", "Cadastros"], funcionarios: true, auditoria: false },
  atendente: { nome: "Atendente", direto: { caminho: "/atendimento", itens: ["Mesas", "Meus pedidos"] }, funcionarios: false, auditoria: false },
  caixa: { nome: "Caixa", direto: { caminho: "/caixa", itens: ["Início do turno", "Mapa de mesas", "Receber", "Motoboys"] }, funcionarios: false, auditoria: false },
  cozinheira: { nome: "Cozinheira", apps: ["Produção", "Estoque e compras", "Cadastros"], funcionarios: false, auditoria: false },
  auxiliar_cozinha: { nome: "Auxiliar de cozinha", direto: { caminho: "/producao", itens: ["Visão geral"] }, funcionarios: false, auditoria: false },
  motoboy: { nome: "Motoboy próprio", direto: { caminho: "/entregas", itens: ["Minhas entregas"] }, funcionarios: false, auditoria: false },
  contador: { nome: "Contador externo", direto: { caminho: "/financeiro/contabil", itens: ["Pacote contábil"] }, funcionarios: false, auditoria: false },
};

test.use({ viewport: { width: 390, height: 844 } });

for (const [cargo, esperado] of Object.entries(MENU)) {
  test(`início e telas do cargo ${cargo}`, async ({ page }) => {
    await entrar(page, loginDoCargo(cargo), cargo === "dono" || cargo === "administrador");
    await expect(page.getByTestId("cargo-ativo")).toHaveText(esperado.nome);

    const menu = page.getByRole("navigation", { name: "Menu" }).getByRole("link");
    if (esperado.direto) {
      expect(new URL(page.url()).pathname).toBe(esperado.direto.caminho);
      expect(await menu.allTextContents()).toEqual(esperado.direto.itens);
    } else {
      expect(new URL(page.url()).pathname).toBe("/");
      expect(await menu.allTextContents()).toEqual(esperado.apps);
    }
    await semEstouroDeLargura(page);

    const telas: [string, boolean, string][] = [
      ["/funcionarios", esperado.funcionarios, "Funcionários"],
      ["/auditoria", esperado.auditoria, "Auditoria"],
    ];
    for (const [url, pode, titulo] of telas) {
      await page.goto(url);
      if (pode) {
        await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
      }
    }
    await page.goto("/minha-conta");
    await expect(page.getByRole("heading", { name: "Minha conta" })).toBeVisible();
    await semEstouroDeLargura(page);
  });
}

test("sem sessão, páginas internas levam para a entrada", async ({ page }) => {
  await page.goto("/funcionarios");
  await expect(page).toHaveURL(/\/entrar$/);
});

test("senha errada mostra a mensagem do servidor", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill("caixa");
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(avisoNaTela(page)).toBeVisible();
});

test("dono entra de novo com segundo fator já configurado (código na tela de entrada)", async ({ page }) => {
  await entrar(page, "dono", true);
  await abrirConta(page);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel("Usuário").fill("dono");
  await page.getByLabel("Senha").fill("senha-de-teste-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  // Pede o código do aplicativo (sem chegar à página inicial).
  await expect(page.getByLabel("Código do aplicativo autenticador")).toBeVisible();
  await page.getByLabel("Código do aplicativo autenticador").fill("000000");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(avisoNaTela(page)).toBeVisible();
});
