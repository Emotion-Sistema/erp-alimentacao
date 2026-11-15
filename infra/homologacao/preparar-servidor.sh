#!/usr/bin/env bash
# Prepara a VPS de homologação (decisão 0014). Roda UMA vez, como root, chamado pelo bloco
# colar-no-terminal.txt (que já baixou o código em /opt/erp/codigo). Pode rodar de novo
# sem estragar nada: só refaz o que falta. NÃO apaga dados nem troca segredos existentes.
set -euo pipefail
RAIZ=/opt/erp
CODIGO="$RAIZ/codigo"
AQUI="$CODIGO/infra/homologacao"
passo() { echo; echo "==> $*"; }
# Nunca parar calado: qualquer falha diz onde parou.
trap 'echo; echo "PAROU com erro na linha $LINENO de preparar-servidor.sh. Tire uma foto desta tela e mande ao Claude."' ERR

[ "$(id -u)" = 0 ] || { echo "Rode como root."; exit 1; }
. /etc/os-release
[ "${ID:-}" = ubuntu ] || { echo "Este script é para Ubuntu (encontrado: ${ID:-?})."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

passo "Atualizando o sistema e instalando o básico"
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q ca-certificates curl git jq openssl ufw fail2ban unattended-upgrades

passo "Instalando o Docker"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  if curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
     && curl -fsSI "https://download.docker.com/linux/ubuntu/dists/${VERSION_CODENAME}/Release" >/dev/null; then
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -q
    apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    echo "Repositório do Docker ainda não tem o Ubuntu ${VERSION_CODENAME}; usando o pacote do próprio Ubuntu."
    rm -f /etc/apt/sources.list.d/docker.list
    apt-get install -y -q docker.io docker-compose-v2 docker-buildx
  fi
fi
systemctl enable --now docker
docker compose version

# sshd -T falha quando o SSH está em espera (ativado por socket, Ubuntu 24.04+): aí vale 22.
porta_ssh="$( (sshd -T 2>/dev/null || true) | awk '/^port /{print $2; exit}')"
porta_ssh="${porta_ssh:-22}"
passo "Firewall: só SSH (${porta_ssh}), HTTP (80) e HTTPS (443)"
ufw default deny incoming
ufw default allow outgoing
ufw allow "${porta_ssh}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
# Docker publica portas por fora do ufw: por isso só o Caddy publica (compose.yml).

passo "Proteção do SSH (bloqueia quem erra a senha muitas vezes) e atualizações de segurança automáticas"
systemctl enable --now fail2ban
systemctl enable --now unattended-upgrades

passo "Segredos do servidor (gerados aqui; nunca saem desta máquina)"
install -d -m 700 "$RAIZ/segredos"
if [ ! -f "$RAIZ/segredos/erp.env" ]; then
  ip="${ERP_IP:-$(ip -4 route get 1.1.1.1 | awk '{for (i=1;i<NF;i++) if ($i=="src") print $(i+1)}')}"
  umask 077
  cat > "$RAIZ/segredos/erp.env" <<FIM
ERP_DOMINIO=${ERP_DOMINIO:-${ip//./-}.sslip.io}
ERP_SENHA_POSTGRES=$(openssl rand -hex 24)
ERP_SENHA_DONO=$(openssl rand -hex 24)
ERP_SENHA_APP=$(openssl rand -hex 24)
ERP_SENHA_WORKER=$(openssl rand -hex 24)
ERP_CHAVE_SEGREDOS=$(openssl rand -base64 32)
FIM
  umask 022
fi
chmod 600 "$RAIZ/segredos/erp.env"
dominio="$(grep '^ERP_DOMINIO=' "$RAIZ/segredos/erp.env" | cut -d= -f2)"

# E-mail opcional para o certificado HTTPS (avisos de vencimento e reserva pela ZeroSSL).
# Fica só no servidor; nunca no Git.
install -d -m 755 "$RAIZ/caddy"
if [ ! -f "$RAIZ/caddy/email.caddy" ] && [ ! -f "$RAIZ/caddy/.sem-email" ]; then
  read -rp "E-mail para avisos do certificado HTTPS (Enter para pular): " email </dev/tty || email=""
  # Só letras, números e . _ % + -: outro caractere quebraria o arquivo do Caddy.
  if [[ "$email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
    echo "email $email" > "$RAIZ/caddy/email.caddy"
  else
    touch "$RAIZ/caddy/.sem-email"
  fi
fi

passo "Atualização automática da homologação"
install -d "$RAIZ/bin" "$RAIZ/estado" "$RAIZ/copias"
install -m 755 "$AQUI/atualizar.sh" "$RAIZ/bin/atualizar.sh"
install -m 755 "$AQUI/erp" /usr/local/bin/erp
install -m 644 "$AQUI/erp-atualizar.service" "$AQUI/erp-atualizar.timer" /etc/systemd/system/
systemctl daemon-reload

# Liga a atualização automática antes: se a primeira montagem falhar, a correção que o
# Claude juntar na main chega sozinha, sem colar nada de novo.
systemctl enable erp-atualizar.timer

passo "Primeira montagem (leva de 5 a 15 minutos)"
if ! systemctl start erp-atualizar.service; then
  journalctl -u erp-atualizar --no-pager -n 40
  systemctl start erp-atualizar.timer
  echo
  echo "A primeira montagem falhou. Tire uma foto das linhas acima e mande ao Claude."
  echo "Quando ele corrigir, o servidor tenta sozinho; depois rode: erp primeiro-acesso"
  exit 1
fi
journalctl -u erp-atualizar --no-pager -n 5
systemctl start erp-atualizar.timer

versao="$(cat "$RAIZ/estado/atual")"
pessoas="$(ERP_VERSAO="$versao" docker compose -p erp --env-file "$RAIZ/segredos/erp.env" -f "$AQUI/compose.yml" \
  exec -T banco psql -U postgres -d erp -tAc 'SELECT count(*) FROM usuario')"
if [ "$pessoas" = 0 ]; then
  passo "Seu login de dono"
  erp primeiro-acesso
fi

echo
echo "============================================================"
echo " Homologação pronta: https://gestao.$dominio"
echo " Comandos: erp situacao | erp registros | erp atualizar"
echo "============================================================"
