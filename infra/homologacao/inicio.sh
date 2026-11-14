#!/usr/bin/env bash
# Início do preparo da homologação (decisão 0014). Chega ao servidor pela linha única de
# colar-no-terminal.txt (este arquivo em base64, para o terminal do navegador não estragar).
set -euo pipefail
apt-get update -q && apt-get install -y -q git curl jq ca-certificates openssh-client
install -d -m 700 /opt/erp/chave
[ -f /opt/erp/chave/id_ed25519 ] || ssh-keygen -q -t ed25519 -N "" -C "erp-homologacao-somente-leitura" -f /opt/erp/chave/id_ed25519
curl -fsS https://api.github.com/meta | jq -r '.ssh_keys[] | "github.com " + .' > /opt/erp/chave/known_hosts
export GIT_SSH_COMMAND="ssh -i /opt/erp/chave/id_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=/opt/erp/chave/known_hosts -o StrictHostKeyChecking=yes"
REPO=git@github.com:Emotion-Sistema/erp-alimentacao.git
if ! git ls-remote "$REPO" >/dev/null 2>&1; then
  echo; echo "=== COPIE a linha abaixo (começa com ssh-ed25519) e cole no GitHub ==="; echo
  cat /opt/erp/chave/id_ed25519.pub
  echo; echo "GitHub > repositório > Settings > Deploy keys > Add deploy key. NÃO marque 'Allow write access'."
  until git ls-remote "$REPO" >/dev/null 2>&1; do
    read -rp "Depois de salvar a chave no GitHub, aperte Enter aqui... " _ </dev/tty
  done
fi
echo "Acesso ao GitHub: ok (só leitura)."
until git ls-remote --exit-code "$REPO" homologacao >/dev/null 2>&1; do
  read -rp "A versão de testes ainda não foi marcada no GitHub (o Claude avisa quando). Aperte Enter para conferir de novo... " _ </dev/tty
done
[ -d /opt/erp/codigo/.git ] || git clone -q --branch homologacao "$REPO" /opt/erp/codigo
git -C /opt/erp/codigo config core.sshCommand "$GIT_SSH_COMMAND"
git -C /opt/erp/codigo fetch -q origin +refs/heads/main:refs/remotes/origin/main
bash /opt/erp/codigo/infra/homologacao/preparar-servidor.sh
