#!/usr/bin/env bash
# Atualiza a homologação sozinho (decisão 0014). Roda no servidor a cada minuto (systemd).
# 1. Busca a branch `homologacao` (o GitHub só a avança quando o CI da main passa).
# 2. Se houver versão nova: monta a imagem, copia o banco, aplica as migrações, troca a
#    versão e confere a saúde. 3. Se algo falhar, volta para a versão anterior.
# Migração não é desfeita (são só de adicionar, skill migracao-segura); a cópia do banco
# feita antes fica em /opt/erp/copias para o caso de precisar.
set -euo pipefail
RAIZ="${ERP_RAIZ:-/opt/erp}"
CODIGO="$RAIZ/codigo"
ESTADO="$RAIZ/estado"
SEGREDOS="$RAIZ/segredos/erp.env"
# Cópias do banco têm hash de senha e sessões: só root lê.
umask 077
mkdir -p "$ESTADO"
install -d -m 700 "$RAIZ/copias"

log() { echo "[erp-atualizar] $*"; }

exec 9>"$ESTADO/trava"
flock -n 9 || { log "outra atualização em andamento"; exit 0; }

compose() { # compose <versao> <args...>
  local v="$1"; shift
  ERP_VERSAO="$v" docker compose -p erp --env-file "$SEGREDOS" -f "$CODIGO/infra/homologacao/compose.yml" "$@"
}

# SSH só por chave (ssh-so-chave.sh); um problema nele não para a atualização.
# Fora do servidor (ensaio com ERP_RAIZ) não mexe no SSH da máquina.
if [ -z "${ERP_RAIZ:-}" ]; then
  bash "$CODIGO/infra/homologacao/ssh-so-chave.sh" || log "ajuste do SSH falhou (mensagem acima)"
fi

git -C "$CODIGO" fetch --quiet origin \
  +refs/heads/main:refs/remotes/origin/main +refs/heads/homologacao:refs/remotes/origin/homologacao
novo="$(git -C "$CODIGO" rev-parse refs/remotes/origin/homologacao)"
atual="$(cat "$ESTADO/atual" 2>/dev/null || true)"
[ "$novo" = "$atual" ] && exit 0
if grep -qx "$novo" "$ESTADO/recusadas" 2>/dev/null; then exit 0; fi
# Só implanta o que está na main e só anda para a frente (nunca uma versão mais antiga
# nem um commit empurrado de fora da main).
if ! git -C "$CODIGO" merge-base --is-ancestor "$novo" refs/remotes/origin/main; then
  log "RECUSADA: $novo não está na main"; echo "$novo" >> "$ESTADO/recusadas"; exit 1
fi
if [ -n "$atual" ] && ! git -C "$CODIGO" merge-base --is-ancestor "$atual" "$novo"; then
  log "RECUSADA: $novo não vem depois da versão no ar ($atual)"; echo "$novo" >> "$ESTADO/recusadas"; exit 1
fi

tentativas="$(cat "$ESTADO/tentativas-$novo" 2>/dev/null || echo 0)"
if [ "$tentativas" -ge 3 ]; then
  log "versão $novo falhou 3 vezes; não tento mais (erp atualizar --de-novo para tentar)"
  echo "$novo" >> "$ESTADO/recusadas"
  exit 1
fi
echo $((tentativas + 1)) > "$ESTADO/tentativas-$novo"

log "versão nova $novo (no ar: ${atual:-nenhuma})"
git -C "$CODIGO" checkout --quiet --force --detach "$novo"

voltar() {
  local motivo="$1"
  log "FALHOU: $motivo"
  echo "$novo" >> "$ESTADO/recusadas"
  if [ -n "$atual" ]; then
    log "voltando para $atual"
    git -C "$CODIGO" checkout --quiet --force --detach "$atual"
    compose "$atual" up -d --remove-orphans gestao loja site worker caddy || log "não consegui voltar; veja erp registros"
  fi
  exit 1
}

# Montar a imagem pode falhar por rede: aí tenta de novo no próximo minuto (até 3 vezes).
# ERP_CA_EXTRA: só em rede com proxy de certificado próprio (ensaio na sessão do Claude).
extra=()
if [ -n "${ERP_CA_EXTRA:-}" ]; then
  extra=(--network host --build-arg HTTPS_PROXY="${HTTPS_PROXY:-}" --secret "id=ca_extra,src=$ERP_CA_EXTRA")
fi
if ! docker build --quiet "${extra[@]}" -t "erp-app:$novo" -f "$CODIGO/infra/homologacao/Dockerfile" "$CODIGO" >/dev/null; then
  log "a montagem da imagem falhou (tentativa $((tentativas + 1)) de 3)"
  [ -n "$atual" ] && git -C "$CODIGO" checkout --quiet --force --detach "$atual"
  exit 1
fi

compose "$novo" up -d --wait banco || voltar "o banco não subiu"
if [ -n "$atual" ]; then
  copia="$RAIZ/copias/antes-$(date +%Y%m%d-%H%M%S)-${novo:0:12}.dump"
  compose "$novo" exec -T banco pg_dump -U postgres -Fc erp > "$copia" || voltar "cópia do banco antes de migrar"
  ls -1t "$RAIZ"/copias/*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
fi

compose "$novo" run --rm migrar || voltar "migrações"
compose "$novo" up -d --remove-orphans gestao loja site worker caddy || voltar "subir os aplicativos"

# Saúde: a gestão responde com a versão nova e conversa com o banco; loja e site respondem.
ok=0
for _ in $(seq 1 60); do
  if compose "$novo" exec -T gestao node -e '
      fetch("http://127.0.0.1:3000/api/saude").then(r => r.json())
        .then(j => process.exit(j.ok && j.versao === process.env.ERP_VERSAO ? 0 : 1))
        .catch(() => process.exit(1))' 2>/dev/null \
    && compose "$novo" exec -T loja node -e 'fetch("http://127.0.0.1:3001/").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' 2>/dev/null \
    && compose "$novo" exec -T site node -e 'fetch("http://127.0.0.1:3002/").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' 2>/dev/null; then
    ok=1; break
  fi
  sleep 2
done
[ "$ok" = 1 ] || voltar "saúde dos aplicativos"
# Worker conferido duas vezes: um worker que reinicia em laço pode parecer de pé num instante.
compose "$novo" ps --status running --services | grep -qx worker || voltar "worker não ficou de pé"
sleep 10
compose "$novo" ps --status running --services | grep -qx worker || voltar "worker não ficou de pé"
reinicios="$(docker inspect -f '{{.RestartCount}}' "$(compose "$novo" ps -q worker)" 2>/dev/null || echo 0)"
[ "$reinicios" = 0 ] || voltar "worker reiniciou $reinicios vezes"

[ -n "$atual" ] && echo "$atual" > "$ESTADO/anterior"
echo "$novo" > "$ESTADO/atual"
rm -f "$ESTADO/tentativas-$novo"
# O próprio atualizador vem do commit novo (troca atômica: a execução de agora não é afetada).
# Só troca se o script novo for bash válido; o anterior fica guardado.
if bash -n "$CODIGO/infra/homologacao/atualizar.sh"; then
  cp -f "$RAIZ/bin/atualizar.sh" "$RAIZ/bin/atualizar.sh.anterior" 2>/dev/null || true
  install -m 755 "$CODIGO/infra/homologacao/atualizar.sh" "$RAIZ/bin/atualizar.sh.novo" && mv -f "$RAIZ/bin/atualizar.sh.novo" "$RAIZ/bin/atualizar.sh"
else
  log "atualizar.sh novo com erro de sintaxe; mantive o anterior"
fi
install -m 755 "$CODIGO/infra/homologacao/erp" "${ERP_BIN:-/usr/local/bin}/erp.novo" && mv -f "${ERP_BIN:-/usr/local/bin}/erp.novo" "${ERP_BIN:-/usr/local/bin}/erp"
# Guarda as 3 imagens mais recentes (para voltar rápido) e limpa o resto.
docker image ls erp-app --format '{{.Tag}}' | grep -vx -e "$novo" -e "${atual:-x}" | tail -n +2 | sed 's/^/erp-app:/' | xargs -r docker image rm >/dev/null 2>&1 || true
docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
log "no ar: $novo"
