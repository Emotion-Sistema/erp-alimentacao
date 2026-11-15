#!/usr/bin/env bash
# SSH do servidor só por chave (decisão 0014). O atualizador roda isto a cada minuto; só
# mexe em algo quando precisa. A senha fica desligada SÓ enquanto o root tiver chave
# cadastrada: se a chave sumir, a senha volta sozinha (ninguém fica trancado do lado de fora).
# Para voltar a aceitar senha: erp ssh-senha ligar   (e "erp ssh-senha desligar" para refazer).
set -euo pipefail
RAIZ=/opt/erp
DIR=/etc/ssh/sshd_config.d
CHAVES=/root/.ssh/authorized_keys
# "00-": o sshd fica com o PRIMEIRO valor que lê, e os arquivos desta pasta são lidos antes
# do sshd_config e em ordem alfabética (ganha de um 50-cloud-init.conf que ligue a senha).
CONF="$DIR/00-erp-so-chave.conf"
umask 077
mkdir -p "$RAIZ/estado"
# Mesma trava para o atualizador e para "erp ssh-senha": um não desfaz o outro no meio.
exec 8>"$RAIZ/estado/trava-ssh"
flock -w 60 8

# Escreve no registro só quando a situação muda (o script roda a cada minuto).
avisar() {
  local ultimo="$RAIZ/estado/ssh-ultimo-aviso"
  [ "$(cat "$ultimo" 2>/dev/null || true)" = "$*" ] && return 0
  echo "[erp-ssh] $*"
  printf '%s' "$*" > "$ultimo"
}
recarregar() {
  # Com o SSH ativo, o reload aplica na hora (sessões abertas continuam). Em espera (socket),
  # não há o que recarregar: a próxima entrada já sobe com o arquivo novo.
  if systemctl is-active --quiet ssh.service 2>/dev/null; then
    systemctl reload ssh.service || echo "[erp-ssh] o reload do SSH falhou; veja: systemctl status ssh"
  fi
}
senha_de_volta() { # motivo
  if [ -e "$CONF" ]; then
    rm -f "$CONF"
    recarregar
  fi
  avisar "entrada por senha LIGADA: $1"
}

if [ -e "$RAIZ/estado/ssh-com-senha" ]; then
  senha_de_volta "pedido pelo comando erp ssh-senha ligar"
  exit 0
fi
if ! grep -qE '^(ssh-(ed25519|rsa)|ecdsa-sha2-|sk-)' "$CHAVES" 2>/dev/null; then
  senha_de_volta "o root não tem chave SSH cadastrada"
  exit 0
fi

desejado="# Gerado pelo ERP (infra/homologacao/ssh-so-chave.sh). Para voltar: erp ssh-senha ligar
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password"
[ "$(cat "$CONF" 2>/dev/null || true)" = "$desejado" ] && exit 0
[ -d "$DIR" ] || { avisar "pasta $DIR não existe; nada mudou"; exit 0; }

# Confere ANTES de pôr no lugar: uma configuração de teste com as nossas linhas na frente
# e a configuração inteira do servidor depois. Só grava se o sshd aceitar.
install -d -m 755 /run/sshd   # sshd -t precisa dela; com o SSH em espera pode não existir
teste="$(mktemp)"
trap 'rm -f "$teste" "$CONF.novo"' EXIT
printf '%s\nInclude /etc/ssh/sshd_config\n' "$desejado" > "$teste"
if ! sshd -t -f "$teste" 2>/dev/null; then
  avisar "a configuração nova do SSH não passou na conferência (sshd -t); nada mudou"
  exit 0
fi
printf '%s\n' "$desejado" > "$CONF.novo"
chmod 644 "$CONF.novo"
mv -f "$CONF.novo" "$CONF"
recarregar
# Confere o resultado para o root, como numa entrada de verdade (inclui blocos Match).
efetivo="$(sshd -T -C user=root,host=localhost,addr=127.0.0.1 2>/dev/null || true)"
if grep -qx 'passwordauthentication no' <<<"$efetivo"; then
  avisar "entrada por senha DESLIGADA: o SSH aceita só chave"
else
  avisar "arquivo gravado, mas o SSH ainda aceitaria senha para o root; confira com: sshd -T -C user=root,host=localhost,addr=127.0.0.1"
fi
