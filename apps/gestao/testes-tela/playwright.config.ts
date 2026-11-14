import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

export const BANCO = "postgres://erp:erp@localhost:5432/erp_tela_teste";
const PORTA = 3100;

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
  webServer: {
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
});
