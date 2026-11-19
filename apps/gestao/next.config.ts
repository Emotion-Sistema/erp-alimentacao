import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@erp/interface", "@erp/dominio", "@erp/banco"],
  // Bibliotecas nativas/servidor ficam fora do empacotamento.
  serverExternalPackages: ["@node-rs/argon2", "pg", "sharp"],
  poweredByHeader: false,
};
export default config;
