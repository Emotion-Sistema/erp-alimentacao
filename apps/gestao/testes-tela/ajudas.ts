import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { BANCO } from "./playwright.config";

export const SENHA = "senha-de-teste-123";

/** Só no teste: executa SQL no banco de teste de tela. */
export function sql(comando: string): void {
  execFileSync("psql", [BANCO, "-v", "ON_ERROR_STOP=1", "-c", comando], { stdio: "pipe" });
}

/** Login da semente: o cargo com "_" trocado por ".". */
export const loginDoCargo = (cargo: string) => cargo.replace("_", ".");

export function zerarSegundoFator(login: string) {
  sql(`UPDATE usuario SET totp_segredo = NULL, totp_pendente = NULL, totp_ultimo_passo = NULL WHERE login = '${login}'`);
}

/** Entra pela tela. Dono e administrador também configuram o segundo fator, como uma pessoa faria. */
export async function entrar(page: Page, login: string, comSegundoFator = false) {
  if (comSegundoFator) zerarSegundoFator(login);
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill(login);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  if (comSegundoFator) {
    await page.waitForURL("**/segundo-fator");
    const segredo = (await page.getByTestId("segredo-2fa").textContent())!.trim();
    await expect(page.locator(".qr svg")).toBeVisible();
    const codigo = TOTP.generate({ secret: Secret.fromBase32(segredo) });
    await page.getByLabel("Código do aplicativo autenticador").fill(codigo);
    await page.getByRole("button", { name: "Confirmar" }).click();
  }
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByTestId("cargo-ativo")).toBeVisible();
}

/** Garante que a página não ficou mais larga do que a tela. */
export async function semEstouroDeLargura(page: Page) {
  const { rolagem, largura } = await page.evaluate(() => ({
    rolagem: document.documentElement.scrollWidth,
    largura: document.documentElement.clientWidth,
  }));
  expect(rolagem, `largura da página ${rolagem} maior que a tela ${largura}`).toBeLessThanOrEqual(largura);
}
