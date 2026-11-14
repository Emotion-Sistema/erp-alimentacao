#!/usr/bin/env bash
# Dentro da imagem, a cada implantação: papéis do banco, migrações e permissões
# (packages/banco/src/papeis.ts).
set -euo pipefail
cd /app/packages/banco
exec /app/node_modules/.bin/tsx src/papeis.ts
