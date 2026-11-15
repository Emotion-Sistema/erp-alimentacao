import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Dinheiro nunca em float: proibir parseFloat no código (use centavos inteiros).
      "no-restricted-globals": ["error", { name: "parseFloat", message: "Dinheiro em centavos inteiros: não use parseFloat." }],
    },
  },
);
