import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages}/*/testes/**/*.teste.ts"],
    globalSetup: ["./scripts/testes-preparar.ts"],
    // Testes de integração usam o mesmo banco de teste: um arquivo por vez.
    fileParallelism: false,
    // Ordem dos arquivos embaralhada a cada execução: teste que depende de outro rodar antes
    // aparece cedo. Para repetir uma falha: pnpm teste --sequence.seed=<semente mostrada>.
    sequence: { shuffle: { files: true, tests: false } },
    testTimeout: 20000,
  },
});
