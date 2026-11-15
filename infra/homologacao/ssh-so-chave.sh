#!/usr/bin/env bash
# SSH do servidor só por chave (decisão 0014). O atualizador roda isto a cada minuto; só
# mexe em algo quando precisa. Desliga a entrada por senha SÓ se o root já tiver chave
# cadastrada (o responsável confirmou a entrada com a chave em 15/11/2026).
# Para voltar a aceitar senha: erp ssh-senha ligar   (e "erp ssh-senha desligar" para refazer).
set -euo pipefail
RAIZ=/opt/erp
DIR=/etc/ssh/sshd_config.d
CHAVES=/root/.ssh/authorized_keys
# "00-": o sshd fica com o PRIMEIRO valor que lê, e os arquivos desta pasta são lidos antes
# do sshd_config e em ordem alfabética (ganha de um 50-cloud-init.conf que ligue a senha).
CONF="$DIR/00-erp-so-chave.conf"
log() { echo "[erp-ssh] $*"; }

if [ -e "$RAIZ/estado/ssh-com-senha" ]; then
  # O responsável pediu senha de volta.
  if [ -e "$CONF" ]; then
    rm -f "$CONF"
    log "entrada por senha LIGADA de novo (pedido pelo comando erp ssh-senha ligar)"
    systemctl try-reload-or-restart ssh.service >/dev/null 2>&1 || true
  fi
  exit 0
fi

desejado="# Gerado pelo ERP (infra/homologacao/ssh-so-chave.sh). Para voltar: erp ssh-senha ligar
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password"
[ "$(cat "$CONF" 2>/dev/null || true)" = "$desejado" ] && exit 0

if ! grep -qE '^(ssh-(ed25519|rsa)|ecdsa-sha2-|sk-)' "$CHAVES" 2>/dev/null; then
  log "o root não tem chave SSH cadastrada; a entrada por senha continua ligada"
  exit 0
fi
[ -d "$DIR" ] || { log "pasta $DIR não existe; nada mudou"; exit 0; }

# sshd -t precisa desta pasta; com o SSH ativado por socket ela pode não existir ainda.
install -d -m 755 /run/sshd
printf '%s\n' "$desejado" > "$CONF.novo"
chmod 644 "$CONF.novo"
mv -f "$CONF.novo" "$CONF"
if ! sshd -t 2>/dev/null; then
  rm -f "$CONF"
  log "a configuração nova do SSH não passou na conferência (sshd -t); nada mudou"
  exit 1
fi
# Sessões abertas continuam; com o SSH ativado por socket, a próxima entrada já lê o novo.
systemctl try-reload-or-restart ssh.service >/dev/null 2>&1 || true
# Lê tudo antes de procurar: "grep -q" fecharia o cano cedo e o pipefail acusaria erro.
efetivo="$(sshd -T 2>/dev/null || true)"
if grep -qx 'passwordauthentication no' <<<"$efetivo"; then
  log "entrada por senha DESLIGADA: o SSH aceita só chave"
else
  log "arquivo gravado, mas não consegui confirmar com sshd -T; confira com: sshd -T | grep -i password"
fi
