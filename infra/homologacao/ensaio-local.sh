#!/usr/bin/env bash
# Ensaio da homologação numa máquina qualquer com Docker (CI e sessão do Claude), sem tocar
# em servidor nenhum: mesma imagem, mesmo compose, mesmo Caddy, com o domínio "localhost"
# (o Caddy usa certificado próprio). Confere: migrações com papéis separados, saúde com a
# versão, HTTPS com cabeçalhos, login de verdade pelo proxy (origem e cookie Secure) e que
# o aplicativo não apaga nem muda o esquema. Uso: bash infra/homologacao/ensaio-local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
VERSAO="$(printf '%040d' 0 | tr 0 e)"   # um "commit" de mentira, 40 caracteres
TEMP="$(mktemp -d)"
trap 'ERP_VERSAO="$VERSAO" docker compose -p erp-ensaio --env-file "$TEMP/erp.env" -f infra/homologacao/compose.yml --profile ferramentas down -v >/dev/null 2>&1 || true; rm -rf "$TEMP"' EXIT
cat > "$TEMP/erp.env" <<FIM
ERP_DOMINIO=localhost
ERP_SENHA_POSTGRES=$(openssl rand -hex 24)
ERP_SENHA_DONO=$(openssl rand -hex 24)
ERP_SENHA_APP=$(openssl rand -hex 24)
ERP_SENHA_WORKER=$(openssl rand -hex 24)
ERP_CHAVE_SEGREDOS=$(openssl rand -base64 32)
FIM
compose() { ERP_VERSAO="$VERSAO" docker compose -p erp-ensaio --env-file "$TEMP/erp.env" -f infra/homologacao/compose.yml "$@"; }
falha() { echo "ENSAIO FALHOU: $*"; compose logs --tail 40 || true; exit 1; }
ok() { echo "ok: $*"; }

# ERP_CA_EXTRA: só onde a rede passa por proxy com certificado próprio (sessão do Claude).
extra=()
if [ -n "${ERP_CA_EXTRA:-}" ]; then
  extra=(--network host --build-arg HTTPS_PROXY="${HTTPS_PROXY:-}" --secret "id=ca_extra,src=$ERP_CA_EXTRA")
fi
docker build -q "${extra[@]}" -t "erp-app:$VERSAO" -f infra/homologacao/Dockerfile . >/dev/null || falha "montar a imagem"
compose up -d --wait banco
compose run --rm migrar || falha "migrações"
compose run --rm migrar >/dev/null || falha "migrações de novo (idempotente)"
ok "migrações aplicadas duas vezes com papéis separados"

sql() { compose exec -T banco psql -U postgres -d erp -tA -v ON_ERROR_STOP=1 -c "$1"; }
como_app() { compose exec -T -e PGPASSWORD="$(grep ERP_SENHA_APP "$TEMP/erp.env" | cut -d= -f2)" banco psql -h 127.0.0.1 -U erp_app -d erp -tA -v ON_ERROR_STOP=1 -c "$1"; }
como_app "SELECT count(*) FROM auditoria" >/dev/null || falha "aplicativo não lê"
como_app "DELETE FROM sessao" 2>/dev/null && falha "aplicativo conseguiu apagar"
como_app "CREATE TABLE intrusa (x int)" 2>/dev/null && falha "aplicativo conseguiu criar tabela"
como_app "SELECT * FROM migracao_aplicada" 2>/dev/null && falha "aplicativo leu o controle de migrações"
[ "$(sql "SELECT rolsuper FROM pg_roles WHERE rolname = 'erp_dono'")" = f ] || falha "dono do esquema é superusuário"
ok "aplicativo lê e grava, mas não apaga, não cria tabela e não vê as migrações"

compose run --rm -T ferramentas node_modules/.bin/tsx -e '
  import("./packages/dominio/src/index.ts").then(async (d) => {
    const { criarBanco } = await import("./packages/banco/src/index.ts");
    const db = criarBanco(undefined, 1);
    await d.prepararPrimeiroAcesso(db, { empresa: "Empresa do ensaio", unidade: "Loja do ensaio", nome: "Dono do ensaio", login: "dono.ensaio", senha: "senha-do-ensaio-123" });
    await db.destroy();
  })' || falha "primeiro acesso"
ok "primeiro acesso criou o dono"

compose up -d gestao loja site worker caddy
curlk() { curl -sk --resolve "$1:443:127.0.0.1" "${@:2}"; }
for _ in $(seq 1 60); do
  curlk gestao.localhost "https://gestao.localhost/api/saude" | grep -q "\"versao\":\"$VERSAO\"" && break
  sleep 2
done
curlk gestao.localhost "https://gestao.localhost/api/saude" | grep -q "\"versao\":\"$VERSAO\"" || falha "saúde pelo HTTPS"
ok "saúde pelo HTTPS mostra a versão"

cab="$(curlk gestao.localhost -D - -o /dev/null https://gestao.localhost/)"
echo "$cab" | grep -qi '^x-robots-tag: noindex' || falha "sem X-Robots-Tag"
echo "$cab" | grep -qi '^strict-transport-security' || falha "sem HSTS"
echo "$cab" | grep -qi '^x-powered-by' && falha "mostra X-Powered-By"
for app in loja site; do
  [ "$(curlk "$app.localhost" -o /dev/null -w '%{http_code}' "https://$app.localhost/")" = 200 ] || falha "$app não abriu"
done
[ "$(curl -s -o /dev/null -w '%{http_code}' --resolve gestao.localhost:80:127.0.0.1 http://gestao.localhost/)" = 308 ] || falha "HTTP não manda para HTTPS"
ok "cabeçalhos de segurança, loja e site no ar, HTTP vai para HTTPS"

corpo='{"login":"dono.ensaio","senha":"senha-do-ensaio-123"}'
r="$(curlk gestao.localhost -D - -o "$TEMP/resp" -H 'content-type: application/json' -H 'origin: https://gestao.localhost' -d "$corpo" https://gestao.localhost/api/sessao)"
echo "$r" | head -1 | grep -q ' 200' || { cat "$TEMP/resp"; falha "login pelo proxy"; }
echo "$r" | grep -i '^set-cookie: erp_sessao=' | grep -q 'Secure' || falha "cookie de sessão sem Secure"
grep -q '"segundoFator":"pendente"' "$TEMP/resp" || falha "dono entrou sem pedir o segundo fator"
r="$(curlk gestao.localhost -o /dev/null -w '%{http_code}' -H 'content-type: application/json' -H 'origin: https://outro-site.exemplo' -d "$corpo" https://gestao.localhost/api/sessao)"
[ "$r" = 403 ] || falha "login de outra origem não foi recusado ($r)"
ok "login pelo HTTPS: cookie Secure, segundo fator pedido, outra origem recusada"

ip="$(sql "SELECT ip FROM sessao ORDER BY criada_em DESC LIMIT 1")"
[ -n "$ip" ] || falha "IP de quem entrou não chegou pelo proxy"
ok "IP de quem entrou registrado (veio do Caddy)"

compose ps --status running --services | grep -qx worker || falha "worker parado"
sql "SELECT count(*) FROM fila.job" >/dev/null || falha "worker não criou a fila"
ok "worker de pé com a fila no esquema próprio"
echo "ENSAIO DA HOMOLOGAÇÃO: tudo certo."
