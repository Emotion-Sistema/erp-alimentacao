import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Portas dos servidores de teste: PORTA_TELA troca as três (gestão, loja = +1, site = +2), para
// rodar ao lado de outro processo que já usa as de sempre (3100, 3101, 3102).
const PORTA = Number(process.env.PORTA_TELA ?? 3100);
const PORTA_LOJA = PORTA + 1;
const PORTA_SITE = PORTA + 2;
export const URL_GESTAO = `http://localhost:${PORTA}`;
export const URL_LOJA = `http://localhost:${PORTA_LOJA}`;
export const URL_SITE = `http://localhost:${PORTA_SITE}`;
// Banco dos testes de tela: dá para trocar (ex.: revisão em paralelo), mas sempre um "_teste".
export const BANCO = process.env.DATABASE_URL_TELA ?? "postgres://erp:erp@localhost:5432/erp_tela_teste";
if (!/\/[a-z0-9_]+_teste$/.test(BANCO)) throw new Error("DATABASE_URL_TELA precisa apontar para um banco terminado em _teste");

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Todos os testes usam o mesmo banco: um de cada vez e na ordem dos arquivos.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "off",
    launchOptions: {
      // Na sessão na nuvem usa o Chromium já instalado; no CI, o que o Playwright instala.
      executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
      args: ["--no-sandbox"],
    },
  },
  webServer: [
    {
      command:
        "pnpm exec tsx apps/gestao/testes-tela/preparar-banco.ts && pnpm --filter @erp/gestao build && pnpm --filter @erp/gestao exec next start -p " +
        PORTA,
      cwd: "../../..",
      env: { DATABASE_URL: BANCO, ERP_CHAVE_SEGREDOS: Buffer.alloc(32, 7).toString("base64") /* chave de mentira, só para teste */ },
      url: `http://localhost:${PORTA}/api/saude`,
      timeout: 300_000,
      reuseExistingServer: !!process.env.REUSAR_SERVIDOR,
      stdout: "ignore",
    },
    {
      command: `pnpm --filter @erp/loja build && pnpm --filter @erp/loja exec next start -p ${PORTA_LOJA}`,
      cwd: "../../..",
      url: `http://localhost:${PORTA_LOJA}/`,
      timeout: 300_000,
      reuseExistingServer: !!process.env.REUSAR_SERVIDOR,
      stdout: "ignore",
    },
    {
      command: `pnpm --filter @erp/site build && pnpm --filter @erp/site exec next start -p ${PORTA_SITE}`,
      cwd: "../../..",
      url: `http://localhost:${PORTA_SITE}/`,
      timeout: 300_000,
      reuseExistingServer: !!process.env.REUSAR_SERVIDOR,
      stdout: "ignore",
    },
  ],
});
