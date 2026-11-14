# Imagem única do ERP (gestão, loja, site, worker e migrações). Contexto: raiz do repositório.
# Montada no próprio servidor de homologação a partir do commit marcado (decisão 0014).
# O segredo opcional "ca_extra" só existe onde a rede passa por um proxy com certificado
# próprio (sessão do Claude); o servidor não usa.
FROM node:22-bookworm-slim AS base
ENV CI=1 NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=ca_extra,required=false,target=/run/secrets/ca_extra \
  NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra npm install -g pnpm@10.28.0 && npm cache clean --force
WORKDIR /app

FROM base AS montar
# Primeiro só a lista de dependências: muda pouco, então o download fica em cache.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=secret,id=ca_extra,required=false,target=/run/secrets/ca_extra \
  NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm build

FROM base AS final
COPY --from=montar --chown=node:node /app /app
ENV NODE_ENV=production
USER node
