#!/usr/bin/env bash
# Sobe o ambiente de desenvolvimento com um comando: pnpm dev
# 1) usa o PostgreSQL de DATABASE_URL (ou o local padrão); se não responder, sobe o do Docker;
# 2) aplica as migrações e os dados fictícios; 3) sobe gestão, loja, site e worker.
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-postgres://erp:erp@localhost:5432/erp}"

[ -d node_modules ] || pnpm install

if ! pnpm -s banco:migrar; then
  echo "Banco não respondeu. Subindo o PostgreSQL pelo Docker..."
  docker compose up -d --wait banco
  pnpm -s banco:migrar
fi
pnpm -s banco:semente

echo
echo "Gestão: http://localhost:3000   Loja: http://localhost:3001   Site: http://localhost:3002"
echo "Entre na gestão com um usuário fictício (ex.: administrador). Senha: senha-de-teste-123"
echo
exec pnpm -r --parallel --filter './apps/*' dev
