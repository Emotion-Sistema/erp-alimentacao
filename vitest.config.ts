import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages}/*/testes/**/*.teste.ts"],
    globalSetup: ["./scripts/testes-preparar.ts"],
    // Testes de integração usam o mesmo banco de teste: um arquivo por vez.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
