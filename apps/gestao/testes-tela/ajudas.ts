import { execFileSync } from "node:child_process";
import { expect, type Locator, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { APLICATIVOS } from "../../../packages/dominio/src/aplicativos";
import { BANCO } from "./playwright.config";

export const SENHA = "senha-de-teste-123";

/** Só no teste: executa SQL no banco de teste de tela. */
export function sql(comando: string): void {
  execFileSync("psql", [BANCO, "-v", "ON_ERROR_STOP=1", "-c", comando], {
    stdio: "pipe",
  });
}

/** Login da semente: o cargo com "_" trocado por ".". */
export const loginDoCargo = (cargo: string) => cargo.replace("_", ".");

export function zerarSegundoFator(login: string) {
  sql(
    `UPDATE usuario SET totp_segredo = NULL, totp_pendente = NULL, totp_ultimo_passo = NULL WHERE login = '${login}'`,
  );
}

/** Caminhos onde a pessoa pode cair ao entrar: o lançador ("/") ou a tela do seu único aplicativo. */
const PAGINAS_INICIAIS = new Set([
  "/",
  ...APLICATIVOS.flatMap((a) => a.itens.map((i) => i.caminho)),
]);

/** Espera a pessoa chegar ao início: o lançador, ou a tela do aplicativo se o cargo tem só um. */
export async function aguardarInicio(page: Page) {
  await page.waitForURL((u) => PAGINAS_INICIAIS.has(u.pathname));
  await expect(page.getByTestId("cargo-ativo")).toBeVisible();
}

/**
 * Trocar cargo, tela cheia, minha conta e sair ficam na conta: gaveta no celular, janela pequena no
 * computador (decisão 0028). Abre quando o botão da conta está à vista.
 */
export async function abrirConta(page: Page) {
  const botao = page.getByRole("button", { name: /^Conta de / });
  if (await botao.isVisible()) {
    await botao.click();
    await expect(page.locator("#casca-conta")).toBeVisible();
  }
}

/**
 * Nomes de tudo que o menu oferece. No computador, o trilho de ícones (decisão 0028). No celular (18/11/2026), a barra
 * de baixo mais a gaveta "Mais" (abre, lê e fecha); no lançador do celular não há barra: valem os
 * cartões dos aplicativos. A ordem da barra pode ser outra (as mais usadas primeiro).
 */
export async function nomesDoMenu(page: Page): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: "Menu" });
  if ((await nav.count()) === 0)
    return page.locator(".erp-ladrilho__titulo").allTextContents();
  // Na barra, o nome curto aparece e o nome inteiro fica no aria-label.
  const nomes = await nav
    .getByRole("link")
    .evaluateAll((els) =>
      els.map((e) =>
        (e.getAttribute("aria-label") ?? e.textContent ?? "").trim(),
      ),
    );
  const mais = page.locator('button[popovertarget="barra-mais"]');
  if (await mais.isVisible()) {
    await mais.click();
    await expect(page.locator("#barra-mais")).toBeVisible();
    nomes.push(
      ...(
        await page.locator("#barra-mais .barra__mais-item").allTextContents()
      ).map((t) => t.trim()),
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("#barra-mais")).toBeHidden();
  }
  return nomes;
}

/** Entra pela tela. Dono e administrador também configuram o segundo fator, como uma pessoa faria. */
export async function entrar(
  page: Page,
  login: string,
  comSegundoFator = false,
) {
  if (comSegundoFator) zerarSegundoFator(login);
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill(login);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  if (comSegundoFator) {
    await page.waitForURL("**/segundo-fator");
    const segredo = (await page
      .getByTestId("segredo-2fa")
      .textContent())!.trim();
    await expect(page.locator(".qr svg")).toBeVisible();
    const codigo = TOTP.generate({ secret: Secret.fromBase32(segredo) });
    await page.getByLabel("Código do aplicativo autenticador").fill(codigo);
    await page.getByRole("button", { name: "Confirmar" }).click();
  }
  await aguardarInicio(page);
}

/**
 * Aviso de erro ou sucesso da página (role="alert"). Deixa de fora o anunciador de troca de
 * página do Next (`#__next-route-announcer__`), que também é role="alert" e aparece depois de
 * uma navegação: sem isso, `getByRole("alert")` acha dois e o teste falha por acaso.
 */
export const avisoNaTela = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

/**
 * A janela (dialog) abre no lugar certo (o responsável viu deslocada em 17/11/2026). No visual Balcão
 * (decisão 0028) ela é uma gaveta: encostada na direita, da altura da tela inteira. O nome ficou o
 * mesmo para não mexer em todos os testes.
 */
export async function janelaNoCentro(page: Page, janela: Locator) {
  const tela = page.viewportSize()!;
  // Espera a animação de entrada terminar (ela desliza alguns pixels).
  await expect
    .poll(
      async () => {
        const c = (await janela.boundingBox())!;
        const direita = Math.abs(tela.width - (c.x + c.width));
        const alto = Math.abs(c.y);
        const altura = Math.abs(tela.height - c.height);
        return Math.max(direita, alto, altura);
      },
      { message: "janela em gaveta, encostada na direita e da altura da tela" },
    )
    .toBeLessThanOrEqual(2);
}
/** Nome novo e certo para a mesma conferência (a janela agora é gaveta). */
export const janelaEmGaveta = janelaNoCentro;

/** Garante que a página não ficou mais larga do que a tela. */
export async function semEstouroDeLargura(page: Page) {
  const { rolagem, largura } = await page.evaluate(() => ({
    rolagem: document.documentElement.scrollWidth,
    largura: document.documentElement.clientWidth,
  }));
  expect(
    rolagem,
    `largura da página ${rolagem} maior que a tela ${largura}`,
  ).toBeLessThanOrEqual(largura);
}

/**
 * Tela de Ingredientes: abre a janela "Adicionar ingrediente" (botão no topo da lista) na aba pedida.
 * Rápido = catálogo pronto e lista colada; Comum = um ingrediente por vez.
 */
export async function abrirAdicionar(page: Page, aba: "Rápido" | "Comum") {
  await expect(page.getByTestId("lista-ingredientes")).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar ingrediente", exact: true })
    .click();
  const janela = page.getByRole("dialog", { name: "Adicionar ingrediente" });
  await expect(janela).toBeVisible();
  await janelaNoCentro(page, janela);
  const guia = janela.getByRole("tab", { name: aba, exact: true });
  await guia.click();
  await expect(guia).toHaveAttribute("aria-selected", "true");
  return janela;
}

/** Nada dentro da janela aberta passa da largura dela (a rolagem é só para baixo) e a janela cabe na tela. */
export async function janelaSemEstouro(page: Page) {
  const r = await page.locator("dialog.janela[open]").evaluate((d) => {
    const corpo = d.querySelector<HTMLElement>(".janela__corpo")!;
    const cabeca = d.querySelector<HTMLElement>(".janela__cabeca")!;
    // Para a mensagem de erro: o elemento que passa da borda direita do corpo.
    const limite = corpo.getBoundingClientRect().right;
    const culpado = Array.from(corpo.querySelectorAll<HTMLElement>("*")).find(
      (e) =>
        e.getClientRects().length &&
        e.getBoundingClientRect().right > limite + 0.5,
    );
    return {
      culpado: culpado
        ? `${culpado.tagName}.${culpado.className} "${(culpado.textContent ?? "").slice(0, 40)}"` +
          ` ${(() => {
            const c: string[] = [];
            for (
              let e: HTMLElement | null = culpado;
              e && e !== corpo;
              e = e.parentElement
            ) {
              const r = e.getBoundingClientRect();
              c.push(
                `${e.tagName}.${e.className}[${Math.round(r.left)}-${Math.round(r.right)} w${e.scrollWidth}/${e.clientWidth}]`,
              );
            }
            return c.join(" < ");
          })()}`
        : "",
      corpo: [corpo.scrollWidth, corpo.clientWidth],
      cabeca: [cabeca.scrollWidth, cabeca.clientWidth],
      // A janela em si nunca rola (só o corpo): senão o cabeçalho e o Fechar sairiam da tela.
      altura: [d.scrollHeight, d.clientHeight],
      janela: d.getBoundingClientRect().width,
      tela: document.documentElement.clientWidth,
    };
  });
  expect(
    r.corpo[0],
    `conteúdo da janela ${r.corpo[0]} maior que ${r.corpo[1]} (${r.culpado})`,
  ).toBeLessThanOrEqual(r.corpo[1]!);
  expect(
    r.cabeca[0],
    `cabeçalho da janela ${r.cabeca[0]} maior que ${r.cabeca[1]}`,
  ).toBeLessThanOrEqual(r.cabeca[1]!);
  expect(
    r.altura[0],
    `a janela rola sozinha (${r.altura[0]} > ${r.altura[1]})`,
  ).toBeLessThanOrEqual(r.altura[1]!);
  expect(r.janela).toBeLessThanOrEqual(r.tela);
}
