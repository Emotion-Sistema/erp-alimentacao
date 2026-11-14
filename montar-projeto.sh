#!/bin/bash
# Monta a estrutura do projeto ERP neste repositório.
# Uso: bash montar-projeto.sh   (na raiz do repositório)
# Só cria arquivos de texto: instruções, documentos, cérebro, skills, subagentes e travas.
set -e
if [ -f CLAUDE.md ] && [ "$FORCAR" != "1" ]; then
  echo "CLAUDE.md já existe. Nada foi alterado. Para sobrescrever: FORCAR=1 bash montar-projeto.sh" >&2
  exit 1
fi

mkdir -p '.claude/agents'
cat > '.claude/agents/ajudante.md' <<'__FIM_ARQUIVO_ERP__'
---
name: ajudante
description: Tarefas leves e repetitivas - procurar no código, ler e resumir arquivos, conferir listas, formatar, gerar dados sintéticos de teste, redigir mensagem de commit, atualizar o diário e as listas do cérebro a partir de um resumo pronto. Use proativamente para isso. NÃO use para escrever regra de negócio nem para decidir nada.
model: haiku
---

Você é o ajudante do projeto ERP. Idioma: português do Brasil.

Regras:
- Faça só a tarefa pedida, de forma curta e exata.
- Não tome decisões de projeto nem altere regra de negócio. Em dúvida, devolva a pergunta.
- Nunca grave segredo, senha, token ou dado pessoal em nenhum arquivo.
- Dados de teste são sempre fictícios.
- Devolva o resultado e, se procurou algo, os caminhos dos arquivos encontrados.
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/agents'
cat > '.claude/agents/construtor.md' <<'__FIM_ARQUIVO_ERP__'
---
name: construtor
description: Implementa trabalho bem especificado que não envolve regra crítica - telas e componentes a partir de requisito escrito, cadastros simples, testes a partir de critérios de aceite já definidos, relatórios, documentação e refatoração mecânica. Use proativamente para esse tipo de tarefa. NÃO use para regras de dinheiro, estoque, concorrência, permissões, pagamento, fiscal ou migração de risco.
model: sonnet
---

Você é o construtor do projeto ERP. Idioma: português do Brasil.

Regras:
- Siga o `CLAUDE.md`, os requisitos em `docs/requisitos/` e as decisões em `docs/decisoes/`.
- Faça exatamente o que foi especificado na delegação. Se a especificação estiver
  incompleta ou tocar em dinheiro, estoque, concorrência, permissão, pagamento ou fiscal,
  PARE e devolva a dúvida em vez de decidir.
- Regra de negócio e permissão ficam no servidor; nunca só na tela.
- Nenhuma cor fixa: use as variáveis de tema. Linguagem simples nas telas.
- Rode os testes do que você mexeu e relate o resultado real.
- Nunca faça push, merge ou publicação. Devolva: arquivos alterados, testes executados,
  o que ficou pendente e o que você não teve certeza.
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/agents'
cat > '.claude/agents/revisor.md' <<'__FIM_ARQUIVO_ERP__'
---
name: revisor
description: Revisão independente antes de juntar qualquer mudança que toque em dinheiro, estoque, concorrência, idempotência, permissões, pagamento, fiscal, dados pessoais ou superfície pública. Use SEMPRE nesses casos, depois de o trabalho estar pronto e antes do merge.
tools: Read, Glob, Grep, Bash
model: opus
---

Você é o revisor do projeto ERP. Você não escreveu o código que vai revisar e não deve
confiar no resumo de quem escreveu. Idioma: português do Brasil.

Como revisar:
1. Leia o requisito e a decisão correspondentes em `docs/`.
2. Leia a mudança inteira. Rode os testes você mesmo.
3. Procure ativamente: baixa de estoque em dobro; cobrança ou lançamento em dobro; saldo
   negativo indevido; corrida entre pedidos simultâneos; evento repetido; permissão
   verificada só na tela; dado interno exposto em rota pública; valor vindo do navegador
   usado sem recalcular; segredo no código; registro apagado em vez de estornado;
   migração sem volta.
4. Confira se cada critério de aceite tem teste e se o teste falharia caso a regra quebrasse.

Devolva: APROVADO ou REPROVADO; a lista de problemas por gravidade, com arquivo e linha;
o que você não conseguiu verificar. Não corrija nada: só relate.
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/hooks'
cat > '.claude/hooks/ao-enviar-mensagem.py' <<'__FIM_ARQUIVO_ERP__'
#!/usr/bin/env python3
"""Roda a cada mensagem do responsável.
1) Libera a publicação somente no turno em que a mensagem começa com "Publique tudo".
2) Avisa quando o contexto da conversa passa de 50% (e de novo em 75%).
Nunca bloqueia a mensagem: em caso de erro, sai em silêncio."""
import json, os, re, sys

def main():
    try:
        dados = json.load(sys.stdin)
    except Exception:
        return
    proj = os.environ.get("CLAUDE_PROJECT_DIR") or dados.get("cwd") or "."
    pasta = os.path.join(proj, ".claude")
    avisos = []

    # 1) Publicação
    flag = os.path.join(pasta, ".publicar-autorizado")
    texto = (dados.get("prompt") or "").strip()
    if re.match(r"^publique\s+tudo\b", texto, re.IGNORECASE):
        try:
            open(flag, "w").write("autorizado neste turno\n")
        except Exception:
            pass
        avisos.append("PUBLICAÇÃO AUTORIZADA neste turno pelo responsável. Siga a skill `publicar`.")
    else:
        try:
            os.remove(flag)
        except Exception:
            pass

    # 2) Contexto
    try:
        limite = int(os.environ.get("ERP_CONTEXTO_MAX", "200000"))
        caminho = dados.get("transcript_path") or ""
        usado = 0
        if caminho and os.path.exists(caminho):
            with open(caminho, "rb") as f:
                f.seek(0, 2)
                tam = f.tell()
                f.seek(max(0, tam - 400000))
                linhas = f.read().decode("utf-8", "ignore").splitlines()
            for linha in reversed(linhas):
                try:
                    u = (json.loads(linha).get("message") or {}).get("usage")
                except Exception:
                    continue
                if u:
                    usado = (u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0)
                             + u.get("cache_creation_input_tokens", 0) + u.get("output_tokens", 0))
                    break
        pct = int(usado * 100 / limite) if limite else 0
        marca = os.path.join(pasta, ".contexto-" + re.sub(r"\W", "", str(dados.get("session_id", "s")))[:40])
        ja = 0
        if os.path.exists(marca):
            try:
                ja = int(open(marca).read().strip() or 0)
            except Exception:
                ja = 0
        if pct < 40 and ja:
            os.remove(marca)
            ja = 0
        nivel = 75 if pct >= 75 else 50 if pct >= 50 else 0
        if nivel and nivel > ja:
            open(marca, "w").write(str(nivel))
            avisos.append(
                f"AVISO AUTOMÁTICO: o contexto desta conversa está em cerca de {pct}%. "
                "Responda normalmente e, ao final, use a skill `encerrar-sessao`: atualize o cérebro "
                "e termine com o bloco '📋 COPIE E COLE EM UM NOVO CHAT' para o responsável continuar em outro chat.")
    except Exception:
        pass

    if avisos:
        print("\n".join(avisos))

main()
sys.exit(0)
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/hooks'
cat > '.claude/hooks/ao-iniciar-sessao.sh' <<'__FIM_ARQUIVO_ERP__'
#!/bin/bash
# Mostra o estado do projeto no início de toda sessão (a saída entra no contexto do Claude).
dir="${CLAUDE_PROJECT_DIR:-.}"
rm -f "$dir/.claude/.publicar-autorizado"
echo "=== CÉREBRO DO PROJETO: ESTADO ATUAL ==="
if [ -f "$dir/cerebro/00-estado-atual.md" ]; then
  cat "$dir/cerebro/00-estado-atual.md"
else
  echo "cerebro/00-estado-atual.md não encontrado. Avise o responsável."
fi
echo
echo "=== LEMBRETES ==="
echo "1) Nada vai para o ar sem a mensagem do responsável começando com: Publique tudo"
echo "2) O que o responsável precisa fazer vem com 👉 e fecha toda resposta."
echo "3) Ao encerrar o assunto, use a skill encerrar-sessao (atualiza o cérebro)."
exit 0
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/hooks'
cat > '.claude/hooks/proteger-publicacao.py' <<'__FIM_ARQUIVO_ERP__'
#!/usr/bin/env python3
"""Rede de segurança antes de comandos e ferramentas.
- push forçado: sempre bloqueado
- push direto na main: sempre bloqueado (use PR)
- push para producao, comando de publicação e alteração na hospedagem:
  só no turno em que o responsável escreveu "Publique tudo"."""
import json, os, re, subprocess, sys

def bloquear(msg):
    print("BLOQUEADO pelas regras do projeto: " + msg, file=sys.stderr)
    sys.exit(2)

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)

proj = os.environ.get("CLAUDE_PROJECT_DIR") or d.get("cwd") or "."
autorizado = os.path.exists(os.path.join(proj, ".claude", ".publicar-autorizado"))
ferramenta = d.get("tool_name") or ""
SEM_FRASE = ('isto vai para o ar e o responsável não escreveu "Publique tudo" nesta mensagem. '
             "Deixe pronto, explique o que seria publicado e peça a frase.")

if ferramenta.startswith("mcp__"):
    if "hostinger" in ferramenta.lower():
        acao = ferramenta.split("__")[-1].lower()
        leitura = re.search(r"(get|list|read|show|status|search|check)", acao) and not re.search(
            r"(create|update|delete|remove|set|start|stop|restart|reset|recreate|purchase|install|attach|restore|activate|deactivate)", acao)
        if not leitura and not autorizado:
            bloquear(SEM_FRASE)
    sys.exit(0)

cmd = ((d.get("tool_input") or {}).get("command")) or ""
if not cmd:
    sys.exit(0)

if re.search(r"(infra/publicar|publicar-producao|deploy[-_ ]prod)", cmd) and not autorizado:
    bloquear(SEM_FRASE)
if re.search(r"gh\s+workflow\s+run", cmd) and re.search(r"(prod|publicar)", cmd, re.I) and not autorizado:
    bloquear(SEM_FRASE)

if re.search(r"git\s+push", cmd):
    if re.search(r"(--force|--force-with-lease|\s-f(\s|$)|\s\+\S+)", cmd):
        bloquear("push forçado não é permitido.")
    if re.search(r"(\s|:)(main|master)(\s|$)", cmd):
        bloquear("push direto na main não é permitido. Use branch e PR.")
    try:
        atual = subprocess.run(["git", "-C", proj, "rev-parse", "--abbrev-ref", "HEAD"],
                               capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        atual = ""
    if atual in ("main", "master"):
        bloquear("você está na main. Use branch e PR.")
    if (re.search(r"(\s|:)producao(\s|$)", cmd) or atual == "producao") and not autorizado:
        bloquear(SEM_FRASE)
sys.exit(0)
__FIM_ARQUIVO_ERP__

mkdir -p '.claude'
cat > '.claude/settings.json' <<'__FIM_ARQUIVO_ERP__'
{
  "permissions": {
    "deny": ["Read(./.env)"]
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/ao-iniciar-sessao.sh\"" }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/ao-enviar-mensagem.py\"" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/proteger-publicacao.py\"" }
        ]
      },
      {
        "matcher": "mcp__.*",
        "hooks": [
          { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/proteger-publicacao.py\"" }
        ]
      }
    ]
  }
}
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/skills/checklist-pr'
cat > '.claude/skills/checklist-pr/SKILL.md' <<'__FIM_ARQUIVO_ERP__'
---
name: checklist-pr
description: Preparar e revisar pull requests do ERP antes de pedir merge. Use sempre que for abrir, atualizar ou revisar um PR, ou quando o responsável disser que uma entrega terminou.
---

# Checklist de PR

Monte a descrição do PR com:

- **O que mudou** (3 a 6 linhas) e **por quê**.
- **Evidência:** testes executados e resultado real. Não afirmar o que não rodou.
- **Dinheiro/estoque/permissão:** quais regras foram tocadas e quais testes as cobrem.
- **Migrações:** presentes? reversíveis? testadas?
- **Segredos:** nenhum token, senha, certificado ou `.env` incluído.
- **Documentação e cérebro:** `docs/` e `cerebro/00-estado-atual.md` atualizados.
- **👉 Como o responsável confere:** passos simples para validar na homologação, sem ler código.
- **Risco e reversão:** o que pode dar errado e como desfazer.
- **Pendências** conhecidas.

Com CI verde e checklist completo você pode juntar o PR na `main` (homologação).
Nada vai para a branch `producao` sem o responsável escrever "Publique tudo".
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/skills/encerrar-sessao'
cat > '.claude/skills/encerrar-sessao/SKILL.md' <<'__FIM_ARQUIVO_ERP__'
---
name: encerrar-sessao
description: Gravar a síntese da conversa no cérebro do projeto e gerar o bloco para continuar em um novo chat. Use SEMPRE que um assunto terminar, quando aparecer o aviso automático de contexto em 50%, quando a conversa estiver longa, ou quando o responsável disser "encerrar", "resumir", "compactar", "passar o bastão", "novo chat" ou "salva isso".
---

# Encerrar sessão (síntese para o cérebro e passagem)

## 1. Gravar no cérebro
1. Crie `cerebro/diario/AAAA-MM-DD-assunto-curto.md` a partir de `cerebro/diario/_modelo.md`.
   Síntese, não transcrição: o que foi pedido, o que foi feito, o que foi decidido e por
   quê, o que ficou pendente, o que deu errado. No máximo uma página.
2. Atualize `cerebro/00-estado-atual.md`: fase, o que está pronto, próxima tarefa, e uma
   linha no histórico de sessões.
3. Atualize `cerebro/para-voce-fazer.md`: acrescente os 👉 novos, marque os concluídos.
4. Fato novo sobre a empresa (marca, cardápio, contas, equipamentos, pessoas, regras da
   casa) vai para o arquivo certo em `cerebro/empresa/`. Decisão técnica vai para
   `docs/decisoes/`. Ideia do cliente vai para `cerebro/ideias-do-cliente.md`.
5. Nunca grave segredo, senha, token ou dado pessoal de cliente no cérebro.
6. Faça commit, abra PR só com `cerebro/` e `docs/` e junte na `main` (permitido sem
   perguntar). Sem isso o próximo chat não enxerga nada. Confirme que o merge aconteceu.

## 2. Entregar o bloco de passagem
Termine a resposta com exatamente este formato, dentro de um bloco de código, para o
responsável copiar com um clique:

```
📋 COPIE E COLE EM UM NOVO CHAT

Continue o projeto ERP. Assunto desta sessão: <assunto>.
Leia cerebro/00-estado-atual.md e cerebro/diario/<arquivo de hoje>.
Onde paramos: <2 a 4 linhas>.
Próximo passo: <uma ação concreta>.
Branch em andamento: <nome ou "nenhuma">. PR aberto: <número ou "nenhum">.
Aguardando do responsável: <itens 👉 que travam, ou "nada">.
```

O bloco é curto de propósito: o detalhe está no cérebro. Se o merge do cérebro falhou,
diga isso antes do bloco e inclua nele a branch onde a síntese ficou.

## 3. Fechar
Depois do bloco, a seção `👉 Para você fazer`.
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/skills/ensaio-restauracao'
cat > '.claude/skills/ensaio-restauracao/SKILL.md' <<'__FIM_ARQUIVO_ERP__'
---
name: ensaio-restauracao
description: Planejar e registrar ensaios de backup e restauração do banco, arquivos e filas, com reconciliação posterior. Use quando o assunto for backup, recuperação, RPO/RTO, restauração, incidente ou preparação de corte/implantação.
---

# Ensaio de restauração

1. Identifique o que precisa ser restaurado: banco, XMLs/eventos fiscais, anexos, mídia.
2. Restaure em ambiente separado, nunca sobre produção.
3. Meça o tempo real e a perda de dados e compare com as metas (RPO 15 min e RTO 2 h são METAS a validar, não garantias).
4. **Reconcilie** antes de reprocessar filas: pedidos, tickets, pagamentos e documentos fiscais já efetivados externamente. Evite baixa, cobrança e nota duplicadas.
5. Registre em `docs/decisoes/` o resultado, o que falhou e o ajuste necessário.
6. Backup diário isolado não atende RPO de 15 min: aponte a lacuna e proponha a solução (arquivamento contínuo de logs do PostgreSQL e cópia externa) com custos e perdas explícitos.
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/skills/migracao-segura'
cat > '.claude/skills/migracao-segura/SKILL.md' <<'__FIM_ARQUIVO_ERP__'
---
name: migracao-segura
description: Criar ou revisar migrações de banco PostgreSQL de forma segura e reversível. Use SEMPRE que a tarefa envolver criar tabela, alterar coluna, índice, constraint, seed ou qualquer mudança de esquema, mesmo que o pedido seja só "ajusta o banco".
---

# Migração segura

1. Leia o esquema atual e as migrações existentes antes de escrever.
2. Escreva a migração versionada; inclua o caminho de reversão ou explique por que é irreversível.
3. Prefira mudanças compatíveis com a versão anterior do código (adicionar antes de remover; preencher dados em etapas).
4. Dinheiro: centavos inteiros ou decimal exato. Chaves de idempotência com restrição UNIQUE.
5. Tabelas de movimento (estoque, financeiro) são só de inserção; correção por movimento compensatório.
6. CNPJ como texto, nunca como número.
7. Rode a migração no PostgreSQL da sessão com dados sintéticos e cole a saída no PR.
8. Migração destrutiva ou em produção: pare e peça confirmação, com backup e reversão descritos.
9. Registre decisões de modelo em `docs/decisoes/`.
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/skills/nova-ideia-cliente'
cat > '.claude/skills/nova-ideia-cliente/SKILL.md' <<'__FIM_ARQUIVO_ERP__'
---
name: nova-ideia-cliente
description: Registrar e classificar uma ideia, pedido ou mudança vinda do cliente antes de qualquer implementação. Use sempre que o responsável disser "o cliente pediu", "tive uma ideia", "quero adicionar", "e se o sistema fizesse", ou trouxer funcionalidade que não está nos requisitos.
---

# Nova ideia do cliente

Não implemente na hora. Para cada ideia:

1. Escreva a ideia em uma frase, na linguagem do cliente, e o problema que ela resolve.
2. Verifique se já existe em `docs/requisitos/` ou em `cerebro/ideias-do-cliente.md` (evite duplicar).
3. Classifique:
   - **núcleo**: sem ela a primeira versão não atende ao RC-01 ou à operação diária;
   - **evolução**: útil, entra depois do núcleo estável;
   - **adiar**: depende de dado, hardware, terceiro ou volume que ainda não existe.
4. Descreva o impacto técnico em até 3 linhas (dados, telas, integrações) e as dependências.
5. Diga o que ela desloca: toda inclusão no núcleo empurra outra coisa.
6. Acrescente a linha em `cerebro/ideias-do-cliente.md` e, se for núcleo, proponha o ajuste no
   requisito correspondente para o responsável aprovar.

Seja franco: se a ideia aumenta o risco do núcleo, diga isso e proponha a versão menor.
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/skills/publicar'
cat > '.claude/skills/publicar/SKILL.md' <<'__FIM_ARQUIVO_ERP__'
---
name: publicar
description: Colocar no ar (produção) o que está aprovado na main. Use SOMENTE quando a mensagem do responsável começar com "Publique tudo". Também use para explicar o que seria publicado quando ele perguntar "o que está pronto para publicar?" ou "posso publicar?", sem publicar nada.
---

# Publicar

"No ar" é tudo que o público ou a loja usa de verdade: site, delivery, sistema interno em
produção, servidor, DNS, domínio, painel da hospedagem.

## Se a mensagem NÃO começa com "Publique tudo"
Não publique. Mostre o que está pronto na `main` e ainda não está no ar, os riscos, e
termine com: `👉 Para publicar, envie: Publique tudo`.

## Se a mensagem começa com "Publique tudo"
1. **Conferir:** CI verde na `main`; nenhuma migração destrutiva; backup recente do banco
   de produção; itens 👉 que travam a publicação resolvidos. Se algo falhar, pare e explique.
2. **Listar** em linguagem simples o que vai entrar no ar (diferença entre `producao` e `main`).
3. **Publicar:** atualizar a branch `producao` com a `main` e enviar. O GitHub Actions
   faz a implantação no servidor com as credenciais guardadas no GitHub. Você nunca usa
   senha do servidor.
4. **Verificar:** acompanhar a implantação até o fim; conferir a página de saúde, o site,
   um pedido de teste em modo de teste e a fila da cozinha. Não diga "publicado" sem ver.
5. **Se der errado:** reverter para a versão anterior (procedimento em `infra/`), avisar o
   responsável e registrar no cérebro.
6. **Registrar:** versão publicada, data, o que entrou e o resultado em
   `cerebro/00-estado-atual.md` e no diário.

A autorização vale só para a mensagem em que a frase foi escrita. Ações que exigem
confirmação específica (apagar dados, fiscal real, cobrança real, serviço pago)
continuam exigindo, mesmo com "Publique tudo".

Termine com `👉 Para você fazer`: o que ele deve abrir e conferir no ar.
__FIM_ARQUIVO_ERP__

mkdir -p '.claude/skills/teste-idempotencia-estoque'
cat > '.claude/skills/teste-idempotencia-estoque/SKILL.md' <<'__FIM_ARQUIVO_ERP__'
---
name: teste-idempotencia-estoque
description: Escrever e executar testes de baixa de estoque, concorrência e idempotência do RC-01 (pedido, ticket de cozinha, reserva, cancelamento). Use sempre que tocar em pedido, receita, saldo, reserva, outbox, webhook ou ticket, mesmo que não peçam testes.
---

# Testes de idempotência e estoque (RC-01)

Requisitos completos em `docs/requisitos/RC-01-pedido-cozinha-estoque.md` e
`docs/requisitos/RC-09-estoque-inteligente.md`. L = livre para venda = F - B - R.
Cenários mínimos, cada um com teste automatizado contra PostgreSQL real (não mock):

1. **Três setores:** um pedido gera um ticket por setor correto, baixa por receita/versão e vínculo de auditoria.
2. **Exemplos numéricos:** F=100, consumir 10 => F=90, L=90. Com reserva: F=120, R=20, L=100 => reservar 10 => R=30, L=90 => converter => F=110, R=20, L=90 (L não cai de novo).
3. **Última porção disputada:** dois pedidos simultâneos; só quem tem saldo confirmado avança; saldo nunca negativo sem autorização.
4. **Reenvio:** mesmo evento várias vezes => um consumo por item/revisão e um ticket lógico; reimpressão não consome.
5. **Falhas:** queda após gravar e antes de entregar => ticket entregue na recuperação; queda após entrega e antes do retorno => repetição sem duplicar.
6. **Preparo intermediário:** a venda consome o preparado, não as matérias-primas de novo.
7. **Cancelamento:** antes do preparo (reverte só com material utilizável) e depois (perda registrada, sem voltar ao saldo vendável).
8. **Alteração parcial:** movimentos só pela diferença.
9. **Em uso e guardado:** em uso 6, guardado 40, pedido consome 10 => transferência automática de 4, em uso 0, guardado 36, total 36, tarefa de abastecimento criada.
10. **Disponibilidade:** ingrediente compartilhado zera => todos os produtos dependentes ficam esgotados em todos os canais; entrada de estoque os devolve.
11. **Linhas e avisos:** cruzar a linha saudável gera um aviso só; cruzar a de emergência gera aviso urgente; vendas seguintes abaixo da linha não repetem.
12. **Uso do guardado:** a primeira venda que usa o guardado gera mensagem urgente ao responsável pelas compras; as seguintes do mesmo item não repetem.
13. **Produção (RC-10):** "Fila", "Pronto" e "Enviar" tocados duas vezes geram um aviso só; tempo do temporizador vem do servidor; pedido de duas áreas em "tudo junto" gera um único aviso ao atendente; estimativa de tempo bate com a conta manual para uma fila conhecida.
14. **Entregue x Pago:** atendente não consegue marcar Pago, nem pela tela nem direto no servidor; fechamento de caixa aprovado gera os lançamentos financeiros uma única vez.
15. **Botão "acabou" e venda autorizada sem saldo:** produto sai dos canais / venda registrada com autor; tarefa de contagem criada.

Entregue: testes, saída real da execução e lista do que não foi coberto.
__FIM_ARQUIVO_ERP__

cat > '.env.example' <<'__FIM_ARQUIVO_ERP__'
# Exemplo SEM segredos. Copie para .env apenas em desenvolvimento.
# Valores reais ficam em variáveis seguras do ambiente (nunca no Git).
DATABASE_URL=postgres://erp:erp@localhost:5432/erp_dev
NODE_ENV=development
__FIM_ARQUIVO_ERP__

cat > '.gitignore' <<'__FIM_ARQUIVO_ERP__'
node_modules/
.next/
dist/
build/
coverage/
.env
.env.*
!.env.example
*.pem
*.pfx
*.p12
*.key
*.log
.DS_Store
backups/
dados-reais/

# Marcadores locais dos hooks
.claude/.publicar-autorizado
.claude/.contexto-*
__FIM_ARQUIVO_ERP__

cat > 'CLAUDE.md' <<'__FIM_ARQUIVO_ERP__'
# ERP para alimentação: instruções do projeto

Idioma: português do Brasil, linguagem simples (o responsável não é programador).
Foco no sistema. Assuntos comerciais (preço, honorários, contrato) estão FORA: não tratar.

## Comece por aqui
1. Leia `cerebro/00-estado-atual.md` (o hook de início já o mostra) e `cerebro/para-voce-fazer.md`.
2. Leia em `docs/` o que o estado atual indicar para o assunto da sessão.
3. Siga `docs/decisoes/`. O que não está no repositório não é fonte de verdade.

## O projeto em 6 linhas
Sistema exclusivo de uma empresa de alimentação (cafeteria, almoço, porções,
hambúrgueres, salgados). A sorveteria 60 Sabores é franquia com sistema próprio e fica
fora, salvo leitura de dados (RC-11). Três frentes sobre um núcleo único: (1) gestão interna com
aplicativos por função (caixa, atendimento, cozinha, estoque, gestor); (2) site
institucional com páginas de produtos e contato para empresas; (3) delivery próprio pelo
site e por aplicativo instalável, do pagamento até o pedido na cozinha.
Requisito prioritário RC-01: todo pedido, de qualquer canal, chega sozinho ao setor de
produção e baixa o estoque por ficha técnica, uma única vez. RC-09: o estoque decide
sozinho o que está à venda e avisa o responsável quando é hora de repor. RC-10: telas de
produção por tipo de pedido, fila, temporizador, estimativa de tempo e avisos.
Aparelhos internos: Android da empresa, um login por funcionário, permissões por cargo.

## As 7 regras de convivência com o responsável
1. **"Publique tudo".** Nada vai para o ar (produção: site, delivery, sistema, servidor,
   DNS, painel da hospedagem) sem o responsável enviar uma mensagem que comece com
   **Publique tudo**. Sem essa frase você prepara, testa e deixa pronto, mas não publica.
   Um hook bloqueia a tentativa. Procedimento na skill `publicar`.
2. **👉 marca o que é do responsável.** Tudo que ele precisa fazer com as próprias mãos
   (testar algo, clicar no painel da hospedagem, criar conta, responder ao cliente) vem
   em linha iniciada por 👉. Toda resposta sua termina com a seção
   `👉 Para você fazer` (lista numerada, passo a passo) ou `👉 Para você fazer: nada desta vez.`
   Use 👉 só para isso. Registre os itens abertos em `cerebro/para-voce-fazer.md`.
3. **Cérebro.** `cerebro/` guarda a síntese de todas as sessões e tudo sobre a empresa.
   Ao encerrar um assunto use a skill `encerrar-sessao`. Uma sessão só sabe o que a outra
   fez pelo cérebro: se não foi escrito lá, não aconteceu.
4. **Passagem de contexto.** Quando o aviso automático de 50% de contexto aparecer (ou a
   conversa ficar longa, ou o responsável pedir), termine a resposta com o bloco
   `📋 COPIE E COLE EM UM NOVO CHAT` gerado pela skill `encerrar-sessao`.
5. **Skills.** No início de cada tarefa diga em uma linha: `🧩 Skills: usando X` e, se
   fizer sentido, `vale criar a skill Y porque...`. Tarefa repetida duas vezes vira
   proposta de skill. Catálogo em `cerebro/automacoes.md`.
6. **🤖 Modelos.** A base é o Opus 5.5. Antes de iniciar qualquer tarefa, mostre o
   `🤖 Plano de modelos` (qual modelo faz cada parte e por quê). No início de uma etapa
   nova, espere o "ok". Tarefas que não exigem o Opus vão para os subagentes
   `construtor` (Sonnet) e `ajudante` (Haiku); tudo que é crítico passa pelo `revisor`
   (Opus). Regras em `docs/05-uso-dos-modelos.md`.
7. **Um assunto por sessão.** Se o responsável desviar, não responda ao mérito: diga qual
   é o assunto adequado, anote 2 linhas no cérebro e volte. Ideia nova do cliente passa
   pela skill `nova-ideia-cliente` antes de qualquer código.

## Arquitetura (decisão 0003; mudar só com novo registro de decisão)
Monólito modular em TypeScript; Next.js para interface e API; worker em processo separado;
PostgreSQL como única dependência de dados (fila e outbox nele, sem Redis); Docker;
monorepositório com `apps/`, `packages/`, `infra/`, `docs/` e `cerebro/`.

## Regras inegociáveis do sistema
- Dinheiro em centavos (inteiro) ou decimal exato. Nunca float.
- Estoque em dois locais, em uso e guardado; consome do em uso e, se faltar, do guardado
  automaticamente. Livre para venda: L = F - B - R. O que cada canal pode vender é
  calculado das fichas técnicas e do estoque (RC-09), nunca digitado.
- A baixa ocorre UMA vez, na liberação para produção, na mesma transação do pedido e do
  evento outbox. Reimpressão, reenvio, webhook repetido, início
  do preparo e pagamento NÃO geram nova baixa nem novo ticket.
- Pedido pago online só vai para a cozinha depois da confirmação autenticada do provedor
  de pagamento, nunca pelo retorno da tela do cliente.
- Estados separados: pedido, produção, pagamento, entrega e documento fiscal.
- Atendente marca Entregue; **só o caixa marca Pago** (ou o provedor, no pagamento
  online). Pedido só é concluído com as duas coisas.
- Tudo é registrado com autor e horário; nada é apagado (RC-17).
- Permissões por cargo (RC-12): caixa e gerente geral não acessam o financeiro.
- Histórico imutável: ajuste e cancelamento geram movimentos compensatórios.
- Receita e preço aplicados na venda ficam versionados no pedido.
- Permissão verificada em cada endpoint. Tudo que é público (site, delivery) tem
  validação no servidor, limite de requisições e nenhum dado interno exposto.
- Segredos só em cofres (GitHub Secrets, segredos de rede do ambiente). Nunca em Git,
  logs, docs, cérebro ou variáveis comuns do ambiente de nuvem.
- Dados reais de clientes e funcionários não entram em testes.
- Não inventar API, homologação, compatibilidade de equipamento ou regra fiscal.

## Caminho do código até o ar
`branch de trabalho` -> PR -> `main` (homologação) -> **Publique tudo** -> `producao` (no ar).
- Trabalhe em branch (`feat/...`, `fix/...`, `docs/...`) e abra PR com a skill `checklist-pr`.
- Você pode juntar o PR na `main` quando o CI estiver verde e o checklist completo.
  PR só de `cerebro/` ou `docs/` pode ser juntado na hora. Nunca push direto na `main`.
- A `main` alimenta a homologação, onde o responsável vê e testa.
- A branch `producao` é o que está no ar. Só recebe código após "Publique tudo".

## Pode fazer sem perguntar
Ler, criar e editar código, testes, migrações e documentos em branch; rodar testes,
PostgreSQL e Docker na sessão; abrir PR; corrigir CI; juntar PR na `main` nas condições
acima; atualizar o cérebro. Avance com hipótese explícita em itens reversíveis.

## Só com "Publique tudo"
Push para `producao`; qualquer alteração em servidor, DNS, domínio ou painel de
hospedagem de produção; migração em banco de produção.

## Só com confirmação específica (mesmo depois de "Publique tudo")
Apagar dados reais; migração destrutiva; emissão ou cancelamento fiscal real; cobrança ou
estorno real; mensagem a clientes; contratar ou alterar serviço pago; mudar o RC-01.

## Qualidade
Toda regra de dinheiro, estoque, permissão, concorrência e idempotência exige teste
contra PostgreSQL real. Não declarar integração concluída sem exercitá-la com casos de
erro. Não afirmar push, merge ou publicação sem verificar o resultado.

## Ambiente (sessões na nuvem)
Máquina virtual com Docker e PostgreSQL pré-instalados (parados: inicie o que precisar).
Não alcança equipamentos da loja. Só chega à sessão o que está neste repositório.

## Comandos
Instalar, testar, lint e subir ambiente: A DEFINIR na etapa E02. Atualize aqui quando existirem.

## Skills (em `.claude/skills/`)
`encerrar-sessao`, `publicar`, `nova-ideia-cliente`, `checklist-pr`, `migracao-segura`,
`teste-idempotencia-estoque`, `ensaio-restauracao`.

## Subagentes (em `.claude/agents/`)
`construtor` (Sonnet 5.5), `ajudante` (Haiku 5.5), `revisor` (Opus 5.5).

## Ordem de construção
Siga `docs/03-roteiro-de-fases.md`, etapa por etapa (E01, E02...). Não pule etapa nem
junte duas regras críticas no mesmo PR.
__FIM_ARQUIVO_ERP__

cat > 'README.md' <<'__FIM_ARQUIVO_ERP__'
# ERP para alimentação

Sistema de gestão exclusivo para uma empresa de alimentação (cafeteria,
almoço, lanches e delivery): pedidos, produção, estoque, caixa, fiscal e gestão.

- Instruções de trabalho: `CLAUDE.md`
- Estado atual, memória do projeto e dados da empresa: `cerebro/`
- Requisitos: `docs/requisitos/`
- Decisões: `docs/decisoes/`

Repositório privado. Não versionar segredos, certificados nem dados reais.
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro'
cat > 'cerebro/00-estado-atual.md' <<'__FIM_ARQUIVO_ERP__'
# Estado atual do projeto

Atualizado em: 13/11/2026

## Em que pé estamos
- Fase: **F0 concluída** (repositório preparado). Ainda não existe código de aplicação.
- Próxima tarefa: **T01** (`docs/tarefas/T01-conferencia-e-fundacao.md`), etapas E01 e E02
  da ordem de construção (`docs/03-roteiro-de-fases.md`).
- Modelos: base Opus 5.5; Sonnet e Haiku por subagentes (`docs/05-uso-dos-modelos.md`).
- Aguardando: respostas do dono da empresa ao questionário em PDF (previstas para 14/11/2026).
- No ar (produção): **nada**. Homologação: **não existe ainda**.
- Infraestrutura: VPS de homologação contratada na Hostinger em 14/11/2026 (KVM 2, IP
  187.53.114.38, Ubuntu 26.04 LTS), ainda sem configuração; será preparada na etapa E06.
  Produção e domínio: não contratados. Integrações validadas: nenhuma.
- Identidade visual: será enviada depois; usar tema neutro configurável até lá.

## O que será construído (resumo)
1. Gestão interna com aplicativos por função (caixa, atendimento, cozinha, estoque, gestor).
2. Site institucional com páginas de produtos e área de contato para empresas.
3. Delivery próprio pelo site e por aplicativo instalável, do pagamento à cozinha.
Tudo sobre um núcleo único. Detalhes em `docs/01-visao-e-escopo.md`.

## O que ler conforme o assunto
| Assunto da sessão | Ler |
|---|---|
| Primeira sessão (T01) | Tudo em `docs/` e `cerebro/` |
| Pedidos, estoque | `docs/requisitos/RC-01-...`, `RC-09-...`, `modulos.md`, `docs/02-arquitetura.md` |
| Telas de produção, estimativa de tempo, avisos | `docs/requisitos/RC-10-...`, `RC-01-...`, `RC-04-...`, `docs/decisoes/0007-...` |
| Sorveteria 60 Sabores | `docs/requisitos/RC-11-...` |
| Cargos, permissões, login | `docs/requisitos/RC-12-...`, `docs/decisoes/0008-...` |
| Caixa | `docs/requisitos/RC-13-...`, `RC-17-...` |
| Entregas e motoboy | `docs/requisitos/RC-14-...`, `RC-08-...` |
| Financeiro, contabilidade, calculadoras | `docs/requisitos/RC-15-...`, `RC-16-...` |
| Histórico, busca, comunicação | `docs/requisitos/RC-17-...`, `RC-18-...` |
| Delivery, app do cliente | `docs/requisitos/RC-08-...`, `RC-01-...`, `fluxos-criticos.md` |
| Site institucional | `docs/requisitos/RC-07-...`, `cerebro/empresa/identidade-visual.md` |
| Fiscal, pagamento, financeiro | `docs/requisitos/RC-06-...`, `fluxos-criticos.md` |
| Telas e aplicativos internos | `docs/requisitos/RC-03-...`, `qualidade-operacional.md` |
| TVs e mídia | `docs/requisitos/RC-02-...` |
| Equipamentos e rede | `docs/requisitos/RC-04-...` |
| Servidor, publicação, backup | `docs/02-arquitetura.md`, `docs/decisoes/0004-...`, `cerebro/automacoes.md` |
| Ideias do cliente | `cerebro/ideias-do-cliente.md`, `docs/01-visao-e-escopo.md` |

## Histórico de sessões
| Data | Assunto | Resultado | Diário |
|---|---|---|---|
| 13/11/2026 | Preparação do projeto (F0) | Instruções, requisitos, cérebro, skills e travas criados | `diario/2026-11-13-preparacao-do-projeto.md` |
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro'
cat > 'cerebro/README.md' <<'__FIM_ARQUIVO_ERP__'
# Cérebro do projeto

A memória única do projeto e da empresa. Cada chat do Claude Code começa do zero; é aqui
que um chat descobre o que os outros fizeram. Regra: **se não está no cérebro, não aconteceu.**

## Estrutura
| Onde | O que guarda |
|---|---|
| `00-estado-atual.md` | Em que pé está o projeto, próxima tarefa, histórico de sessões. Lido no início de todo chat |
| `para-voce-fazer.md` | Lista viva dos itens 👉 do responsável |
| `diario/` | Uma síntese por sessão (o que foi feito, decidido e deixado pendente) |
| `empresa/` | Tudo sobre a empresa: perfil, operação, identidade visual, presença digital, contas e serviços |
| `ideias-do-cliente.md` | Ideias e pedidos, classificados antes de virar trabalho |
| `automacoes.md` | Skills existentes e recomendadas, subagentes e modelos, conectores e plugins |

Requisitos e decisões técnicas ficam em `docs/` (o cérebro aponta para eles, não os copia).

## Regras de escrita
1. Síntese, não transcrição. Uma sessão = no máximo uma página.
2. Cada informação em um lugar só. Se mudou, corrija no lugar; não crie uma segunda versão.
3. Fato tem data e origem ("13/11/2026, dito pelo responsável").
4. Hipótese é marcada como hipótese.
5. Nunca gravar senha, token, certificado, dado de cartão ou dado pessoal de cliente.
   Em `empresa/contas-e-servicos.md` registra-se QUE a conta existe e quem é o dono,
   nunca a credencial.
6. Atualização do cérebro vai por PR só de `cerebro/` e `docs/`, juntado na `main` na
   hora, para os outros chats enxergarem.

## Limite conhecido
Dois chats abertos ao mesmo tempo só enxergam o que o outro já juntou na `main`. Por isso
cada chat grava o cérebro ao encerrar (skill `encerrar-sessao`), e convém não manter
vários chats mexendo no mesmo assunto.
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro'
cat > 'cerebro/automacoes.md' <<'__FIM_ARQUIVO_ERP__'
# Automações: skills, conectores e plugins

## Como funciona nas sessões na nuvem
- **Skills do repositório** (`.claude/skills/`) carregam em toda sessão. É o caminho principal.
- **Hooks do repositório** (`.claude/settings.json`) também carregam: são as travas automáticas.
- **Plugins declarados no repositório não são instalados** nas sessões na nuvem. Por isso
  este projeto usa skills próprias em vez de depender de plugins.
- **Conectores** habilitados na sessão funcionam; os servidores de `.mcp.json` do
  repositório também são carregados.

## Subagentes e modelos
| Subagente | Modelo | Para quê |
|---|---|---|
| `construtor` | Sonnet 5.5 | Telas, cadastros, testes e relatórios a partir de especificação |
| `ajudante` | Haiku 5.5 | Busca, leitura, resumos, dados de teste, diário |
| `revisor` | Opus 5.5 | Revisão independente do que é crítico |
A sessão principal roda em Opus 5.5 e coordena. Regras em `docs/05-uso-dos-modelos.md`.

## Skills existentes
| Skill | Quando |
|---|---|
| `encerrar-sessao` | Fim de assunto, aviso de contexto, "novo chat" |
| `publicar` | Mensagem começando com "Publique tudo" |
| `nova-ideia-cliente` | Qualquer pedido novo |
| `checklist-pr` | Abrir ou revisar PR |
| `migracao-segura` | Mudança no banco |
| `teste-idempotencia-estoque` | Pedido, estoque, tickets |
| `ensaio-restauracao` | Backup e recuperação |

## Skills recomendadas (criar quando a fase chegar)
| Skill | Para quê | Etapa |
|---|---|---|
| `novo-modulo` | Criar módulo já com estrutura, testes e permissões no padrão | E02 a E04 |
| `tela-por-funcao` | Conferir tela contra a base visual, tamanhos reais e linguagem simples | E02 a E04 |
| `importar-cardapio` | Transformar planilha do cliente em cadastros, apontando o que falta | E07 |
| `matriz-de-permissoes` | Testar cada cargo contra a lista de ações, pela tela e direto no servidor, a cada mudança | E02 a E04 |
| `pacote-contabil` | Gerar e conferir o pacote mensal da contabilidade | E31 |
| `calibrar-tempos-de-preparo` | Comparar tempo prometido e realizado e propor ajuste de tempos e capacidades | Após algumas semanas de uso |
| `calibrar-linhas-de-estoque` | Recalcular as linhas saudável e de emergência pelo consumo real e propor ajustes ao responsável | Após algumas semanas de uso |
| `teste-de-homologacao` | Rodar no navegador os fluxos críticos e gerar o roteiro 👉 de conferência | E14 |
| `integrar-provedor` | Checklist de integração de pagamento/fiscal: estados, erros, reenvio, segredos | E19, E20 |
| `revisar-superficie-publica` | Segurança do site e do delivery: validação, limites, dados expostos | Portão 3 |
| `provisionar-servidor` | Preparar servidor do zero pelo conector da Hostinger e por script | E06 |
| `relatorio-ao-cliente` | Resumo quinzenal em linguagem simples do que entrou e do que falta | Sempre |

O Claude deve propor uma skill sempre que repetir o mesmo procedimento pela segunda vez.

## Conectores
| Conector | Uso | Quando ligar | Cuidado |
|---|---|---|---|
| GitHub | Código, PR, CI | Já | Proteger `main` e `producao` |
| Hostinger (MCP oficial) | Consultar e gerenciar VPS, domínios e DNS sem abrir o painel | Ao contratar o servidor | Alterações só com "Publique tudo" (há trava) |
| Google Drive | Ler material bruto do cliente | Quando houver material | Confirmar na sessão se aparece; converter para `cerebro/` |

### Hostinger: como ligar (quando houver conta)
Acrescentar ao repositório o arquivo `.mcp.json`:
```json
{
  "mcpServers": {
    "hostinger": { "type": "http", "url": "https://mcp.hostinger.com" }
  }
}
```
A autorização é feita pelo navegador na primeira vez (o responsável aprova). Alternativa:
pacote `@hostinger/mcp` com token de API em variável segura. Confirmar na documentação
da Hostinger no momento de ligar, e conferir na primeira sessão quais ações ele oferece.

## Publicação automática (sem mexer em painel)
1. Preparação do servidor: uma vez, por script versionado em `infra/` (Docker, firewall,
   usuário de implantação, HTTPS).
2. Publicação: GitHub Actions implanta quando a branch `producao` recebe código. As
   credenciais do servidor ficam nos segredos do GitHub; o Claude não as vê.
3. Homologação: mesma automação, a partir da `main`.
4. DNS e servidor: pelo conector da Hostinger.
O que continua manual: contratar e pagar serviços, aprovar autorizações, criar tokens.

## O que NÃO automatizar
Pagamento a fornecedor, emissão fiscal real fora do fluxo de venda, mensagens a clientes
e exclusão de dados. Sempre com pessoa confirmando.
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro/diario'
cat > 'cerebro/diario/2026-11-13-preparacao-do-projeto.md' <<'__FIM_ARQUIVO_ERP__'
# 2026-11-13: preparação do projeto

- Assunto da sessão: organização e planejamento (feito no chat do Claude, antes do Claude Code)
- Branch / PR: primeiro PR do repositório

## O que foi pedido
Organizar o projeto para ser tocado inteiro no Claude Code pelo navegador, com um assunto
por chat, memória compartilhada e o máximo de automação.

## O que foi feito
Criados `CLAUDE.md`, requisitos (RC-01 a RC-04 e RC-06 a RC-18), decisões 0001 a 0008,
cérebro, sete skills e três travas automáticas (início de sessão, aviso de contexto e
bloqueio de publicação).

## O que foi decidido (e por quê)
- Refazer o desenho técnico em vez de seguir o planejamento anterior (0003).
- Nada vai ao ar sem "Publique tudo"; produção é a branch `producao` (0004).
- Escopo passa a incluir site institucional e delivery próprio com app do cliente (0005).
- Estoque em dois níveis, em uso e guardado, com disponibilidade automática para venda,
  linhas saudável e de emergência e notificações ao responsável (0006, RC-09).
- Cozinha no andar de baixo com quatro tablets por tipo de pedido, cafeteria com tela
  própria, botão de fila, temporizador, estimativa de tempo e avisos (RC-10, 0007).
- Sorveteria 60 Sabores fora do sistema; só leitura de dados. Integração com o sistema
  da franquia não confirmada: nada encontrado publicamente sobre "Mollbyte" (RC-11).
- Aparelhos internos só Android, da empresa; um login por funcionário.
- Cargos definidos; estoque por área; compras com o gerente geral; aba de potes de
  sorvete; atendente marca Entregue e só o caixa marca Pago; caixa, motoboy, financeiro,
  calculadoras, histórico e comunicação viraram requisitos (0008, RC-12 a RC-18).
- Construção por partes, em 36 etapas com portões de teste (`docs/03-roteiro-de-fases.md`).
- Base Opus 5.5; Sonnet e Haiku para o que não precisa dele, via subagentes; o Claude
  avisa o plano de modelos antes de cada tarefa (`docs/05-uso-dos-modelos.md`).
- Questionário em PDF entregue ao responsável para levar ao dono da empresa.
- Uso do guardado gera mensagem urgente ao responsável pelas compras.
- Assuntos comerciais ficam fora do repositório.

## O que ficou pendente
Tudo de `cerebro/para-voce-fazer.md`. Identidade visual será enviada depois.

## O que deu errado ou surpreendeu
As travas foram testadas fora do Claude Code. Falta confirmar na primeira sessão real que
o aviso de contexto dispara e que as skills aparecem.

## 👉 Ficou para o responsável
Ver `cerebro/para-voce-fazer.md`, seção "Agora".

## Skills usadas / skill que valeria criar
Ver `cerebro/automacoes.md`.
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro/diario'
cat > 'cerebro/diario/_modelo.md' <<'__FIM_ARQUIVO_ERP__'
# AAAA-MM-DD: assunto

- Assunto da sessão:
- Branch / PR:

## O que foi pedido
## O que foi feito
## O que foi decidido (e por quê)
## O que ficou pendente
## O que deu errado ou surpreendeu
## 👉 Ficou para o responsável
## Skills usadas / skill que valeria criar
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro/empresa'
cat > 'cerebro/empresa/contas-e-servicos.md' <<'__FIM_ARQUIVO_ERP__'
# Contas e serviços

Registra QUE a conta existe, para que serve e quem é o dono. **Nunca a senha ou o token.**

| Serviço | Para que serve | Dono da conta | Situação | Onde fica o segredo |
|---|---|---|---|---|
| GitHub | Código e documentação | Responsável técnico | Criado | — |
| Claude (Claude Code) | Desenvolvimento | Responsável técnico | Ativo | — |
| Google Drive | Material bruto do cliente | Responsável técnico | Criado | — |
| Hostinger: VPS de homologação | Servidor de testes. Plano KVM 2 (2 vCPU, 8 GB de RAM, 100 GB). IP 187.53.114.38, Ubuntu 26.04 LTS, sem painel, sem Docker instalado, sem complementos | Conta do responsável técnico (confirmar titularidade com o dono) | **Contratada em 14/11/2026**; ainda não configurada | Senha de root com o responsável; trocar por chave SSH na etapa E06 |
| Hostinger: VPS de produção | Servidor que vai ao ar (KVM 4 previsto) | A definir | Não contratada; só na etapa E23 | GitHub Secrets |
| Domínio | Endereços do site | A definir | A confirmar | — |
| Provedor de pagamento | Pix e cartão | Cliente | Não escolhido | GitHub Secrets |
| Provedor fiscal | Emissão de notas | Cliente | Não escolhido | GitHub Secrets |
| Sistema da franquia 60 Sabores | Gestão da sorveteria (da franquia) | Cliente / franqueadora | Em uso; integração não confirmada | — |
| Armazenamento de arquivos | Fotos, vídeos, backups | A definir | Não contratado | GitHub Secrets |

Decidir cedo quem é o dono de cada conta: o ideal é o cliente ser dono do que é da empresa
(domínio, pagamento, fiscal) e dar acesso ao responsável técnico.
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro/empresa'
cat > 'cerebro/empresa/identidade-visual.md' <<'__FIM_ARQUIVO_ERP__'
# Identidade visual

**Situação em 13/11/2026:** ainda não recebida. O responsável enviará logo, cores e layout.

## Enquanto não chega
Construir tudo com tema neutro baseado em variáveis (cores, tipografia, raio, espaçamento),
de modo que aplicar a marca seja trocar valores, não refazer telas. Nenhuma cor fixa no código.

## Quando chegar, registrar aqui
- Logo (versões clara, escura e ícone) e onde os arquivos ficam no repositório
- Cores (principal, apoio, fundo, texto, alerta) com código
- Tipografia
- Estilo de fotos e tom de linguagem
- Regras de uso das marcas (a da empresa e a da franquia 60 Sabores, que tem manual próprio)

## Onde a identidade se aplica
Site institucional, delivery e app do cliente, aplicativos internos, cardápio, telas de
TV, etiquetas, recibos e relatórios.
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro/empresa'
cat > 'cerebro/empresa/operacao.md' <<'__FIM_ARQUIVO_ERP__'
# Operação da casa

Como a empresa funciona de verdade. Preencher no diagnóstico.

## Setores de produção
Tudo abaixo dito pelo responsável em 13/11/2026.
- Cozinha no andar de baixo. Os pedidos sobem ao salão por um elevador de carga. Só a
  cozinha usa o elevador.
- Quatro tablets na cozinha, por tipo de pedido: Geral, Hambúrgueres (na esteira de
  hambúrguer), Pratos e grelhados (perto das panelas e do grill) e Elevador.
- Cafeteria: tela própria; entrega no próprio balcão.
- Sorveteria 60 Sabores: franquia de autoatendimento, com sistema próprio (informado como
  "Mollbyte"). Não é operada por este sistema (RC-11).
- Delivery e retirada: hoje embalados pela cozinha e enviados pelo elevador; a casa
  pretende mudar isso.
- Aparelhos: só Android, da empresa, usados apenas na loja. Um login por funcionário.
- Estoque por área: cozinheiras cuidam dos alimentos da cozinha; supervisor cuida das
  bebidas dos freezers do salão, da cafeteria e dos potes de sorvete. Gerentes gerais
  fazem as compras.
- Cargos: dono, administrador, gerentes gerais, financeiro, supervisor, atendente,
  cozinheira, auxiliar de cozinha, caixa, motoboy próprio (detalhes no RC-12).
- O caixa fica no mesmo computador que acompanha os pedidos e organiza os motoboys
  próprios e os do iFood.
- A contabilidade é feita por empresa externa.

## Rotina
Abertura, picos, troca de turno, fechamento: a levantar.

## Regras da casa
Descontos, cortesias, consumo de funcionário, taxa de serviço, cancelamentos: a levantar.

## Cardápio e fichas técnicas
Quando recebidos, converter para arquivos em `cerebro/empresa/cardapio/` (sem dados pessoais).

## Estoque
Responsável pelo estoque por turno, gestor que recebe a escalada, prazo de entrega de
cada fornecedor, itens críticos e onde ficam o em uso e o guardado: a levantar (RC-09).

## Equipamentos existentes
Modelo exato de impressora, maquininha, tablets, TVs e rede: a levantar (ver RC-04).
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro/empresa'
cat > 'cerebro/empresa/perfil.md' <<'__FIM_ARQUIVO_ERP__'
# Perfil da empresa

Preencher conforme o cliente informar. Marcar data e origem de cada fato.

| Item | Informação | Data / origem |
|---|---|---|
| Nome e marcas | A confirmar. A sorveteria é uma franquia 60 Sabores, com sistema próprio | responsável, 13/11/2026 |
| CNPJ(s), UF, município | A confirmar | |
| Regime tributário e contador | A confirmar | |
| Atividades | Cafeteria, almoço, porções, hambúrgueres, salgados; sorveteria de autoatendimento (franquia) | responsável, 13/11/2026 |
| Canais de venda | Salão, balcão, retirada, iFood, delivery próprio (a construir) | planejamento |
| Equipe | Funcionários CLT, sócios, turnos | planejamento |
| Unidades | Uma | hipótese |
| Horário de funcionamento | A confirmar | |
| Área de entrega | A confirmar | |
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro/empresa'
cat > 'cerebro/empresa/presenca-digital.md' <<'__FIM_ARQUIVO_ERP__'
# Presença digital

| Item | Situação | Observação |
|---|---|---|
| Domínio | A confirmar | Um domínio atende tudo por subdomínios |
| Site institucional atual | A confirmar se existe | Será construído (RC-07) |
| Delivery próprio | Não existe | Será construído (RC-08) |
| iFood | Em uso | Integração é evolução |
| Redes sociais, WhatsApp, Google Meu Negócio | A levantar | Links entram no site |

## Endereços planejados (hipótese, ajustar ao domínio real)
- `www` : site institucional
- `pedidos` : delivery e app do cliente
- `gestao` : aplicativos internos
- `homolog` : ambiente de testes
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro'
cat > 'cerebro/ideias-do-cliente.md' <<'__FIM_ARQUIVO_ERP__'
# Ideias do cliente

Toda ideia entra aqui antes de virar requisito (skill `nova-ideia-cliente`).
Classificação: **núcleo** | **evolução** | **adiar**.

| # | Data | Ideia (na linguagem do cliente) | Problema que resolve | Classificação | Impacto técnico | Dependências | O que desloca | Decisão |
|---|---|---|---|---|---|---|---|---|
| 1 | | (a preencher) | | | | | | |

## Já registradas como requisito (não repetir aqui)
- Pedido chega sozinho na cozinha e baixa o estoque: RC-01.
- Vídeos de comida nas TVs, escolhidos no sistema: RC-02.
- Cada setor com seu próprio aplicativo: RC-03.
- Central fiscal, contábil e de documentos: RC-06.
- Site institucional com páginas de produtos e contato para empresas: RC-07.
- Delivery próprio pelo site e aplicativo para o cliente pedir: RC-08.
- Estoque ligado à venda (em uso e guardado), notificações ao responsável e linhas saudável e de emergência: RC-09.
- Telas da cozinha por tipo de pedido, botão de fila, temporizador com cores, som de pedido novo, botão de pronto, aviso ao atendente com a mesa, tudo junto ou por partes: RC-10.
- Cliente acompanha etapas e vê estimativa de tempo pela fila e pelo preparo: RC-10 (seções 7 e 8) e RC-08.
- Sorveteria 60 Sabores: extrair dados do sistema da franquia e aba de controle dos potes: RC-11.
- Cargos e acessos, login por pessoa na cozinha: RC-12.
- Caixa completo e organização dos motoboys: RC-13. Aplicativo do motoboy: RC-14.
- Financeiro completo e documentos para a contabilidade: RC-15.
- CMV, calculadora de mercadoria e outras: RC-16.
- Registro de tudo, busca de pedido com linha do tempo, Entregue x Pago: RC-17.
- Notificação e comunicação interna em todos os aplicativos: RC-18.

## Sugestões do Claude ainda não pedidas pelo cliente (avaliar com ele)
| Sugestão | Por que vale | Classificação proposta |
|---|---|---|
| Acompanhamento do pedido em tempo real por link, sem instalar nada | Reduz ligações "cadê meu pedido" | núcleo do delivery |
| Retirada no balcão com horário marcado | Mesmo fluxo do delivery, sem entregador | núcleo do delivery |
| Pausar o delivery ou aumentar o prazo com um toque quando a cozinha lota | Evita atraso e cancelamento | núcleo do delivery |
| Pedido agendado (almoço de amanhã, encomenda) | Aumenta ticket e previsibilidade | evolução |
| Cardápio por QR Code na mesa usando a mesma loja | Reaproveita tudo do delivery | evolução |
| Cupom de primeira compra e programa de pontos | Traz o cliente do iFood para o canal próprio (sem taxa) | evolução |
| Formulário de encomendas e eventos para empresas, virando oportunidade no sistema | É a "área para empresas" com acompanhamento | núcleo do site |
| Avaliação após a entrega, ligada ao pedido | Qualidade com rastreio | evolução |
| Contagem rápida diária de poucos itens no aplicativo de estoque | Mantém o estoque do sistema fiel ao real sem parar a loja | núcleo do estoque (RC-09) |
| Lista de compras automática por fornecedor, aprovada por pessoa | Tira a conta da cabeça do responsável | núcleo do estoque (RC-09) |
| Relatório de venda perdida por item esgotado | Mostra o custo de não repor | evolução |
| "Terminar juntos": indicar quando iniciar cada item para a mesa ficar pronta ao mesmo tempo | Nada esfria esperando | núcleo da cozinha (RC-10) |
| Reabrir pedido que subiu errado, com prioridade | Corrige erro sem confusão | núcleo da cozinha (RC-10) |
| Painel de desempenho da cozinha (tempo por produto, estação e turno) | Mostra gargalos | evolução |
| Acompanhar o pedido da mesa por QR Code, sem instalar nada | O cliente do salão também vê as etapas | núcleo (RC-10) |
| Capacidade da cozinha informada por turno | Deixa a estimativa de tempo realista | núcleo (RC-10) |
| Relatório prometido x realizado | Calibra a estimativa e mostra onde atrasa | evolução |
| Senha de retirada na TV do salão | Organiza o balcão | evolução |
| Fechamento cego do caixa | Protege contra erro e desvio | núcleo do caixa (RC-13) |
| Alertas ao gerente de padrões suspeitos no caixa | Segurança sem vigiar tela | núcleo do caixa (RC-13) |
| Código de 4 dígitos do cliente como prova de entrega | Acaba com "não recebi" | núcleo das entregas (RC-14) |
| Mensagens presas ao pedido, com respostas prontas | Cozinha e salão se falam sem sair do lugar | núcleo (RC-18) |
| CMV teórico x real | Mostra perda e desvio que o CMV sozinho esconde | RC-16 |
| Crachá de aproximação para login na cozinha | Entra sem digitar | adiar |
| Aviso por WhatsApp do andamento do pedido | Muito valorizado; depende de serviço pago e aprovação | adiar |
| Aplicativo nas lojas (Android/iPhone) | Só se o instalável pelo navegador não bastar | adiar |
__FIM_ARQUIVO_ERP__

mkdir -p 'cerebro'
cat > 'cerebro/para-voce-fazer.md' <<'__FIM_ARQUIVO_ERP__'
# 👉 Para você fazer

Lista viva do que depende do responsável. O Claude acrescenta e marca como feito.

## Agora (para começar)
- [ ] 👉 No GitHub, proteger a branch `main`: exigir pull request e CI aprovado.
- [ ] 👉 Em claude.ai/code, conectar o GitHub e instalar o app do Claude neste repositório.
- [ ] 👉 Abrir a primeira sessão e pedir a tarefa T01.

## Assim que possível (destrava o trabalho)
- [ ] 👉 Enviar logo, cores e identidade visual da empresa (pode ser pelo Drive).
- [ ] 👉 Responder às perguntas de `docs/04-pendencias.md` com o cliente (comece pelas de número 1, 5, 13 e 14).
- [ ] 👉 Enviar cardápio, 1 a 3 fichas técnicas de exemplo, ingredientes e unidades.
- [ ] 👉 Dizer qual domínio será usado (ou se precisa registrar um).
- [ ] 👉 Levantar com o cliente: quem cuida do estoque em cada turno, quem cuida das compras, prazo de entrega dos fornecedores e os itens que não podem faltar (pendências 20, 21, 23 e 31).
- [ ] 👉 Pedir ao cliente a lista de produtos com tempo de preparo e tipo (hambúrguer, prato/grelhado, cafeteria), e quantas pessoas trabalham em cada tipo por turno (pendências 29 e 35).
- [ ] 👉 Perguntar à franqueadora 60 Sabores: nome exato do sistema, se exporta relatórios ou tem API, e se o contrato permite integração (pendências 32 a 34).
- [ ] 👉 Levar o questionário em PDF ("Perguntas para o dono") ao dono da empresa e trazer as respostas.
- [ ] 👉 Abrir as sessões do Claude Code sempre em Opus 5.5.
- [ ] 👉 Pedir à contabilidade a lista do que ela precisa receber todo mês e em que formato.

## Antes de pagamento e fiscal (etapas E19 e E20)
- [ ] 👉 Escolher com o cliente o provedor de pagamento (Pix e cartão online) e abrir conta de testes.
- [ ] 👉 Escolher com o contador o provedor fiscal e abrir conta de testes.

## Antes de mostrar ao cliente (homologação)
- [ ] 👉 Confirmar com o dono o domínio antes de usar o "domínio grátis" da Hostinger (pergunta 56 do questionário).
- [ ] 👉 Gerar o token da API da Hostinger e guardá-lo como segredo (o Claude dirá onde colar; nunca no chat).
- [ ] 👉 Autorizar o conector da Hostinger quando a sessão pedir.

## Antes de ir para o ar
- [ ] 👉 Criar a branch `producao` protegida (o Claude orienta) e os segredos de produção no GitHub.
- [ ] 👉 Testar na homologação o roteiro que o Claude entregar.
- [ ] 👉 Enviar a mensagem: **Publique tudo**

## Feito
- [x] Criar repositório privado no GitHub (13/11/2026)
- [x] Criar pasta do projeto no Drive (13/11/2026)
- [x] Contratar a VPS de homologação na Hostinger (14/11/2026)
__FIM_ARQUIVO_ERP__

mkdir -p 'docs'
cat > 'docs/01-visao-e-escopo.md' <<'__FIM_ARQUIVO_ERP__'
# Visão e escopo

## O negócio
Uma empresa que reúne cafeteria, almoço, porções, hambúrgueres e salgados, e abriga uma
sorveteria de autoatendimento da franquia 60 Sabores, que tem sistema próprio e fica
fora deste projeto, salvo leitura de dados (RC-11). Consumo no local, balcão, retirada, delivery por iFood e por canal próprio.
Tem funcionários CLT, sócios e turnos. Objetivo: operação conectada do estoque ao
pagamento, fiscal, financeiro e rotinas da equipe, com a identidade visual da empresa.

Desenvolvimento sob encomenda para essa empresa. Não é produto para revenda.

## As três frentes
| Frente | O que é | Requisitos |
|---|---|---|
| Gestão interna | Aplicativos por função: caixa, atendimento, cozinha, estoque, gestor | RC-01, RC-03, módulos |
| Site institucional | Site da empresa com produtos e área para empresas | RC-07 |
| Delivery próprio | Loja online e aplicativo instalável, do pagamento à cozinha | RC-08 |
Um núcleo, um banco, um cadastro de produtos para as três.

## Objetivos mensuráveis
Tempo de atendimento e de preparo, divergências de caixa e de estoque, perdas, margem por
produto e canal, falhas de integração. Registrar a situação atual antes da implantação
para poder comparar depois.

## Gestão interna: o que entra
Uma empresa/CNPJ e uma unidade. Hipótese de 5 a 15 dispositivos simultâneos, a confirmar.

| Frente | Entrega |
|---|---|
| Diagnóstico e identidade | Mapeamento essencial dos processos, protótipos operacionais, aplicação de logo e paleta fornecidos pela empresa (não inclui criação de marca) |
| Cadastros e estoque | Produtos, ingredientes, unidades, receitas e adicionais, movimentos, inventário básico; estoque em uso e guardado; disponibilidade automática para venda; linhas saudável e de emergência; notificações ao responsável (RC-09) |
| Pedido e produção | Registro pelo atendimento/caixa, mesas e comandas básicas, fila por setor, status e notificações, envio automático e consumo por ficha técnica (RC-01) |
| Cargos e acessos | Um login por funcionário, permissões por cargo, login por código nos tablets da cozinha (RC-12) |
| Caixa | Abertura, painel de contas, recebimento, fechamento cego, segurança, expedição (RC-13). Só o caixa marca Pago |
| Registro e busca | Tudo registrado; busca de pedido com linha do tempo e tempos (RC-17) |
| Comunicação | Aviso no aparelho e central interna em todos os aplicativos (RC-18) |
| Financeiro | Básico na primeira entrega; completo com pacote para a contabilidade externa depois (RC-15) |
| Calculadoras | CMV, custo do prato, preço, mercadoria e outras (RC-16) |
| Entregas | Aplicativo do motoboy próprio e prestação de contas (RC-14) |
| Sorveteria 60 Sabores | Leitura de dados do sistema da franquia e aba de controle de potes (RC-11) |
| Interfaces por função | Caixa, atendimento, produção por setor, gestor/dono, estoque/expedição e colaborador básico; núcleo único; tarefas e comunicados simples |
| Mídia e TVs | Biblioteca, playlists, publicação e agenda básica, piloto em até duas telas independentes |
| Integrações delimitadas | Um provedor fiscal e um provedor de pagamento, com API documentada e ambiente de testes |
| Implantação | Configuração inicial, testes, documentação, treinamento, área de suporte no sistema para registrar e acompanhar chamados |
| Site institucional | Vitrine de produtos ligada ao cadastro, área para empresas com formulário, páginas institucionais (RC-07) |
| Delivery próprio | Loja online com entrega e retirada, pagamento online, acompanhamento do pedido, aplicativo instalável (RC-08) |

As interfaces são aplicativos web responsivos e instaláveis, por função.

## O que fica para depois (evolução)
| Tema | Primeira versão | Evolução |
|---|---|---|
| Cozinha e estoque | RC-01 com baixa por receita, auditoria, tratamento de duplicidade e cancelamento | Medição física automática, sensores |
| Aplicativos | Aplicativos web instaláveis (internos e do cliente) | Apps nativos, lojas de aplicativos, gestão de dispositivos (MDM) |
| TVs | Até 2 telas independentes, playlists e agenda | Video wall, sincronismo preciso, player próprio, mais telas |
| Delivery | Delivery próprio completo; pedidos do iFood lançados manualmente | API do iFood, WhatsApp automatizado, roteirização, rastreio no mapa |
| Ponto e RH | Escala, comunicados e tarefas básicos; link para o serviço de ponto existente | Integração de ponto, folha, banco de horas |
| Continuidade | Operação central conectada, backups, contingência documentada | Offline coordenado entre dispositivos, servidor local, alta disponibilidade |
| Gestão | Relatórios básicos e consulta por perfil | DRE avançada, conciliação bancária automática, previsão, IA |
| Fiscal/contábil | Emissão pelo provedor, com estados reais | Central fiscal, contábil e documental ampliada (RC-06) |

Atenção ao iFood: se o cliente depende dele no dia a dia, a integração pode precisar
subir de prioridade. É uma das pendências de `04-pendencias.md`.

## Regras que sustentam o projeto
- Registrar cada informação uma vez e reutilizá-la nos demais módulos.
- Separar status de pedido, produção, pagamento, entrega e documento fiscal.
- Rastreabilidade: ajustes e cancelamentos geram movimentos compensatórios e histórico.
- Confirmação humana para compras, pagamentos, mudança de preço e ações acima da alçada.
- Resolver rastreabilidade, filas, estoque e comunicação antes de automações sofisticadas.

## Papéis
| Quem | Responsabilidade |
|---|---|
| Responsável técnico (dono deste repositório) | Decisões, aprovação de PR e de implantação, contato com o cliente |
| Claude Code | Especificar, implementar, testar e documentar dentro dos limites do `CLAUDE.md` |
| Empresa cliente | Dados, receitas, identidade, equipamentos, decisões de processo, validação das entregas |
| Contador | Enquadramento, regras e cadastros fiscais, validação da parametrização |
| Fornecedores (fiscal, pagamento, iFood) | Documentação, acesso e homologação |
__FIM_ARQUIVO_ERP__

mkdir -p 'docs'
cat > 'docs/02-arquitetura.md' <<'__FIM_ARQUIVO_ERP__'
# Arquitetura

Arquitetura adotada. As escolhas e seus motivos estão em `decisoes/0003-arquitetura-base.md`.
Para mudar algo, crie novo registro de decisão.

## Componentes
| Camada | Decisão |
|---|---|
| Interfaces | Aplicação web responsiva/PWA em React/Next.js; uma experiência por função, sem duplicar regra de negócio |
| Servidor | TypeScript, API modular, validação no backend, PostgreSQL, transações nas operações críticas |
| Tarefas assíncronas | Worker em processo separado; fila durável e outbox no próprio PostgreSQL, com novas tentativas e identificação única; sem Redis na primeira versão |
| Implantação | Docker, Git, migrações versionadas, homologação separada, publicação controlada com reversão |
| Arquivos | Armazenamento separado quando necessário; fotos, XML e anexos com controle de acesso e backup próprio |
| Tempo real | Envio do servidor (SSE) para as telas de produção; a fila gravada no banco é a verdade |
| Operação local | Agente local para impressão e balança quando necessário; servidor local na loja é evolução |

Modelo: **monólito modular**. Sem microserviços no início. Um banco, módulos com
fronteiras claras (cadastros, estoque, pedidos, produção, caixa, financeiro, fiscal,
pessoas, mídia, suporte).

Estrutura do monorepositório: `apps/gestao` (interna), `apps/loja` (delivery e app do
cliente), `apps/site` (institucional), `apps/worker`; `packages/` (domínio, banco,
interface compartilhada); `infra/` (Docker, implantação); `docs/`; `cerebro/`.

## Superfície pública (site e loja)
- Endereços separados por subdomínio: `www` (site), `pedidos` (loja), `gestao` (interno).
- A loja e o site só enxergam o que é público: produto vendável, preço do canal,
  disponibilidade, horário. Custo, estoque numérico, margens e dados de pessoas nunca saem.
- Validação e cálculo de preço no servidor; limite de requisições; proteção de formulários.
- Pagamento por campo/checkout do provedor: dado de cartão não toca o nosso servidor.
- Confirmação de pagamento por aviso autenticado do provedor, idempotente.
- Acompanhamento do pedido por link com código imprevisível, sem login.
- O site institucional usa páginas geradas e cache, e segue no ar se o resto estiver em manutenção.

## Entidades principais
Empresa/CNPJ, unidade, setor, usuário/perfil, funcionário, turno/caixa, cliente,
mesa/comanda, produto/adicional, receita/versão, ingrediente/unidade, fornecedor, compra,
lote, produção, movimento de estoque, pedido/item, pagamento, recebível, despesa,
liquidação, documento fiscal, evento de integração, dispositivo, chamado de suporte.

## Regras de dados
- Dinheiro em centavos ou decimal exato; arredondamento definido e testado.
- Chaves idempotentes e restrições únicas. Eventos externos podem chegar repetidos ou
  fora de ordem: validar assinatura, manter log, reconciliar divergências.
- Publicação de evento na mesma transação do dado (outbox).
- Horários preservam instante e fuso operacional.
- Item vendido guarda o preço e a receita aplicados na venda.
- Separar marca, setor, unidade e CNPJ. Identidade visual não define quem vende, recebe ou emite nota.
- CNPJ como texto.
- IA só para explicar e sugerir. Estoque, financeiro, tributos e permissões seguem regras determinísticas e auditáveis.

## Ambientes e publicação
Caminho: branch de trabalho -> PR -> `main` (homologação) -> "Publique tudo" -> `producao` (no ar).
Implantação pelo GitHub Actions, com credenciais nos segredos do GitHub (decisão 0004).

| Ambiente | Onde | Dados | Observação |
|---|---|---|---|
| Desenvolvimento | Sessão na nuvem do Claude Code (Docker e PostgreSQL disponíveis) | Sintéticos | Nada de credencial real |
| Homologação | Servidor com endereço acessível, separado da produção | Sintéticos ou mascarados | Onde o responsável e o cliente veem e testam |
| Produção | VPS (preferência do projeto: Hostinger, plano KVM 4 como ponto de partida) | Reais | Só com confirmação do responsável |

Preferência registrada: Hostinger, Ubuntu LTS, Docker; aplicação, PostgreSQL e worker na
mesma máquina no início. Isso NÃO é banco gerenciado nem alta disponibilidade. Não
compilar nem rodar testes pesados no servidor de atendimento. Dimensionar pela carga medida
em homologação e confirmar plano e valores na página oficial antes de contratar.

## Continuidade
| Situação | Comportamento esperado |
|---|---|
| Cai a internet principal | Roteador assume segundo link (4G/5G); testar a troca |
| Sem internet externa | PDV executa só as funções locais previstas; PWA instalada não garante offline |
| Vários dispositivos sem internet | Exige servidor local para coordenar; navegadores isolados não sincronizam entre si (evolução) |
| Pagamento ou fiscal indisponível | Exibir a pendência real e aplicar o procedimento definido |
| Retorno da conexão | Sincronizar registros únicos e reconciliar sem duplicar |

Metas a validar, não garantias: **RPO de até 15 minutos e RTO de até 2 horas.** Backup
diário isolado não atende esse RPO. Para atender: arquivamento contínuo de logs do
PostgreSQL para armazenamento externo, recuperação pontual e restauração ensaiada
(decisão 0003, item 8). Sem isso, a meta honesta é a idade do último backup.

## Segurança mínima
Usuários individuais; MFA para administração; permissões no backend; auditoria; SSH por
chave; firewall; banco sem acesso público; HTTPS; segredos fora do código; minimização e
retenção de dados pessoais; alertas de indisponibilidade, fila parada, disco cheio e
backup atrasado. O dono do negócio tem visão ampla, mas não recebe credenciais de
servidor ou banco no aplicativo.

## Observabilidade
Logs estruturados com identificador que ligue a falha técnica ao pedido e à integração.
Medir: tempo da confirmação até o recebimento no terminal, fila pendente, idade do pedido
mais antigo. Avaliar OpenTelemetry ou solução mais simples compatível com a escala.

## Ainda a escolher na etapa E02
Bibliotecas de fila sobre PostgreSQL, acesso tipado ao banco, validação e testes;
armazenamento de arquivos e mídia; forma de impressão conforme o equipamento real.
Registrar em novo arquivo de `decisoes/` com o próximo número livre.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs'
cat > 'docs/03-roteiro-de-fases.md' <<'__FIM_ARQUIVO_ERP__'
# Ordem de construção

O sistema é construído **por partes**. Cada etapa é pequena, tem teste que prova que
funciona e só começa quando a anterior foi aceita. Modelos: ver `05-uso-dos-modelos.md`.

## Regras da ordem
1. **Uma etapa = um assunto = um PR.** Nunca duas regras críticas no mesmo PR.
2. **Servidor antes da tela.** A regra é construída e testada no servidor; a tela vem depois.
3. **Crítico primeiro, bonito depois.** Dinheiro, estoque e permissão são provados com
   teste antes de qualquer acabamento.
4. **Portões.** Nos pontos marcados com 🚪 o trabalho para até o responsável testar na
   homologação e dar o "ok".
5. **Nada vai ao ar sem "Publique tudo".**
6. **Etapa travada por resposta pendente** não é pulada com chute: usa dados fictícios
   para construir e fica aguardando a resposta para ser aceita.
7. Antes de cada etapa: mostrar o plano de modelos e esperar o "ok".

## Bloco A: base (não depende de nenhuma resposta do cliente)
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E01** Conferência | Leitura de tudo, teste das travas, discordâncias e perguntas (T01 parte 1) | Opus | Responsável leu e respondeu |
| **E02** Fundação técnica | Monorepositório, banco e migrações, ambiente de desenvolvimento, CI | Opus decide; Sonnet monta; Haiku documenta | CI verde; ambiente sobe com um comando |
| **E03** Cargos, login e auditoria | Funcionários, cargos, permissões no servidor, código pessoal, registro de tudo (RC-12, RC-17 base) | Opus; revisor | Matriz de permissões testada pela tela e direto no servidor |
| **E04** Base visual e cascas | Tema neutro por variáveis; casca dos aplicativos por cargo | Sonnet; Opus revisa | Telas abrem nos tamanhos reais (tablet, celular, computador) |
| **E05** Avisos | Central interna e aviso no aparelho, básico (RC-18) | Sonnet; Opus no tempo real | Aviso chega ao cargo e turno certos |
| **E06** Homologação 🚪 | Preparar a VPS de testes já contratada (chave SSH, firewall, Docker, HTTPS) por script em `infra/` e publicação automática da `main` | Opus | 👉 Responsável abre o endereço de testes e entra com seu login |

## Bloco B: cadastros e estoque
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E07** Cadastros | Produtos, tipos de pedido, ingredientes, unidades, conversões, fornecedores; importação de planilha | Sonnet; Opus revisa | Planilha de exemplo importada com os erros apontados |
| **E08** Fichas técnicas | Receitas versionadas, rendimento, custo do prato | Opus na regra; Sonnet na tela | Custo confere com conta feita à mão |
| **E09** Estoque | Áreas, em uso e guardado, movimentos, perda, contagem (RC-09) | Opus; revisor | Movimentos fecham em quantidade e custo |
| **E10** Reposição | Linhas saudável e de emergência, avisos, lista de compras | Opus na regra; Sonnet na tela | Um aviso por cruzamento de linha |

## Bloco C: pedido e produção (o coração do sistema)
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E11** Pedido e baixa | RC-01 no servidor: pedido, baixa única, em uso e depois guardado, outbox, idempotência | **Opus; revisor** | Todos os testes de concorrência e repetição do RC-01 passam |
| **E12** Disponibilidade | O que pode ser vendido, calculado do estoque; botão "acabou" | Opus; revisor | Ingrediente zera e os produtos somem; entrada os devolve |
| **E13** Aplicativo do atendente | Mesas, comanda virtual, lançar pedido, tudo junto ou por partes, alterar pedido | Sonnet; Opus revisa | Pedido lançado no aparelho chega ao servidor uma única vez |
| **E14** Telas de produção | Telas por tipo, fila, iniciar, pronto, temporizador com cores, sons, elevador, cafeteria (RC-10) | Sonnet nas telas; Opus no tempo real | Critérios 1 a 3, 6 e 10 do RC-10 |
| **E15** Aviso e entrega | Aviso ao atendente, "Peguei", "Entregue", linha do tempo e busca do pedido (RC-17) | Sonnet; Opus revisa | Critérios 4 e 5 do RC-10 e os do RC-17 |
| **E16** Estimativa de tempo | Fila, capacidade, faixa e horário previstos | Opus | Valor bate com a conta manual |
| **Portão 1** 🚪 | **Ensaio na loja, sem dinheiro:** uma noite com o sistema rodando em paralelo ao que existe hoje | — | 👉 Equipe usou, problemas anotados e corrigidos |

## Bloco D: caixa e dinheiro
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E17** Caixa | Sessão, fundo de troco, painel de contas, recebimento com maquininha avulsa, Pago, sangria (RC-13) | **Opus; revisor** | Conta dividida com pagamento misto fecha no centavo |
| **E18** Fechamento | Fechamento cego, conferência, alertas ao gerente, relatório | Opus na regra; Sonnet no relatório | Critérios 5 e 6 do RC-13 |
| **E19** Pix integrado | Pix gerado pelo sistema com confirmação automática | **Opus; revisor** | Aviso repetido do provedor gera um recebimento só |
| **E20** Fiscal | Emissão pelo provedor, em ambiente de testes, com estados reais (RC-06) | **Opus; revisor**; contador valida | Nota rejeitada, timeout e reenvio sem duplicar |
| **E21** Financeiro básico e sorveteria | Lançamentos vindos do fechamento; aba de potes de sorvete; lançamento do dia da sorveteria (RC-11) | Sonnet; Opus revisa | Fechamento aparece no financeiro sem digitação |

## Bloco E: entrada em operação da gestão interna
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E22** Segurança e recuperação | Backup contínuo, restauração ensaiada e cronometrada, monitoramento | Opus | Restauração feita em outro servidor, com tempo medido |
| **E23** Produção | Servidor, domínio, HTTPS, branch `producao` | Opus | 👉 Servidor contratado e segredos criados |
| **E24** Treinamento | Ambiente de treino com dados fictícios, roteiro por cargo | Sonnet; Haiku | Cada cargo fez seu roteiro |
| **Portão 2** 🚪 | **Piloto por turno e corte:** inventário inicial, um turno por vez, depois a casa inteira | — | 👉 "Publique tudo" |

## Bloco F: site institucional (em paralelo, a partir da E07)
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E25** Site | Páginas, vitrine ligada ao cadastro, área para empresas (RC-07) | Sonnet; Opus revisa a parte pública | Critérios do RC-07; 👉 "Publique tudo" |

Depende de identidade visual, textos, fotos e domínio. Não depende do restante.

## Bloco G: delivery próprio
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E26** Loja online | Cardápio, carrinho, disponibilidade, área e taxa de entrega, estimativa | Sonnet; Opus nas regras | Preço e taxa calculados no servidor |
| **E27** Pagamento online | Reserva de estoque, pagamento, liberação para a cozinha, estorno | **Opus; revisor** | Critérios 1 a 5 do RC-08 |
| **E28** Acompanhamento e aplicativo | Etapas, itens, posição na fila, previsão; aplicativo instalável | Sonnet; Opus revisa | Critério 6 do RC-08 |
| **E29** Entregas | Expedição no caixa, aplicativo do motoboy, código de confirmação, prestação de contas (RC-14) | Sonnet; Opus na prestação de contas | Critérios do RC-14 |
| **Portão 3** 🚪 | Revisão de segurança da área pública, teste de carga, ensaio com pedidos reais de teste | Opus; revisor | 👉 "Publique tudo" |

## Bloco H: gestão avançada
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E30** Financeiro completo | Compras a pagar, valores a receber, conciliação, fluxo de caixa, resultado (RC-15) | Opus; revisor | Critérios 1 e 2 do RC-15 |
| **E31** Pacote contábil | PDF, planilhas e XML por mês, com versão e controle de envio | Sonnet; Opus confere as somas | Totais batem com a origem |
| **E32** Calculadoras | CMV real e teórico, custo, preço, mercadoria e demais (RC-16) | Opus nas contas; Sonnet nas telas | Cada uma conferida com exemplo à mão |
| **E33** Painéis | Desempenho, prometido x realizado, venda perdida | Sonnet | Números abrem a origem |

## Bloco I: complementos
| Etapa | Entrega | Modelos |
|---|---|---|
| **E34** TVs e mídia | Piloto em duas telas (RC-02) | Sonnet; Opus revisa |
| **E35** Sorveteria: coleta automática | Só se a franquia tiver relatório ou API (RC-11) | Opus |
| **E36** iFood | Integração, se o cliente quiser | Opus |

## O que cada etapa precisa do cliente
| Etapas | Precisa de |
|---|---|
| E01 a E06 | **Nada.** Podem começar já |
| E07, E08 | Cardápio, fichas técnicas, unidades (dá para construir com exemplos e trocar depois) |
| E09, E10 | Lista de itens por área de estoque, prazos dos fornecedores |
| E14, E16 | Tempo de preparo e tipo de cada produto, pessoas por tipo e turno |
| E17, E18 | Regras do caixa: taxa de serviço, limite de gaveta, quem autoriza |
| E19, E27 | Provedor de pagamento com conta de testes |
| E20 | Provedor fiscal, dados da empresa, contador |
| E23 | Domínio e servidor |
| E25 | Identidade visual, textos, fotos |
| E26, E29 | Área e taxa de entrega, regras do motoboy |
| E31 | O que a contabilidade pede e em que formato |

## Por que esta ordem
- O que mais pode causar prejuízo (estoque, pedido, dinheiro) é feito cedo, com o modelo
  mais forte e com revisão independente, quando ainda é barato corrigir.
- A casa começa a usar no Portão 2 só o núcleo. Delivery, motoboy, financeiro completo e
  calculadoras entram depois, um de cada vez, sobre uma base já provada na loja.
- A homologação existe desde a E06, então o responsável vê cada parte funcionando, em vez
  de receber tudo no fim.

## Rotina depois de no ar
Diário: caixa, rejeições fiscais, filas e backups. Semanal: contagem de itens críticos,
perdas e preços. Mensal: resultado, permissões, custos e capacidade. Ensaiar restauração
periodicamente e após mudanças relevantes.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs'
cat > 'docs/04-pendencias.md' <<'__FIM_ARQUIVO_ERP__'
# Pendências com o cliente

O questionário completo para levar ao dono da empresa está em PDF, entregue ao
responsável em 13/11/2026 ("Perguntas para o dono"). Ao receber as respostas, atualize
esta tabela e o cérebro.

Avance com hipótese explícita onde for reversível. Pergunte quando a resposta mudar uma decisão.

Na coluna "Trava", os códigos F são as fases antigas; a ordem atual usa etapas E
(`03-roteiro-de-fases.md`, tabela "O que cada etapa precisa do cliente").

| # | O que confirmar | Decisão que muda | Hipótese enquanto não há resposta | Trava |
|---|---|---|---|---|
| 1 | ~~Significado de "guardado"~~ **Respondida em 13/11/2026:** em uso (imediato) e guardado (reserva), ver decisão 0006 | — | — | — |
| 2 | Nome, marcas, CNPJ(s), UF, município, regime tributário, contador | Configuração fiscal, quem vende/recebe/emite | Um CNPJ, uma unidade | F6 |
| 3 | Pedidos por dia, pico simultâneo, número de dispositivos | Capacidade do servidor, esforço de otimização | 5 a 15 dispositivos | F9 |
| 4 | **Respondida em 13/11/2026:** sorveteria é franquia 60 Sabores com sistema próprio; fora do escopo (RC-11) | — | — | — |
| 5 | Enquanto o delivery próprio não existe, o iFood segue em uso? Quer integração depois? | Prioridade da integração | Lançamento manual; integração como evolução | F4 |
| 6 | Baixa do estoque no envio à produção ou no início do preparo | Política de consumo do RC-01 | No envio (pedido explícito do cliente) | F4 |
| 7 | Continuidade exigida sem internet | Servidor local, custo | Operação conectada com segundo link | F9 |
| 8 | Modelos exatos de impressora, balança, maquininha, TVs e rede | Agente local, integrações, RC-04 | Nenhuma compatibilidade presumida | F6/F8 |
| 9 | Sistemas e contratos atuais (PDV, fiscal, adquirente, ponto) | Construir, integrar ou migrar | Sem migração de sistema anterior | F6 |
| 10 | Cardápio, fichas técnicas, ingredientes e unidades | Cadastros e saldo inicial | Dados sintéticos de exemplo | F3 |
| 11 | Logo, paleta e identidade autorizados | Base visual | Tema neutro configurável | F7 |
| 12 | Quem valida cada entrega do lado do cliente | Aceite | Responsável técnico concentra | todas |
| 13 | Domínio a usar e quem é o dono dele | Endereços do site, loja e gestão | Subdomínios de um domínio único | P/F8 |
| 14 | Área de entrega, taxa (fixa, por bairro ou por distância), pedido mínimo, entregadores próprios ou terceiros | Cálculo de frete e expedição | Entregador próprio, taxa por bairro | F9 |
| 15 | Aceita pagamento na entrega (dinheiro/maquininha) além de Pix e cartão online? | Regra de liberação do pedido | Só pagamento online no início | F9 |
| 16 | Provedor de pagamento online preferido (ou conta já existente) | Integração de pagamento | A escolher, com ambiente de testes | F6/F9 |
| 17 | Horário do delivery e capacidade da cozinha no pico | Pausa e limite de pedidos | Mesmo horário da loja | F9 |
| 18 | Conteúdo do site: textos, fotos, serviços para empresas | Estrutura do site | Estrutura do RC-07 com textos provisórios | P |
| 19 | Identidade visual (será enviada depois) | Aparência de tudo | Tema neutro configurável | P/F7/F9 |
| 20 | **Respondida em 13/11/2026:** estoque por área: cozinha (alimentos) e supervisor (bebidas, cafeteria, potes); escalada para o gerente geral | — | — | — |
| 21 | Prazo de entrega de cada fornecedor e dias de folga desejados | Sugestão das linhas saudável e de emergência | Linhas informadas manualmente no início | F3 |
| 22 | ~~Supervisor pode vender com saldo zerado na loja física?~~ **Respondida em 13/11/2026:** sim, com contagem depois; delivery rígido | — | — | — |
| 23 | Margem de segurança na loja online (quanto segurar de cada item crítico) | Disponibilidade no delivery | Margem só nos itens que o cliente indicar | F9 |
| 24 | **Respondida em 13/11/2026:** cafeteria tem tela própria no salão; sorveteria fora do sistema | — | — | — |
| 25 | **Respondida em 13/11/2026:** telas por tipo de pedido, não por lugar; cada produto tem um tipo | — | — | — |
| 26 | **Respondida em 13/11/2026:** por item; pedido de várias áreas: atendente pergunta tudo junto ou por partes | — | — | — |
| 27 | **Respondida em 13/11/2026:** Android da empresa, usado só na loja; login por funcionário, permissões por cargo | — | — | — |
| 28 | **Respondida em 13/11/2026:** hoje a cozinha embala e sobe pelo elevador; vai mudar, então é configuração | — | — | — |
| 29 | Tempo de preparo padrão de cada produto e limites das cores | Temporizador | Verde até 70%, amarelo até 100%, vermelho depois | F3 |
| 30 | **Respondida em 13/11/2026:** só a cozinha usa o elevador; cada área entrega o seu | — | — | — |
| 31 | **Respondida em 13/11/2026:** quem compra é o gerente geral (decisão 0008) | — | — | — |
| 32 | Nome exato do sistema da franquia 60 Sabores, contato do suporte e da franqueadora; ele exporta relatórios? tem API? | Caminho de coleta do RC-11 | Lançamento manual do fechamento diário | Evolução |
| 33 | A sorveteria tem CNPJ próprio ou é o mesmo da casa? O contrato de franquia permite integração? | Fiscal, consolidação e o que pode ser lido | CNPJ e caixa separados | Evolução |
| 34 | Que dados da sorveteria o cliente quer ver no painel (vendas, pagamentos, insumos)? | Tela do gestor | Vendas e pagamentos do dia | Evolução |
| 35 | Quantas pessoas trabalham em cada tipo de pedido por turno (capacidade simultânea) | Estimativa de tempo | Capacidade 2 por tipo, ajustável | F4 |
| 36 | Tempo de deslocamento por região de entrega e limite de prazo aceitável antes de pausar o delivery | Estimativa e proteção automática | 15 min por região; pausa acima de 60 min | F9 |
| 37 | **Respondida em 13/11/2026:** cargos definidos no RC-12 | — | — | — |
| 38 | **Respondida em 13/11/2026:** gerente geral vê custos da área dele; não vê o faturamento da empresa | — | — | — |
| 39 | Motoboy usa celular próprio (pode ser iPhone) ou aparelho da empresa? | Aplicativo do motoboy e avisos | Celular próprio, qualquer sistema | F9b |
| 40 | Como o motoboy próprio é remunerado (por entrega, por região, fixo)? | Prestação de contas e custo da entrega | Valor por entrega, por região | F9b |
| 41 | **Parcial em 13/11/2026:** um caixa, maquininha avulsa (baixa manual). Falta: gaveta e impressora ligadas ao computador? Qual operadora da maquininha? | Conferência e impressão | Baixa manual com conferência no fechamento | E17 |
| 42 | Há taxa de serviço (10%) ou gorjeta? Como é repassada? | Conta e fechamento | Opcional, mostrada separada | F5 |
| 43 | O que a contabilidade pede hoje, em que formato e para qual sistema? Com que frequência? | Pacote contábil | PDF com planilhas e XML, mensal | F11 |
| 44 | Sorvete: o controle é por pote inteiro? Como é feito o pedido de reposição à franquia? | Aba de potes | Por pote; pedido feito fora do sistema pelo gerente | F5 |
| 45 | Limite de dinheiro em gaveta e tempo máximo de conta entregue sem pagamento antes de alertar | Avisos do caixa | A definir com o cliente | F5 |
| 46 | **Respondida em 13/11/2026:** código de 4 dígitos uma vez por turno; depois é só tocar na foto | — | — | — |
__FIM_ARQUIVO_ERP__

mkdir -p 'docs'
cat > 'docs/05-uso-dos-modelos.md' <<'__FIM_ARQUIVO_ERP__'
# Uso dos modelos de IA

Base do projeto: **Opus 5.5**. O que não precisa dele vai para um modelo menor, mais
rápido e mais econômico. Quem coordena é a sessão principal (Opus).

## Quem faz o quê
| Modelo | Como é chamado | Responsável por |
|---|---|---|
| **Opus 5.5** | Sessão principal | Decisões e arquitetura; regras de dinheiro, estoque, concorrência, idempotência e permissões; integrações de pagamento e fiscal; migrações de risco; tempo real e estimativa de tempo; depuração difícil; segurança; coordenação; **revisão final de todo PR** |
| **Opus 5.5** | Subagente `revisor` | Revisão independente (sem ter visto o trabalho sendo feito) de tudo que toca em dinheiro, estoque, permissão, pagamento, fiscal e área pública |
| **Sonnet 5.5** | Subagente `construtor` | Telas e componentes a partir de requisito escrito; cadastros simples; testes a partir de critérios já definidos; relatórios; documentação; refatoração mecânica |
| **Haiku 5.5** | Subagente `ajudante` | Busca e leitura de arquivos; resumos; conferências repetitivas; dados fictícios de teste; mensagens de commit; atualização do diário e das listas do cérebro |

Os subagentes estão em `.claude/agents/`. O modelo de cada um está no próprio arquivo.

## Regras
1. **Avisar antes de começar.** Antes de iniciar qualquer tarefa, a sessão principal
   mostra ao responsável o plano de modelos, neste formato:

   ```
   🤖 Plano de modelos desta tarefa
   | Parte | Modelo | Por quê |
   |---|---|---|
   | Regra de baixa do estoque | Opus 5.5 | Regra crítica, concorrência |
   | Tela de cadastro | Sonnet 5.5 (construtor) | Especificação fechada |
   | Dados de teste e diário | Haiku 5.5 (ajudante) | Tarefa leve |
   | Revisão antes do merge | Opus 5.5 (revisor) | Toca em estoque |
   ```
   No início de uma **etapa nova** da ordem de construção, espera o "ok" do responsável.
   Dentro de uma etapa já iniciada, mostra o plano e segue.
2. **Na dúvida, sobe.** Se uma parte parecia simples e encostou em regra crítica, volta
   para o Opus. Economia nunca justifica risco em dinheiro, estoque ou permissão.
3. **Modelo menor não decide.** Construtor e ajudante executam especificação; dúvida de
   projeto volta para a sessão principal.
4. **Nada crítico entra sem o revisor.** O Opus principal confere o resultado de todo
   subagente antes de aceitar; o que é crítico passa também pelo `revisor`.
5. **Registrar.** O diário da sessão anota que modelo fez cada parte e se o resultado
   precisou ser refeito. Se um modelo menor errar o mesmo tipo de tarefa duas vezes,
   esse tipo de tarefa sobe de modelo e a tabela acima é atualizada.
6. **A sessão deve ser aberta em Opus.** Se a sessão estiver em outro modelo, avisar o
   responsável antes de qualquer trabalho crítico.

## Como o responsável escolhe o modelo da sessão
No Claude Code, pelo seletor de modelo ou enviando `/model opus`.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/decisoes'
cat > 'docs/decisoes/0001-definicoes-de-estoque-rc01.md' <<'__FIM_ARQUIVO_ERP__'
# 0001: definições de estoque do RC-01

- Data: 12/11/2026
- Status: substituída por 0006
- Assunto da sessão: arquitetura e dados

## Contexto
O cliente pediu que o pedido atualize o estoque "guardado" e o "disponível". "Guardado"
pode ser o saldo físico registrado ou um local específico (depósito/freezer).

## Decisão
Físico (F), Bloqueado (B), Reservado (R) e Disponível (D = F - B - R), por ingrediente,
unidade e local. Disponível é visão calculada, não outro estoque. Baixa na confirmação e
liberação para produção, na mesma transação do pedido. Transferência entre depósito e
cozinha não é consumo.

## Alternativas descartadas
Dois estoques independentes debitados pela mesma venda: gera baixa duplicada.

## Consequências
Uma venda gera um consumo. Locais são opcionais até a confirmação do cliente.

## Critério de aceite e evidência
Os dois exemplos numéricos do RC-01 (sem reserva e com reserva) reproduzidos em teste.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/decisoes'
cat > 'docs/decisoes/0002-metodo-de-trabalho.md' <<'__FIM_ARQUIVO_ERP__'
# 0002: método de trabalho

- Data: 13/11/2026
- Status: aceita
- Assunto da sessão: organização

## Contexto
O responsável trabalha só pelo navegador e quer organização rígida por assunto.

## Decisão
- Todo o trabalho acontece no Claude Code em sessões na nuvem, sobre um monorepositório
  privado no GitHub.
- O repositório é a única fonte de verdade. O Google Drive é caixa de entrada de material
  bruto do cliente; o que o sistema usar é convertido em arquivo de `docs/`.
- Uma sessão por assunto. Desvio de assunto é redirecionado, não respondido.
- Assuntos comerciais ficam fora do repositório.
- Publicação e merge seguem a decisão 0004.

## Consequências
Cada sessão começa lendo `cerebro/00-estado-atual.md` e termina atualizando o cérebro.

## Critério de aceite e evidência
Histórico de sessões preenchido em `cerebro/00-estado-atual.md`.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/decisoes'
cat > 'docs/decisoes/0003-arquitetura-base.md' <<'__FIM_ARQUIVO_ERP__'
# 0003: arquitetura base

- Data: 13/11/2026
- Status: aceita (decisão técnica delegada pelo responsável; revisável com novo registro)
- Assunto da sessão: arquitetura

## Contexto
O planejamento anterior deixava várias escolhas em aberto e tratava tudo como proposta
a revisar. O responsável autorizou refazer o que for preciso. O sistema atende uma
unidade, com 5 a 15 dispositivos, mantido por uma pessoa com apoio do Claude Code.
Simplicidade de operação pesa mais que flexibilidade.

## Decisão
1. **Um só código TypeScript**, monorepositório. Aplicações web em Next.js (gestão, loja
   e site, ver decisão 0005) e **worker em processo separado**, todos usando o mesmo
   pacote de domínio e o mesmo banco.
2. **PostgreSQL como única dependência de dados.** Fila e outbox dentro do PostgreSQL.
   Sem Redis e sem serviço de mensageria na primeira versão.
3. **SQL explícito nas operações de estoque e dinheiro** (trava por linha e atualização
   condicional). Camada de acesso tipada e migrações em SQL versionado, não geração
   automática de esquema.
4. **Tempo real para a produção por envio do servidor (SSE)**, com busca da fila gravada
   ao conectar e ao reconectar. A fila no banco é a verdade; o aviso é só gatilho.
5. **Autenticação própria**, com código pessoal para troca rápida em aparelho
   compartilhado e senha com segundo fator para administração.
6. **Fiscal e pagamento por provedores**, atrás de uma interface interna, para trocar de
   fornecedor sem reescrever o núcleo. Nunca comunicação direta com a SEFAZ.
7. **Sem offline coordenado na primeira versão.** Contingência é procedimento documentado
   e segundo link de internet.
8. **Backup:** arquivamento contínuo dos logs do PostgreSQL para armazenamento externo,
   mais cópia completa periódica. É o que torna a meta de RPO de 15 minutos alcançável em
   VPS única. Sem isso, a meta honesta é a idade do último backup. RTO de 2 horas só vale
   depois de ensaio cronometrado em outro servidor.
9. **Mídia:** player próprio como página do sistema em aparelho dedicado, para o piloto.

## Bibliotecas
Escolher na etapa E02, conferindo versão e manutenção atuais antes de adotar: fila sobre
PostgreSQL, camada de acesso tipada, validação de entrada, testes (unidade, integração
com PostgreSQL real, navegador). Registrar a escolha em novo registro de decisão.

## Alternativas descartadas
- Microserviços: custo operacional sem benefício nesta escala.
- Redis para fila: mais um serviço para manter e fazer backup, sem necessidade.
- WebSocket: SSE resolve o sentido servidor -> tela com menos estado.
- Plataforma de sinalização paga já no piloto: dependência e licença antes de provar a necessidade.

## Consequências
Um servidor, um banco, dois processos. Fácil de operar e de restaurar. Limite conhecido:
sem alta disponibilidade; queda do servidor para a operação até a recuperação.

## Critério de aceite e evidência
Ambiente sobe com um comando; testes do RC-01 rodam contra PostgreSQL real; restauração
ensaiada e cronometrada antes da entrada em operação.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/decisoes'
cat > 'docs/decisoes/0004-regras-de-operacao.md' <<'__FIM_ARQUIVO_ERP__'
# 0004: regras de operação do projeto

- Data: 13/11/2026
- Status: aceita (pedido do responsável)
- Assunto da sessão: organização

## Decisão
1. **Publicação só com "Publique tudo".** Produção é a branch `producao`; a `main` é a
   homologação. A implantação é feita pelo GitHub Actions quando `producao` recebe código.
   Alterações em servidor, DNS e painel de hospedagem de produção seguem a mesma regra.
   A frase vale só para a mensagem em que foi escrita.
2. **👉 marca tarefa do responsável.** Toda resposta termina com a seção `👉 Para você
   fazer`; itens abertos ficam em `cerebro/para-voce-fazer.md`.
3. **Cérebro.** `cerebro/` é a memória única; cada sessão grava a síntese ao encerrar.
4. **Aviso de contexto.** Um hook estima o uso de contexto e, a partir de 50%, pede o
   bloco `📋 COPIE E COLE EM UM NOVO CHAT`.
5. **Skills.** O Claude informa as skills em uso e propõe novas quando houver repetição.
6. **Merge na `main`** pode ser feito pelo Claude com CI verde, porque `main` não é o ar.

## Como é garantido
Hooks em `.claude/settings.json`: `ao-iniciar-sessao.sh`, `ao-enviar-mensagem.py`,
`proteger-publicacao.py`. São barreira forte, não absoluta. Reforços no GitHub: proteção
das branches `main` e `producao` e, se o plano permitir, aprovação obrigatória no
ambiente de produção do GitHub Actions.

## Limites conhecidos
- O aviso de 50% usa o registro da conversa e um limite configurável
  (`ERP_CONTEXTO_MAX`, padrão 200000). É estimativa. Precisa ser confirmado na primeira
  sessão real; se não disparar, vale a regra escrita (conversa longa ou pedido do responsável).
- Sessões abertas ao mesmo tempo só compartilham o que já foi juntado na `main`.

## Critério de aceite e evidência
Na primeira sessão: tentar um push para `producao` sem a frase (deve bloquear) e
verificar se o estado do cérebro apareceu no início.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/decisoes'
cat > 'docs/decisoes/0005-escopo-site-e-delivery.md' <<'__FIM_ARQUIVO_ERP__'
# 0005: site institucional e delivery próprio entram no escopo

- Data: 13/11/2026
- Status: aceita (pedido do responsável)
- Assunto da sessão: escopo

## Contexto
O planejamento anterior tratava delivery próprio e aplicativo do cliente como evolução.
O responsável definiu que haverá site institucional, delivery próprio pelo site com
pagamento online e aplicativo instalável para o cliente, além dos aplicativos internos.

## Decisão
- Três aplicações sobre o mesmo núcleo e o mesmo banco: `gestao` (interna), `loja`
  (delivery e app do cliente) e `site` (institucional). Regras de negócio em pacote
  compartilhado; nenhuma regra duplicada.
- A loja online e o aplicativo do cliente são a mesma aplicação web instalável (PWA).
- O pedido online entra no fluxo do RC-01; a liberação para a cozinha depende da
  confirmação autenticada do pagamento.
- Ordem: núcleo interno e RC-01 primeiro; o delivery vem depois de pagamento (F6), porque
  reutiliza os dois. O site institucional pode ser feito em paralelo, pois tem baixo risco.

## Consequências
Pagamento online, área de entrega e superfície pública passam a ser parte do projeto:
exigem provedor com ambiente de testes, limites de requisição, revisão de segurança e
teste de carga. A integração com iFood continua como evolução.

## Critério de aceite e evidência
Critérios de `requisitos/RC-07-...` e `requisitos/RC-08-...`.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/decisoes'
cat > 'docs/decisoes/0006-estoque-em-uso-e-guardado.md' <<'__FIM_ARQUIVO_ERP__'
# 0006: estoque em uso e guardado, e disponibilidade automática

- Data: 13/11/2026
- Status: aceita (definição do responsável). Substitui a 0001.
- Assunto da sessão: estoque

## Contexto
A 0001 deixava em aberto o significado de "guardado". O responsável definiu: há o estoque
disponível para uso imediato e o estoque guardado, usado depois que o primeiro acaba. O
que se pode vender deve refletir o estoque automaticamente, em todos os canais, e o
responsável pelo estoque deve ser avisado, com uma linha saudável e uma de emergência.

## Decisão
1. Dois locais por ingrediente: **em uso** e **guardado**. O consumo sai do em uso; se
   faltar, o sistema transfere do guardado automaticamente e consome.
2. Para evitar confusão com a palavra "disponível", o saldo calculado passa a se chamar
   **livre para venda**: L = F - B - R, em que F é o físico total (em uso + guardado),
   B o bloqueado e R o reservado.
3. A disponibilidade de cada produto para venda é calculada a partir das fichas técnicas
   e do livre para venda, e vale para comanda virtual, loja online e aplicativo.
4. Canal online é rígido e pode ter margem de segurança; loja física aceita autorização
   de supervisor com contagem obrigatória depois.
5. Cada ingrediente tem linha saudável e linha de emergência sobre o total, e nível de
   abastecimento sobre o em uso. O sistema sugere as linhas pelo consumo; a pessoa decide.
6. Notificações ao responsável pelo estoque: uma por cruzamento de linha, com escalada
   ao gestor para o que for urgente e não lido.

## Confirmações do responsável (13/11/2026)
- O guardado conta para a venda: a venda continua, e o responsável pelas compras recebe
  mensagem urgente quando o guardado começa a ser usado.
- Loja física com autorização de supervisor e contagem depois; delivery rígido: confirmado.

## Alternativas descartadas
- Vender só o que está em uso: obrigaria alguém a lançar transferência antes de cada
  venda, o contrário do pedido.
- Compra automática ao cruzar a linha: compra envolve dinheiro e fica com pessoa.

## Consequências
A baixa do RC-01 passa a escolher o local. O cálculo de disponibilidade precisa ser
rápido (é consultado em toda tela de venda). O estoque teórico precisa de contagens
frequentes para merecer confiança, daí a contagem rápida guiada.

## Critério de aceite e evidência
Critérios de `requisitos/RC-09-estoque-inteligente.md` e exemplos do RC-01.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/decisoes'
cat > 'docs/decisoes/0007-operacao-da-loja.md' <<'__FIM_ARQUIVO_ERP__'
# 0007: definições de operação da loja

- Data: 13/11/2026
- Status: aceita (definições do responsável). Itens 8 e 9 ajustados pela 0008.
- Assunto da sessão: cozinha, sorveteria, aparelhos

## Decisão
1. **Aparelhos internos são Android da empresa**, usados só dentro da loja. Cada
   funcionário tem login próprio e as funções do seu cargo. Não há iPhone na operação
   interna (o cliente final pode usar qualquer aparelho).
2. **Telas da cozinha por tipo de pedido**, não por lugar físico.
3. **Cafeteria** tem tela própria e entrega no próprio balcão. **Só a cozinha usa o elevador.**
4. **Marcação por item.** Em pedido de mais de uma área, o atendente pergunta se o cliente
   quer tudo junto ou por partes; cada área entrega o seu e o sistema junta a contagem.
5. **Botão Fila** na produção: visto, aguardando vez.
6. **Estimativa de tempo** pela fila e pelo tempo de preparo, para atendente e cliente.
7. **Delivery e retirada:** hoje embalados pela cozinha e enviados pelo elevador; quem
   embala e por onde sai são configuração, porque isso vai mudar.
8. **Sorveteria 60 Sabores fica fora do sistema**; só leitura de dados (RC-11).
9. **Compras e estoque são a mesma pessoa hoje**; os dois papéis continuam separados no
   sistema para poderem ser divididos depois.

## Consequências
Tudo que tratava de sorvete por peso, balança e cubas sai do escopo. O aplicativo interno
pode ser restrito a aparelhos cadastrados. A estimativa de tempo exige capacidade por
tipo e registro dos tempos reais desde o primeiro dia.

## Critério de aceite e evidência
Critérios do RC-10 e do RC-11.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/decisoes'
cat > 'docs/decisoes/0008-cargos-estoque-por-area-e-pagamento.md' <<'__FIM_ARQUIVO_ERP__'
# 0008: cargos, estoque por área, sorvete e regra de pagamento

- Data: 13/11/2026
- Status: aceita (definições do responsável). Ajusta os itens 8 e 9 da 0007.
- Assunto da sessão: cargos e operação

## Decisão
1. **Cargos** conforme `requisitos/RC-12-cargos-e-acessos.md`: Dono e Administrador com
   tudo; Gerente geral com tudo exceto financeiro; Financeiro completo; Supervisor;
   Atendente; Caixa; Cozinheira; Auxiliar de cozinha; Motoboy próprio.
2. **Estoque por área, com responsável por área:** cozinha cuida dos alimentos da cozinha;
   supervisor cuida das bebidas do salão, da cafeteria e dos potes de sorvete. **Quem
   compra é o gerente geral.** (Substitui "estoque e compras são a mesma pessoa".)
3. **Sorvete 60 Sabores:** a venda continua no sistema da franquia, mas **o controle dos
   potes é feito aqui**, em aba própria do supervisor. (Amplia o "fora do sistema" da 0007.)
4. **Entregue x Pago:** o atendente marca Entregue e o atendimento se encerra; **só o
   caixa marca Pago**. Pedido só é concluído com as duas coisas. Nada é apagado.
5. **Login na cozinha:** entrada na tela da estação com código pessoal de 4 dígitos.
6. **Supervisor não opera telas de produção:** corrige alterando o pedido.
7. **Todos os aplicativos** têm aviso no aparelho e central interna.
8. **Registro completo e busca** de pedidos, com linha do tempo.
9. Entram no escopo: caixa completo, aplicativo do motoboy, financeiro com pacote
   contábil e calculadoras (RC-13 a RC-18).

10. **Gerente geral** vê os custos da área dele e não vê o faturamento da empresa.
11. **Caixa único com maquininha avulsa:** baixa manual com conferência no fechamento;
    Pix integrado desde o início.
12. **Construção por partes**, na ordem de `03-roteiro-de-fases.md`, com Opus 5.5 como
    base e modelos menores por subagentes (`05-uso-dos-modelos.md`).

## Consequências
O sistema ficou grande. O núcleo (pedido, cozinha, estoque, caixa) entra em operação
antes de delivery, motoboy, financeiro completo e calculadoras.

## Critério de aceite e evidência
Critérios dos RC-12 a RC-18.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/decisoes'
cat > 'docs/decisoes/_modelo.md' <<'__FIM_ARQUIVO_ERP__'
# NNNN: título curto da decisão

- Data:
- Status: proposta | aceita | substituída por NNNN
- Assunto da sessão:

## Contexto
O problema e as restrições reais (fatos confirmados e hipóteses, separados).

## Decisão
O que será feito, em poucas linhas.

## Alternativas descartadas
Opção e motivo.

## Consequências
Benefício, custo de manutenção, dependências, riscos.

## Critério de aceite e evidência
Como saberemos que está pronto (teste, demonstração, medição).
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/referencias'
cat > 'docs/referencias/README.md' <<'__FIM_ARQUIVO_ERP__'
# Referências

Opcional: coloque aqui o PDF "Plano de Gestão Integrada" (revisão 2.2). O conteúdo técnico
dele já está transcrito em `docs/`; o PDF serve só para conferir detalhes. Ignore nele
tudo que for comercial.

Não coloque aqui dados reais de clientes ou funcionários, certificados ou credenciais.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/referencias'
cat > 'docs/referencias/fontes-oficiais.md' <<'__FIM_ARQUIVO_ERP__'
# Fontes oficiais para conferir

Levantadas no planejamento de 10/11/2026. Reconfirme antes de decidir: preços, limites e
regras mudam. Nenhuma marca citada significa integração homologada.

## Infraestrutura
- Hostinger VPS: https://www.hostinger.com/br/servidor-vps
- Hostinger, localização dos servidores: https://www.hostinger.com/support/1583267-where-are-hostinger-servers-located/
- Hostinger, backup de VPS: https://www.hostinger.com/support/1583232-how-to-back-up-or-restore-a-vps-at-hostinger/
- Hostinger, créditos de CPU: https://www.hostinger.com/support/how-cpu-credits-work-on-hostinger-vps/

## Ferramentas de trabalho
- Claude Code na nuvem: https://code.claude.com/docs/en/claude-code-on-the-web
- Ambientes de nuvem: https://code.claude.com/docs/en/cloud-environments
- Hooks: https://code.claude.com/docs/en/hooks
- Conector (MCP) da Hostinger: https://www.hostinger.com/support/11079316-hostinger-api-mcp-server/

## Integrações
- iFood Developer: https://developer.ifood.com.br/pt-BR
- Yodeck API: https://app.yodeck.com/api-docs/
- Yodeck offline: https://www.yodeck.com/docs/user-manual/does-yodeck-work-offline/
- Samsung VXT: https://docs.samsungvx.com/eng/001_vxtcmsoverview_1.html
- Android, dispositivos dedicados: https://developers.google.com/android/management/policies/dedicated-devices

## Fiscal, trabalhista e sanitário
- Portal Nacional da NF-e: https://www.nfe.fazenda.gov.br/portal/principal.aspx
- NFC-e em MG (RICMS): https://www.fazenda.mg.gov.br/empresas/legislacao_tributaria/ricms_2023_seco/anexov2023_2.html
- NFS-e, documentação técnica: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
- Reforma tributária do consumo: https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/manuais/reforma-tributaria-do-consumo
- Simples Nacional: https://www8.receita.fazenda.gov.br/simplesnacional/servicos/grupo.aspx?grp=5
- Registro eletrônico de ponto: https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/fiscalizacao-do-trabalho/rep
- FGTS Digital: https://www.gov.br/trabalho-e-emprego/pt-br/servicos/empregador/fgtsdigital/perguntas-frequentes
- Anvisa, boas práticas: https://bibliotecadigital.anvisa.gov.br/jspui/handle/anvisa/225
- Licenciamento em MG: https://redesim.mg.gov.br/5/licenciamento

## Equipamentos candidatos (não homologados)
- Elo KDS: https://www.elotouch.com.br/kitchen-display-systems
- Toledo Prix 3 Plus: https://www.toledobrasil.com/produto/prix-3-plus/

MG foi a referência da pesquisa fiscal. Confirme a UF e o município reais.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-01-pedido-cozinha-estoque.md' <<'__FIM_ARQUIVO_ERP__'
# RC-01: pedido automático na produção e baixa de estoque

**Pedido do cliente:** o pedido deve chegar sozinho à cozinha e já atualizar o estoque,
sem ninguém lançar ingrediente por ingrediente. É condição de aceite da primeira versão.

## Saldos (decisão 0006)
Cada ingrediente tem dois locais: **em uso** (pronto para uso imediato) e **guardado**
(reserva, usada quando o em uso acaba).

| Saldo | Definição |
|---|---|
| Físico (F) | Quantidade registrada, em uso + guardado. É saldo do sistema, conferido por contagem; não é medição do alimento real |
| Bloqueado (B) | Parte do físico imprópria para venda (quarentena, vencido) |
| Reservado (R) | Parte do físico comprometida com pedidos ainda não consumidos |
| Livre para venda (L) | **L = F - B - R.** Calculado, nunca gravado como estoque separado |

**Ordem de consumo:** primeiro o em uso. Se não cobrir, o sistema transfere do guardado
automaticamente (transferência não é consumo e não reduz o total) e consome, tudo na
mesma transação, e cria a tarefa de abastecer a linha. Disponibilidade para venda, linhas
de reposição e notificações estão no RC-09.

## Gatilho da baixa
Ao **confirmar e liberar o pedido para produção**, em UMA transação do banco:
1. resolver receita/versão, tamanho, adicionais, remoções e conversões de unidade;
2. travar os saldos envolvidos, sempre na mesma ordem (por identificador do ingrediente);
3. conferir saldo suficiente dentro da transação;
4. gravar pedido/revisão, detalhamento do consumo e movimentos de estoque;
5. atualizar saldos (e converter reserva, se houver);
6. gravar os tickets por setor e o evento na outbox.
Se qualquer passo falhar, nada é gravado.

Depois, o worker entrega os tickets aos setores. Tela, impressão, reimpressão, início do
preparo, fechamento da conta e pagamento **não** repetem a baixa.

Rascunho não consome. Reserva antes da liberação é opcional (pedido aguardando
aprovação), com prazo de expiração. Na conversão, a reserva cai junto com o físico e o
livre para venda não cai de novo.

A baixa na liberação é a política pedida pelo cliente. Baixar só no início do preparo é
alternativa que exige decisão explícita (pendência 6).

## Exemplos obrigatórios (viram testes)
| Momento | F | B | R | L |
|---|---:|---:|---:|---:|
| Sem reserva: antes | 100 | 0 | 0 | 100 |
| Sem reserva: liberar pedido que consome 10 | 90 | 0 | 0 | 90 |
| Com reserva: antes do novo pedido | 120 | 0 | 20 | 100 |
| Reservar mais 10 | 120 | 0 | 30 | 90 |
| Liberar: consumir 10 e baixar a reserva de 10 | 110 | 0 | 20 | 90 |

Com os dois locais (pedido que consome 10):

| Momento | Em uso | Guardado | F | L |
|---|---:|---:|---:|---:|
| Antes | 6 | 40 | 46 | 46 |
| Transferência automática de 4 (guardado -> em uso) | 10 | 36 | 46 | 46 |
| Consumo de 10 | 0 | 36 | 36 | 36 |

Resultado: tarefa "abastecer a linha" criada para o responsável pelo estoque.

## Da ficha técnica ao consumo
Consumo = quantidade vendida x quantidade do ingrediente na receita aplicável. Aplicar
rendimento e perda técnica uma única vez. Guardar no pedido a versão da receita e o
detalhamento calculado. O que limita a venda é o ingrediente, não o produto final:
insumos compartilhados entre receitas disputam o mesmo saldo.

**Preparo intermediário:** produzir 5 kg de molho consome tomate e demais insumos e cria
um lote de molho. A venda consome o molho, nunca os ingredientes de novo.

**Sorveteria:** fora deste requisito. É franquia com sistema próprio (RC-11).

## Modelo de dados mínimo
- `estoque_saldo` (ingrediente, local [em uso | guardado], físico, bloqueado, reservado),
  uma linha por par. Linhas de reposição e nível de abastecimento por ingrediente (RC-09).
- `estoque_movimento`, só de inserção: tipo (entrada, produção, reserva, consumo,
  transferência, perda, ajuste, estorno), quantidade, unidade, lote, local, motivo,
  responsável, vínculo com pedido/item/revisão, **chave de idempotência única**.
- `pedido`, `pedido_revisao`, `pedido_item`, `pedido_item_consumo` (detalhamento calculado).
- `ticket_producao` por setor, com estados e confirmação de recebimento.
- `outbox_evento`, gravado na mesma transação.

## Estados
- Pedido: rascunho -> confirmado -> em produção -> pronto -> entregue | cancelado.
- Item na produção: novo -> na fila -> em preparo -> pronto -> enviado (cozinha) ->
  retirado pelo atendente | cancelado. Telas, temporizador, estimativa e avisos: RC-10.
- "Entregue ao terminal" e "visto pelo operador" são coisas diferentes e ficam registradas.

## Entrega confiável ao setor
Banco e tela de cozinha não fazem parte de uma única transação. O compromisso é: pedido e
estoque consistentes, e entrega durável e monitorada, com repetição segura. A tela recebe
aviso em tempo real e, ao reconectar, busca a fila gravada. Sem confirmação do terminal,
repetir com o mesmo identificador e alertar o supervisor. Não prometer exibição
instantânea em terminal desconectado.

## Concorrência e alterações
- Dois pedidos disputando a última porção: trava por linha ou atualização condicional
  atômica; em conflito, repetir de forma limitada. Nunca decidir com base em consulta
  feita antes da transação.
- Reenvio e webhook repetido: mesmo identificador, nenhum novo consumo, nenhum novo ticket.
- Reimpressão: cópia identificada como reimpressão.
- Mudança depois de confirmado: nova revisão, movimentos só pela diferença, sujeita ao
  estágio do preparo e à alçada.

## Falhas
| Cenário | Regra |
|---|---|
| Insumo insuficiente | Não liberar. Mostrar ingrediente e quantidade faltante; oferecer substituição ou espera com aprovação. Se um canal externo já aceitou ou cobrou, abrir exceção e tratar cancelamento/reembolso |
| Cancelamento antes do preparo | Reverter só com confirmação de que o material segue utilizável; movimento compensatório; cancelar ticket |
| Cancelamento após o preparo | Estorno financeiro e perda física são registros separados; ingrediente não volta ao saldo vendável |
| Falha de envio ou de terminal | Manter pendente, repetir com o mesmo identificador, alertar. Não desfazer a baixa por causa de timeout |
| Loja sem internet | Sem coordenação entre canais não há saldo global em tempo real: limitar ou pausar canais (offline coordenado é evolução) |
| Restauração do banco | Reconciliar tickets, pedidos externos e pagamentos antes de reprocessar |

## Limite da automação
Baixa por receita é consumo teórico. Variação de porção, descarte, troca de ingrediente e
sobra exigem registro e inventário. O sistema deve permitir comparar teórico e contado.

## Critérios de aceite
1. Pedido com itens de três setores: tickets certos, baixa por receita/versão, auditoria.
2. Os exemplos numéricos acima reproduzidos, inclusive o de em uso e guardado.
3. Última porção disputada por pedidos simultâneos: nenhum saldo negativo sem autorização.
4. Mesmo pedido reenviado várias vezes: um consumo e um ticket lógico.
5. Queda depois de gravar e antes de enviar: ticket entregue na recuperação. Queda depois
   da entrega e antes do retorno: repetição sem duplicar.
6. Receita com preparo intermediário, adicionais e transferência: unidades e custos corretos.
7. Cancelamento, alteração parcial, falta de insumo e terminal desconectado: rastreáveis.
8. Meta inicial a medir (não é garantia): 95% dos pedidos recebidos no terminal em até
   3 segundos, com rede e serviços saudáveis, na carga combinada.
9. Demonstração com a equipe e inventário conferido.

Os itens 1 a 7 são testáveis na sessão de desenvolvimento. O item 8 e o 9 dependem de
homologação e da loja.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-02-midia-e-tvs.md' <<'__FIM_ARQUIVO_ERP__'
# RC-02: central de mídia e TVs

**Pedido do cliente:** escolher vídeos de comida dentro do sistema e publicar nas TVs,
por tela ou grupo, com agenda por horário e setor.

## Primeira versão: piloto com duas telas independentes
- Biblioteca: envio de vídeos e imagens autorizados, miniatura, duração, orientação, validade.
- Grupos de telas (salão, cafeteria e outros), com nome e código por tela e pareamento seguro.
- Playlists com ordem e duração; agenda por faixa de horário.
- Publicação com rascunho e histórico de quem publicou; reversão para a versão anterior.
- Estado de cada tela: última conexão, versão publicada, baixada e em execução.
- Conteúdo de contingência: o player continua com o que já baixou; campanha vencida não é exibida.

## Desenho técnico
As telas não conversam entre si: cada player consulta o sistema central. O player é uma
página do próprio ERP, aberta em modo quiosque em um aparelho dedicado validado (não o
navegador de uma Smart TV doméstica), que baixa os arquivos antes de exibir e os mantém
em cache local. O servidor cuida de catálogo, permissão e agenda; os arquivos ficam em
armazenamento próprio para mídia. Não transmitir vídeo continuamente a partir do servidor
do caixa, nem converter vídeo nele.

Alternativa se o player próprio der manutenção demais: plataforma pronta de sinalização
com API. Decidir depois do piloto, com base em falhas reais.

## Limites que precisam ficar claros para o cliente
| Necessidade | O que atende | Observação |
|---|---|---|
| Conteúdo diferente por TV | Um player por tela | É o piloto |
| Mesmo vídeo em várias telas | Mesma playlist | Pode ficar defasado: não é sincronismo |
| Vídeos sincronizados | Player e software com sincronismo próprio, rede cabeada | Evolução |
| Mesmo sinal espelhado | Um player com distribuidor HDMI | Depende de distância e dos painéis |
| Uma imagem dividida entre TVs | Video wall | Evolução, solução específica |
| Ligar e desligar a TV | Depende do modelo e da interface | Player online não prova TV ligada |

Player em execução comprova reprodução, não atenção do público nem aumento de venda.
Tela promocional é separada da tela de produção e do painel de retirada; nenhuma exibe
dado pessoal desnecessário.

## Evolução
Preço vindo do cadastro na tela; troca automática de campanha quando o produto falta;
aprovação em duas etapas; layouts com QR Code; mais telas; sincronismo.

## Critério de aceite (no equipamento real)
Parear a tela, publicar, reiniciar o player, desconectar a internet, deixar a campanha
expirar e recuperar a conexão. Só vale a combinação de TV, player e rede efetivamente testada.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-03-aplicativos-por-funcao.md' <<'__FIM_ARQUIVO_ERP__'
# RC-03: aplicativos por função

**Pedido do cliente:** cada setor com seu próprio aplicativo, com nome, navegação e
funções próprias.

**Desenho:** um núcleo único (um banco, uma API, um conjunto de regras) e várias
experiências por função, cada uma com rota, atalho de instalação e tela inicial próprios.
Nunca um banco por setor. Na primeira versão são aplicativos web instaláveis; aplicativo
nativo só quando houver necessidade real de periférico, gestão do aparelho ou execução
em segundo plano.

## Experiências
| Experiência | Faz | Não faz | Versão |
|---|---|---|---|
| Caixa | Abertura, painel de contas, recebimento, sangria, fechamento cego, emissão fiscal, expedição e motoboys (RC-13). Só o caixa marca Pago | Acessar o financeiro; alterar custo, receita, tributo ou permissão | Primeira |
| Atendimento | Abrir mesa, lançar itens, perguntar "tudo junto ou por partes", ver estimativa de tempo e a situação de cada item, receber com som e tela cheia o aviso de pronto com a mesa e o ponto de retirada, confirmar "Peguei" (RC-10) | Desconto, estorno e reabertura sem autorização | Primeira |
| Produção (cozinha: telas Geral, Hambúrgueres, Pratos e grelhados, Elevador; cafeteria: tela própria) | Colocar na fila, iniciar preparo, temporizador com cores, marcar pronto, enviar ao salão, botão "acabou", perda (RC-10) | Ver salários, contas ou relatórios globais | Primeira |
| Gestor/dono | Operação em tempo real, resultado, aprovações, exceções | Receber credencial de servidor ou banco | Primeira |
| Estoque/expedição | Painel semáforo, central de notificações com avisos no celular, abastecer a linha, entrada de mercadoria, contagem rápida, lista de compras, conferência de saída (RC-09) | Ajuste acima da alçada; compra sem aprovação | Primeira |
| Colaborador | Própria escala, tarefas, comunicados | Ver dados de colegas | Primeira (básico) |
| Financeiro | Compras a pagar, recebimentos, conciliação, resultado, pacote para a contabilidade (RC-15), calculadoras (RC-16) | Ação relevante sem dupla aprovação configurada | Básico na primeira; completo em fase própria |
| Player de TV | Reproduzir mídia publicada e informar estado técnico | Qualquer acesso a pedidos ou financeiro | Primeira (piloto) |
| Cliente (loja e app instalável) | Cardápio, pedido, pagamento, acompanhamento | Ver qualquer dado interno | Etapas E26 a E28 (RC-08) |
| Totem de autoatendimento | Pedido e pagamento na loja | — | Evolução |
| Motoboy próprio | Entregas atribuídas, mapa, código de confirmação, prestação de contas (RC-14) | Ver entregas de outros | Etapa E29 |

## Permissões
Combinar função, unidade, setor, turno e alçada de valor. Um funcionário pode acumular
papéis aprovados, com o contexto ativo visível. Validar em cada endpoint e registrar
autorizações e recusas relevantes. Pedido de desconto, compra ou ajuste vai ao
responsável, com motivo, solicitante, decisão e validade.

## Cargos e logins
Cada funcionário tem **login próprio**. O que ele pode fazer vem do **cargo**. A lista de
cargos, as fronteiras entre eles e o login nos tablets da cozinha estão no **RC-12**. O gestor cria o
funcionário, escolhe o cargo e pode ajustar permissões pontuais; tudo fica registrado.
Desligou o funcionário, o acesso é cortado na hora. Nenhuma senha compartilhada.

## Dispositivos
Todos os aparelhos internos são **Android da empresa, usados só na loja** (decisão 0007).
O aplicativo interno só abre em aparelho cadastrado. Login individual, bloqueio rápido e
troca de operador em segundos (código pessoal), sem exigir e-mail pessoal. Administração com senha forte e segundo fator. Cadastro de cada
dispositivo: setor, versão, última conexão, estado; possibilidade de desativar aparelho
perdido e revogar sessões.

PWA não dá acesso irrestrito a USB, serial ou impressão silenciosa: validar por
navegador e sistema; agente local quando necessário.

## Comunicação
Todos os aplicativos têm aviso no aparelho e central interna (RC-18).

## Critério de aceite
A mesma ação testada em todos os perfis e chamando a API diretamente. Permissão do caixa
não se estende a estoque, RH ou painel do dono. Protótipos validados com alguém do caixa,
do atendimento e da cozinha.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-04-equipamentos-e-rede.md' <<'__FIM_ARQUIVO_ERP__'
# RC-04: equipamentos e rede

O sistema não depende de marca. Equipamento só é considerado compatível depois de teste
com o modelo exato. Compra é decisão do cliente. Esta lista é ponto de partida para o
levantamento na loja; aproveitar o que já existe e passar no teste.

| Local | Equipamento | Quantidade inicial |
|---|---|---|
| Caixa | Computador com tela, impressora térmica de 80 mm (rede ou USB), pagamento integrado | 1 conjunto |
| Salão | Aparelho Android da empresa por atendente, com som e vibração, aplicativo sempre aberto; não sai da loja | 1 por atendente simultâneo |
| Cozinha (andar de baixo) | 4 tablets Android em suporte fixo, longe de calor, água e gordura: Geral, Hambúrgueres (na esteira), Pratos e grelhados (perto das panelas e do grill) e Elevador; caixa de som para os avisos; carregador fixo | 4 |
| Cafeteria | Tablet Android fixo, tela própria | 1 |
| Sorveteria 60 Sabores | Nenhum: usa os equipamentos e o sistema da franquia (RC-11) | 0 |
| Expedição | Tablet ou tela | 1, compartilhável |
| Estoque | Aparelho com câmera ou leitor 2D | 1 compartilhado |
| Gestão | Notebook | Aproveitar existente |
| TVs | Tela e player dedicado por tela | 2 no piloto |
| Rede | Roteador com dois links, switch, pontos de acesso, nobreak | Conforme a planta |

## Regras
- Fixos (caixa, telas de produção, players) em rede cabeada sempre que possível.
- Redes separadas: operação, clientes, mídia. O sistema interno não fica acessível pelo Wi-Fi de clientes.
- Nobreak dimensionado para rede e caixa; TVs e refrigeração ficam fora desse cálculo.
- Maquininha: escolher adquirente e modalidade antes do aparelho. Ter Android não significa aceitar qualquer aplicativo.
- Impressão silenciosa, porta serial e USB não são garantidas no navegador: pode ser preciso um agente local.
- Impressora, câmera, balança e banco nunca expostos à internet.
- Ter um aparelho reserva compatível.
- Todos os aparelhos internos são Android da empresa e ficam na loja: cadastrar cada um no sistema e permitir o aplicativo interno só em aparelho cadastrado.
- Rede sem fio estável no andar da cozinha: testar o sinal em cada ponto de tablet antes de fixar os suportes.
- Tablets da cozinha configurados para não apagar a tela nem bloquear durante o turno.

## O que a sessão de desenvolvimento consegue e não consegue
Consegue: escrever a integração, simular o protocolo, testar com dados sintéticos.
Não consegue: provar que funciona no aparelho. Isso exige teste na loja, registrado.

## Critério de aceite
Lista por local com modelo exato, protocolo, resultado do teste e data.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-06-fiscal-contabil-documental.md' <<'__FIM_ARQUIVO_ERP__'
# RC-06: fiscal, contábil e documental

Princípio: o sistema coleta, preserva, vincula, confere e distribui informação. O
contador valida enquadramento e obrigações. Documento importado não prova recebimento;
arquivo gerado não prova declaração transmitida; pagamento confirmado não prova nota
autorizada. O sistema não substitui os portais oficiais.

## Primeira versão: emissão pelo provedor
- Um provedor fiscal especializado, escolhido com o contador.
- Documento adequado à operação (NFC-e ou NF-e conforme regra vigente; NFS-e só quando
  houver serviço de fato). Não presumir documento por haver salão, delivery ou taxa de serviço.
- Estados reais: enviado, autorizado, rejeitado (com motivo), pendente por timeout,
  cancelado, em contingência quando permitida.
- Guardar identificadores, XML, protocolo e eventos. Reenvio idempotente.
- Pedido, pagamento e documento fiscal são registros distintos e vinculados.
- Cadastro fiscal mínimo por produto, validado pelo contador, com vigência e histórico.
  Caixa não altera tributação.
- Certificado e credenciais tratados como segredos; homologação separada de produção.

Critério de aceite: venda paga com nota rejeitada, timeout com resposta desconhecida,
reenvio e cancelamento. Estados reais preservados, nenhum documento duplicado.

## Evolução (ordem recomendada)
1. **Compras documentadas:** importação manual de XML, deduplicação, vínculo entre pedido
   de compra, documento, recebimento físico, estoque e conta a pagar. Exemplo de
   divergência: nota de 10 caixas x 12 = 120 unidades; recebidas 9 x 12 = 108; diferença
   de 12 registrada, sem alterar o XML e sem duplicar entrada ao reimportar.
2. **Área do contador:** pacote por competência (vendas, compras, despesas, devoluções,
   estoque, recebimentos), pendências, retorno de guias e protocolos, exportação no
   formato do escritório.
3. **Captura automática** por fonte autorizada e agenda de obrigações. Guia recebida,
   paga e declaração transmitida são estados diferentes. Manifestação do destinatário
   exige regra e autorização: nunca confirmar operação só para obter o arquivo.
4. **Cadastro tributário versionado:** classificações e regras por operação, com vigência,
   aprovador e preservação da regra aplicada em vendas anteriores; preparado para mudança
   normativa sem alíquota genérica fixa.
5. **Pessoal, sanitário e licenças:** repositório com permissões restritas, vigências e
   responsáveis. Envio de arquivo não comprova autenticidade nem regularidade.

## Quem vê o quê
| Destinatário | Informação |
|---|---|
| Caixa | Situação da emissão, motivo da rejeição, ação permitida |
| Compras/estoque | Itens, quantidades, lotes, divergências |
| Financeiro | Obrigações, vencimentos, guias, comprovantes |
| Contador | Documentos e relatórios da competência autorizada |
| Gestão/dono | Consolidados, exceções, decisões pendentes |
| Funcionário | Só os próprios dados |

## Confirmar antes de especificar
CNPJ e inscrições, município e UF, atividades reais, regime, contador e sistema do
escritório, documentos emitidos hoje, canais e tipos de cliente, volume de documentos.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-07-site-institucional.md' <<'__FIM_ARQUIVO_ERP__'
# RC-07: site institucional

**Pedido do cliente:** site próprio da empresa, com áreas como apresentação de produtos e
um espaço para empresas entrarem em contato.

## Estrutura proposta
| Área | Conteúdo | De onde vem |
|---|---|---|
| Início | Quem é a casa, destaques, botão "Peça agora" | Editável no sistema |
| Cardápio / produtos | Vitrine por categoria (cafeteria, almoço, lanches), fotos, descrição, alergênicos | **Mesmo cadastro do sistema** (sem digitar duas vezes) |
| Sorvetes 60 Sabores | Página de apresentação da franquia, seguindo as regras de marca dela | Editável (os sabores não vêm deste sistema, RC-11) |
| Para empresas | Encomendas, eventos, coffee break, convênio de almoço; formulário de contato | Formulário vira oportunidade no sistema, com responsável e andamento |
| Sobre e contato | História, endereço, mapa, horário, redes sociais | Editável |
| Trabalhe conosco | Formulário simples | Evolução |
| Termos e privacidade | Textos obrigatórios | Fornecidos/validados pelo cliente |

"Subsites" são seções do mesmo site (ou subdomínios do mesmo domínio), não sites separados.

## Regras
- Conteúdo que já existe no sistema (produtos, preços, horário, disponibilidade) é lido
  dele. Preço mostrado no site é o do canal correspondente.
- Textos, banners e fotos institucionais são editáveis por perfil autorizado, com
  pré-visualização e publicação (rascunho -> publicado).
- Rápido no celular, acessível, bom para busca (títulos, descrições, dados estruturados
  de restaurante e cardápio, mapa do site).
- Formulários com validação no servidor, proteção contra envio automático e consentimento
  para uso dos dados. Nada de dado interno exposto.
- Identidade visual por variáveis de tema (ver `cerebro/empresa/identidade-visual.md`).
- O site continua no ar mesmo se o sistema interno estiver em manutenção (páginas geradas
  com antecedência e cache).

## Fora desta entrega
Blog, loja de produtos com envio por correio, área de franquias, múltiplos idiomas.

## Critério de aceite
Mudar um produto no sistema reflete na vitrine; formulário de empresas cria oportunidade
visível para o gestor; páginas carregam bem em celular comum; nenhum dado sensível nas
respostas públicas.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-08-delivery-proprio-e-app-do-cliente.md' <<'__FIM_ARQUIVO_ERP__'
# RC-08: delivery próprio e aplicativo do cliente

**Pedido do cliente:** a pessoa faz o pedido pelo site, paga, e todo o processo até a
cozinha funciona completo e sem erros. Também um aplicativo instalável para pedir.

**Desenho:** a loja online e o aplicativo são a MESMA aplicação web: quem acessa pelo
navegador usa como site; quem quiser instala no celular (PWA) e ganha ícone e tela cheia.
Não há um segundo sistema. O pedido online entra no mesmo fluxo do RC-01.

## Jornada do cliente
1. Abre a loja. Vê se a casa está aberta, a **estimativa de tempo calculada pela fila real
   da cozinha** (RC-10, seção 7) e a taxa para o seu endereço.
2. Monta o pedido: tamanhos, adicionais, observações. Só aparece como disponível o que o
   estoque permite vender (RC-09), com margem de segurança nos itens críticos.
3. Escolhe entrega (endereço dentro da área atendida) ou retirada.
4. Identifica-se de forma leve (nome e telefone; conta é opcional).
5. Paga: Pix ou cartão online. Opcionalmente, pagamento na entrega (decisão do cliente).
6. Recebe a confirmação e um link de acompanhamento em tempo real.
7. Acompanha as etapas (recebido -> na fila -> em preparo -> pronto -> saiu para entrega /
   pronto para retirada -> entregue), a situação de cada item, a posição na fila e o
   horário previsto, atualizados sozinhos (RC-10, seção 8).

## Regras que garantem "sem erros"
- **Pagamento antes da cozinha.** Pedido pago online só é liberado para produção quando
  chega a confirmação autenticada do provedor (servidor a servidor). O retorno da tela do
  cliente nunca libera pedido.
- **Reserva de estoque no fechamento.** Ao iniciar o pagamento, os ingredientes são
  reservados por prazo curto. Pagou: reserva vira consumo (RC-01). Expirou: reserva é liberada.
- **Um pedido, uma cobrança, uma baixa, um ticket.** Clique duplo, página recarregada e
  aviso repetido do provedor não duplicam nada (chave de idempotência por carrinho).
- **Pagou e faltou insumo, ou a loja fechou:** estorno automático e aviso claro, com registro.
- **Pix expirado ou cartão recusado:** pedido não entra; carrinho preservado para tentar de novo.
- **Preço e taxa calculados no servidor.** O valor enviado pelo navegador nunca é confiado.
- **Loja controla a demanda:** horário de funcionamento, pausa manual, prazo ajustável e
  limite de pedidos simultâneos por faixa de horário.
- **Cartão nunca passa pelo nosso servidor:** usar o campo/checkout do provedor.
- **Dados pessoais mínimos**, com consentimento, e exclusão a pedido.
- Emissão fiscal do pedido segue o RC-06.

## Do lado da loja
- Pedido online aparece nas filas dos setores como qualquer outro, marcado com canal e tipo.
- Embalagem e saída: hoje a cozinha embala e envia pelo elevador. Quem embala e por onde
  sai são configuração (RC-10, seção 9), porque isso vai mudar.
- Entrega por motoboy próprio com aplicativo, código de confirmação e prestação de contas
  no caixa (RC-14). Motoboy do iFood: retirada registrada pelo caixa.
- Painel do gestor: pedidos em andamento, atrasos, pausar loja, área e taxa de entrega.

## Aplicativo do cliente (instalável)
- Ícone, tela cheia, abertura rápida, último endereço e "pedir de novo".
- Funciona como site para quem não instalar.
- Avisos por notificação a cada mudança de etapa e quando a previsão muda. No Android
  funcionam direto; no iPhone do cliente, só para quem instalar o aplicativo na tela
  inicial. Por isso o link de acompanhamento é o canal garantido.
- Sem conexão: mostra o cardápio em cache e avisa que não dá para pedir.
- Publicar nas lojas de aplicativos é evolução e só se fizer falta.

## Aplicativos internos envolvidos
Atendimento, cozinha, cafeteria, caixa e gestor (RC-03). Sorvete não é vendido por este
sistema (RC-11).

## Sugestões (classificadas em `cerebro/ideias-do-cliente.md`)
Retirada com hora marcada, pedido agendado, cardápio por QR Code na mesa, cupom de
primeira compra, pontos, avaliação pós-entrega, aviso por WhatsApp.

## Fora da primeira entrega do delivery
Roteirização, rastreio do entregador no mapa, entregador terceirizado por API, carteira
digital, assinatura, integração com iFood.

## Critérios de aceite
1. Pedido pago por Pix e por cartão (ambiente de testes) chega às filas certas e baixa o
   estoque uma vez.
2. Confirmação de pagamento repetida 5 vezes: um pedido, uma baixa, um ticket.
3. Dois clientes disputando o último item: só um conclui; o outro é avisado antes de pagar
   ou é estornado.
4. Pix expirado, cartão recusado, loja pausada no meio do pagamento, endereço fora da
   área: comportamento correto e mensagem clara.
5. Valor adulterado no navegador é ignorado pelo servidor.
6. Link de acompanhamento atualiza sozinho e não mostra dado de outro cliente.
7. Teste de carga representativo do pico informado.
8. 👉 Roteiro de teste em homologação executado pelo responsável e por alguém da loja.

## Depende de
RC-01 pronto, provedor de pagamento com ambiente de testes, área e taxa de entrega
definidas, política de pagamento na entrega, identidade visual.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-09-estoque-inteligente.md' <<'__FIM_ARQUIVO_ERP__'
# RC-09: estoque ligado à venda, com alertas e linhas de reposição

**Pedido do cliente:** com comanda virtual na loja e delivery pelo site, o que aparece
para vender tem de refletir o estoque, sozinho. As fichas técnicas dizem quanto cada
prato gasta; isso conversa com o estoque **em uso** (pronto para uso imediato) e com o
estoque **guardado** (usado depois que o em uso acaba). O responsável pelo estoque recebe
notificações no aplicativo sobre o gasto, e cada item tem uma linha **saudável** e uma
linha de **emergência** para reposição.

Este requisito completa o RC-01 (que trata da baixa) e vale para todos os canais.

## 1. Dois níveis de estoque
| Nível | O que é | Exemplo |
|---|---|---|
| **Em uso** | O que está na cozinha ou no balcão: pronto para uso imediato | Pote de molho aberto na bancada |
| **Guardado** | Reserva em depósito, freezer ou câmara, usada quando o em uso acaba | Caixas fechadas no depósito |

São dois locais do mesmo ingrediente. O total do ingrediente é a soma dos dois.

**Ordem de consumo:** a baixa da venda sai primeiro do **em uso**. Se não cobrir, o
sistema usa o **guardado** automaticamente: registra a passagem guardado -> em uso
(transferência automática, que não é consumo) e em seguida o consumo. Ninguém lança nada.
A venda continua normalmente. Sempre que isso acontece, os **gerentes gerais, que fazem as compras,
recebem uma mensagem urgente**: "começou a usar o estoque guardado de X" (decisão do
responsável, 13/11/2026), e quem cuida daquela área de estoque recebe a tarefa "abastecer a
linha: trazer X do guardado". Essa tarefa também nasce quando o em uso cai abaixo do
nível combinado.

**Nomes usados no sistema (para não confundir):**
- *Em uso* e *Guardado*: os dois níveis acima.
- *Bloqueado*: impróprio para venda (vencido, em quarentena).
- *Reservado*: comprometido com pedido ainda não liberado (ex.: delivery aguardando pagamento).
- *Livre para venda* = (em uso + guardado) - bloqueado - reservado. É calculado, nunca digitado.

## 2. Disponibilidade automática para venda
Para cada produto, o sistema calcula **quantas porções ainda dá para vender**: o menor
resultado de (livre para venda do ingrediente ÷ quanto a ficha técnica gasta), olhando
todos os ingredientes da receita, tamanhos e adicionais.

- Ingrediente compartilhado entre pratos é considerado: vender hambúrguer reduz o que
  sobra de todo prato que usa o mesmo pão.
- Preparo intermediário (molho, massa, recheio): conta o que está **pronto**. Matéria-prima
  crua não vira porção vendável sozinha; em vez disso o sistema avisa "produzir mais molho".
- **Chegou a zero:** o produto (ou o adicional, ou o tamanho) aparece como esgotado na
  comanda virtual, na loja online e no aplicativo, na hora. **Entrou estoque:** volta sozinho.
- **Poucas unidades:** selo "últimas unidades" para o atendente; na loja online, opcional.
- **Margem de segurança por canal:** o estoque do sistema é teórico (porção varia,
  há perda). Na loja online, segurar uma margem configurável por ingrediente crítico
  para não vender o que não existe. Na loja física, quem está no salão vê a cozinha.
- **Canal online é rígido:** sem saldo, não vende. **Loja física tem válvula:** supervisor
  pode autorizar a venda mesmo com saldo zerado no sistema (o físico pode estar certo e o
  sistema errado); a autorização gera automaticamente uma tarefa de contagem do item.
- **Botão "acabou" na cozinha:** a produção marca um item como esgotado com um toque,
  mesmo que o sistema mostre saldo. O produto sai de todos os canais e nasce uma tarefa de
  contagem para corrigir o saldo. É a correção mais rápida para a diferença entre teoria e realidade.
- A verificação que vale é sempre a feita dentro da transação do pedido (RC-01). O número
  mostrado na tela é informação, não garantia.

## 3. Linhas de reposição
Cada ingrediente tem duas linhas sobre o total (em uso + guardado):

| Situação | Condição | Significado | Cor |
|---|---|---|---|
| Saudável | Acima da linha saudável | Tudo certo | Verde |
| Repor | Entre a linha saudável e a de emergência | Hora de comprar com calma | Amarelo |
| Emergência | Abaixo da linha de emergência | Comprar já; risco de faltar | Vermelho |
| Esgotado | Zero livre para venda | Produtos saíram do cardápio | Cinza escuro |

E um terceiro nível, só do **em uso**: o **nível de abastecimento da linha**. Abaixo
dele, gera tarefa de trazer do guardado (não é compra, é movimentação interna).

**Como definir as linhas**
- No início: valores informados pelo responsável pelo estoque, por ingrediente.
- Depois de algumas semanas de uso: o sistema **sugere** as linhas a partir do consumo real:
  - linha de emergência = consumo médio diário x dias que o fornecedor leva para entregar;
  - linha saudável = emergência + folga (dias de segurança escolhidos pela casa).
- A sugestão considera dia da semana (sábado gasta mais que terça). Quem decide é a
  pessoa: o sistema propõe, o responsável aceita ou ajusta, e fica registrado.
- Mostrar também **"dura até"**: no ritmo atual, este item acaba em tal dia.

## 4. Notificações
O estoque é dividido em **áreas**, cada uma com seu responsável (decisão 0008):

| Área de estoque | Quem cuida (linha, contagem, perda) | Quem compra |
|---|---|---|
| Alimentos da cozinha | Cozinheiras | Gerente geral |
| Bebidas dos freezers do salão | Supervisor | Gerente geral |
| Cafeteria | Supervisor | Gerente geral |
| Potes de sorvete 60 Sabores (RC-11) | Supervisor | Gerente geral |

Cada pessoa vê e movimenta só a própria área. Avisos de abastecer a linha, contagem e
"acabou" vão para quem cuida da área; avisos de compra (linha saudável, emergência,
começou a usar o guardado) vão para os **gerentes gerais**. Na cozinha, o aviso aparece
nas telas da estação e para a cozinheira titular. Chegam no aplicativo
(central de notificações) e como aviso no celular.
Cada uma tem prioridade, vínculo com o item e um botão de ação.

| Evento | Prioridade | Ação oferecida |
|---|---|---|
| Item cruzou a linha saudável | Normal | Colocar na lista de compras |
| Item cruzou a linha de emergência | Urgente | Comprar agora / registrar entrada |
| Item esgotou e tirou produtos do cardápio | Urgente | Ver produtos afetados / registrar entrada |
| Em uso abaixo do nível de abastecimento | Normal | Confirmar que trouxe do guardado |
| Começou a usar o estoque guardado de um item | **Urgente, para os gerentes gerais (compras)** | Colocar na lista de compras / ver quanto resta e "dura até" |
| Preparo intermediário acabando | Normal | Abrir ordem de produção |
| Lote perto do vencimento | Normal | Usar primeiro / registrar descarte |
| Consumo fora do normal (muito acima do esperado para as vendas) | Normal | Abrir contagem do item |
| Botão "acabou" ou venda autorizada sem saldo | Normal | Fazer a contagem |
| Resumo do turno ou do dia | Informativa | Ver consumo, perdas e lista de compras |

**Regras para a notificação ajudar em vez de irritar**
- Avisa **uma vez por cruzamento de linha**, não a cada venda. Só avisa de novo se o item
  se recuperar e cair outra vez. O mesmo vale para o aviso de uso do guardado: um por
  item a cada vez que o guardado começa a ser usado, não um por venda.
- Atenção de projeto: se a quantidade em uso de um item for pequena por natureza, o aviso
  urgente de uso do guardado vai tocar todo dia e perder força. Por isso ele pode ser
  desligado ou rebaixado por item, e a quantidade em uso deve ser dimensionada para
  durar pelo menos um turno.
- Urgente não lido é repetido e, depois de um tempo configurável, **sobe para o gestor**.
- Itens agrupados: "5 itens entraram em reposição" em vez de cinco avisos.
- Horário de silêncio configurável para o que não é urgente.
- Toda notificação pode ser marcada como "ciente" e fica no histórico com quem viu e quando.
- Os aparelhos internos são Android da empresa (decisão 0007): o aviso chega com som e
  vibração, e a central dentro do aplicativo guarda o histórico.

## 5. Sugestões incluídas
1. **Lista de compras automática**, agrupada por fornecedor, com a quantidade para voltar
   à linha saudável; o responsável revisa e aprova (compra nunca é automática).
2. **Contagem rápida guiada:** todo dia o aplicativo pede a contagem de poucos itens
   (os mais caros, os que mais divergem, os marcados com "acabou"). Mantém o estoque
   teórico honesto sem parar a loja para inventário.
3. **Primeiro que vence, primeiro que sai:** ao trazer do guardado, indicar o lote a usar.
4. **Painel do estoque em uma tela:** semáforo de todos os itens, "dura até", o que está
   afetando o cardápio agora.
5. **Aviso ao gestor de venda perdida:** quantas vezes um produto ficou esgotado e por
   quanto tempo (mostra o custo de não repor).
6. **Entrada de mercadoria simples:** registrar a compra recebida em poucos toques, já
   direcionando para guardado ou em uso.
7. **Sorveteria fora:** o estoque da 60 Sabores é da franquia e não entra aqui (RC-11).

## 6. Fica para depois (evolução)
Previsão de demanda por clima e eventos; pedido automático ao fornecedor; leitura de nota
fiscal para dar entrada; sensores e balanças conectadas; sugestão de produção diária.

## Critérios de aceite
1. Venda que cabe no em uso: baixa só do em uso.
2. Venda maior que o em uso: transferência automática do guardado e consumo, com total
   correto e tarefa de abastecimento criada.
3. Ingrediente compartilhado zera: todos os produtos que dependem dele ficam esgotados em
   todos os canais; entrada de estoque os traz de volta, sem ação manual.
4. Margem de segurança: loja online esgota antes da loja física, conforme configurado.
5. Cruzar a linha saudável gera um aviso; dez vendas seguintes abaixo dela não geram outros.
5a. Primeira venda que usa o guardado gera mensagem urgente aos gerentes gerais;
    as vendas seguintes do mesmo item não repetem.
6. Cruzar a linha de emergência gera aviso urgente; sem leitura, sobe para o gestor.
7. Botão "acabou": produto some dos canais e a tarefa de contagem aparece.
8. Venda autorizada sem saldo na loja física: registrada com autor e tarefa de contagem.
9. Sugestão de linhas calculada a partir de consumo simulado bate com a conta manual.
10. Tudo acima com dois pedidos simultâneos disputando o mesmo item, sem saldo negativo indevido.

## Depende de
Fichas técnicas reais, unidades e conversões, prazo de entrega dos fornecedores e a área
de estoque de cada item.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-10-telas-da-cozinha.md' <<'__FIM_ARQUIVO_ERP__'
# RC-10: produção, telas, temporizador, estimativa de tempo e avisos

**Pedido do cliente:** telas na cozinha mostram o pedido recebido, com som a cada pedido
novo. A cozinheira pode colocar o pedido **na fila** (viu, mas está ocupada), **iniciar
o preparo** (dispara um temporizador com o tempo do produto, que muda de cor) e marcar
**pronto**. O atendente que fez o pedido é avisado no aparelho, com som e a mesa certa.
O cliente acompanha as etapas pelo aplicativo e vê uma **estimativa de tempo** que
considera a fila e o tempo de preparo do próprio pedido.

Completa o RC-01 (o pedido chega e baixa o estoque uma única vez).

## 1. Áreas de produção e telas
| Área | Onde fica | Como entrega | Telas |
|---|---|---|---|
| **Cozinha** | Andar de baixo | **Elevador** de carga até o salão | Geral, Hambúrgueres, Pratos e grelhados, Elevador |
| **Cafeteria** | Salão | No próprio balcão da cafeteria | Tela própria |
| **Sorveteria 60 Sabores** | Salão | Autoatendimento da franquia | **Fora deste sistema** (RC-11) |

As telas da cozinha são **por tipo de pedido, não por lugar**: cada tela é um filtro de
tipos de produto, configurável sem programação.

| Tablet | Fica | Mostra |
|---|---|---|
| Geral | Ponto de coordenação | Todos os pedidos da cozinha e a situação de cada item |
| Hambúrgueres | Na esteira de hambúrguer | Itens do tipo hambúrguer |
| Pratos e grelhados | Perto das panelas e do grill | Itens desse tipo |
| Elevador | Junto ao elevador | Todos os pedidos da cozinha por mesa: o que está pronto e o que falta; botão **Enviar** |

Cada produto tem um tipo. Criar um tipo novo ou outra tela é configuração.

## 2. Situações de cada item
| Situação | Quem muda | O que o atendente e o cliente veem |
|---|---|---|
| **Novo** | Automático, ao chegar | "Enviado à cozinha" |
| **Na fila** | Cozinheira toca em **Fila** | "A cozinha viu e colocou na fila" + posição na fila |
| **Em preparo** | Cozinheira toca em **Iniciar** | "Em preparo" + tempo previsto |
| **Pronto** | Cozinheira toca em **Pronto** | "Pronto" |
| **Enviado** (só cozinha) | Toque em **Enviar** na tela do Elevador | "No elevador" |
| **Retirado** | Atendente toca em **Peguei** | Sai das telas de produção |
| **Entregue** | Atendente toca em **Entregue** ao servir a mesa | Atendimento encerrado; a conta segue aberta até o caixa marcar Pago (RC-17) |

**Botão Fila:** confirma que a cozinha viu o pedido e ainda não começou. Para o som de
pedido novo daquele cartão e mostra ao atendente que não foi esquecido. Pular a Fila e
tocar direto em Iniciar também vale. Pedido "Novo" que ninguém tocou em um tempo
ajustável é destacado na tela Geral e avisado ao supervisor.

A marcação é **por item**, com atalho "tudo pronto" no cartão. Cada toque fica em nome
de quem está na tela da estação (login por código pessoal, RC-12).

**Correção de pedido:** o supervisor (ou o atendente, com autorização) altera o pedido no
aplicativo de atendimento. A cozinha recebe a alteração destacada e com som; item já em
preparo ou pronto exige confirmação da cozinha e pode gerar perda registrada. O
supervisor vê as telas de produção, mas não muda situações nelas.

## 3. Temporizador e cores
Cada produto tem **tempo de preparo padrão** no cadastro.

| Cor | Condição (ajustável) | Significado |
|---|---|---|
| Branco, piscando | Novo | Ninguém viu ainda |
| Azul | Na fila | Visto, aguardando vez |
| Verde | Em preparo, até 70% do tempo | No prazo |
| Amarelo | De 70% a 100% | Atenção |
| Vermelho, piscando | Acima de 100% | Atrasado |

- Relógio grande em contagem regressiva, com barra que se esvazia.
- Item Novo ou Na fila também muda de cor pelo **tempo de espera**, para pedido parado
  não passar despercebido.
- Cartões ordenados sozinhos: o mais urgente primeiro.
- O tempo é contado pelo servidor: tablet que desliga e volta mostra o relógio certo.
- Os tempos reais ficam registrados e, com o uso, substituem o tempo padrão nas
  estimativas e geram sugestão de correção do cadastro.

## 4. Sons
| Evento | Onde | Som |
|---|---|---|
| Pedido novo | Telas do tipo envolvido e Geral | Campainha marcante, repetida até alguém tocar em Fila ou Iniciar |
| Pedido alterado ou cancelado após iniciado | Tela afetada | Alerta próprio, cartão destacado |
| Item atrasado | Tela do item | Bipe curto, a intervalos |
| Pedido completo da cozinha | Elevador | Som curto |
| Pronto para buscar | Aparelho do atendente | Som próprio e vibração até o "Peguei" |

Todo som tem também sinal visual. Volume e som são configuráveis. Cada tela abre o turno
com o botão **"Ativar som"** e mostra aviso fixo se o som estiver desligado. Prever
caixa de som na cozinha (RC-04).

## 5. Pedido com mais de uma área
Cada área entrega o que é dela: a cozinha pelo elevador, a cafeteria no balcão dela. O
sistema **conta o que está pronto em cada área e junta**.

Quando o pedido da mesa envolve mais de uma área, o aplicativo do atendente pergunta, no
momento de lançar, **como o cliente quer receber**:

| Opção | O que o sistema faz |
|---|---|
| **Tudo junto** (padrão) | Coordena o início entre as áreas para terminarem perto uma da outra e avisa o atendente uma vez, quando **tudo** estiver pronto: "Mesa 12 completa: elevador + cafeteria" |
| **O que ficar pronto, pode trazer** | Avisa o atendente a cada área que conclui: "Mesa 12, 1ª parte: cafeteria" |
| **Estes itens antes** | O atendente marca o que vem primeiro (ex.: bebidas, entrada); esses itens têm aviso próprio e o restante segue como "tudo junto" |

- **Terminar juntos:** em "Tudo junto", o item ou a área mais rápida recebe a indicação
  "iniciar em X min", para nada esfriar nem derreter esperando.
- O atendente sempre vê, por mesa, o painel de cada área: pronto, em preparo, na fila.
- Em "Tudo junto", se uma área atrasar muito (limite ajustável), o atendente é avisado
  para decidir se leva a parte pronta.

## 6. Aviso ao atendente
- Aparelhos **Android da empresa**, usados só dentro da loja, com o aplicativo instalado
  e sempre aberto; tela não apaga durante o turno.
- O aviso vai para **quem lançou o pedido**: som, vibração e tela cheia com a mesa, os
  itens e **onde buscar** (elevador, cafeteria).
- Sem "Peguei" no tempo ajustável (padrão 60 segundos), vai para todos os atendentes do
  turno e para o supervisor. Atendente em pausa ou fora do turno: já nasce para todos.
- Faixa fixa no aplicativo com todas as mesas aguardando retirada.
- Itens que não passam por área de produção (ex.: bebida da geladeira) não entram nessa
  contagem; o atendente pega direto.

## 7. Estimativa de tempo
Mostrada ao **atendente** ao lançar, ao **cliente** antes de confirmar o pedido (loja
online e aplicativo) e durante o acompanhamento.

**Conta:**
1. **Espera na fila de cada tipo** = soma do tempo que falta dos itens à frente
   ÷ quantos itens aquele tipo consegue fazer ao mesmo tempo (capacidade, configurável
   por tipo e ajustável por turno).
2. **Preparo do pedido em cada área** = espera daquela fila + o maior tempo de preparo
   entre os itens do pedido naquela área (itens feitos em paralelo até a capacidade).
3. **Pedido pronto** = a área mais demorada (em "Tudo junto").
4. **Somar as etapas fixas**: conferência e elevador; embalagem; e, no delivery, o tempo
   de deslocamento da região de entrega.

**Regras para a estimativa ser confiável:**
- Usar os **tempos reais medidos** por produto, dia da semana e horário assim que houver
  dados; antes disso, o tempo padrão do cadastro.
- Prometer pelo lado seguro: usar o tempo que a cozinha cumpre na grande maioria das
  vezes, não a média. Chegar antes do prometido é bom; depois, não.
- Mostrar como **faixa e horário**, arredondados: "25 a 35 min, previsto para 20:15".
- **Recalcular ao vivo** conforme a fila anda. Se piorar além de um limite, avisar o
  cliente e o atendente com a nova previsão; não esconder atraso.
- Item marcado "Na fila" ou "Novo" conta como trabalho à frente; item "Em preparo" conta
  só o que falta no relógio.
- **Proteção automática:** quando a estimativa passa do limite definido pela casa, a loja
  online mostra o prazo maior com destaque ou entra em pausa (RC-08), e o gestor é avisado.
- Relatório **prometido x realizado**, para calibrar capacidades e tempos.

## 8. O que o cliente vê (aplicativo e link de acompanhamento)
- Linha de etapas: **Recebido -> Na fila -> Em preparo -> Pronto -> Saiu para entrega /
  Pronto para retirada -> Entregue**, com a etapa atual destacada e as concluídas marcadas.
- Detalhe por item: "Hambúrguer: em preparo. Batata: pronta. Café: na fila".
- Posição na fila enquanto aguarda ("2 pedidos na sua frente").
- Horário previsto e contagem regressiva, atualizados sozinhos.
- Aviso quando muda de etapa e quando a previsão muda.
- Cliente no salão pode acompanhar o pedido da mesa lendo um QR Code (sem instalar nada).
- O cliente nunca vê nomes de funcionários, outros pedidos ou dados internos.

## 9. Delivery e retirada
Hoje: a cozinha embala e o pedido sobe pelo elevador. **Isso vai mudar**, então fica
como configuração, não como regra fixa:
- quem embala: cozinha ou expedição no salão;
- por onde sai: elevador ou outro ponto;
- quem libera para o entregador ou para o cliente.
Trocar é alterar a configuração; as telas se ajustam (a etapa "embalar" aparece na tela
de quem embala).

## 10. Uso com as mãos ocupadas
Botões grandes, texto grande, alto contraste, uma ação por toque. **Desfazer** por alguns
segundos. Observações e alergias em destaque. Canal visível (mesa, balcão, retirada,
delivery com horário prometido). Botão **"Acabou"** em cada item (RC-09). Reconexão
automática com a fila gravada; aviso grande se a conexão cair.

## 11. Sugestões incluídas
1. **Gargalo à vista:** a tela Geral mostra a fila e o atraso médio de cada tipo, para remanejar gente.
2. **Capacidade por turno:** o gestor informa quantas pessoas há em cada tipo; a estimativa se ajusta.
3. **Reabrir pedido:** subiu errado ou faltou item, o atendente devolve com um toque e volta com prioridade.
4. **Prioridade manual** na tela Geral (ex.: mesa que já reclamou), registrada com autor.
5. **Painel de desempenho:** tempo por produto, tipo e turno; atrasos; pico; prometido x realizado.
6. **Etiqueta da mesa** impressa no elevador (opcional).
7. **Senha na TV do salão** para retirada no balcão (liga com o RC-02).
8. **Aviso de fila cheia ao atendente antes de lançar:** "cozinha com 25 min de fila", para ele já informar o cliente.

## Fica para depois (evolução)
Botoeira física ou pedal; distribuição automática entre cozinheiras; estimativa com
previsão de demanda; rastreio do entregador no mapa.

## Critérios de aceite
1. Pedido com hambúrguer e prato aparece nas duas telas de tipo, na Geral e no Elevador,
   e toca nas duas.
2. Fila -> Iniciar -> Pronto mudam a cor e a situação; o atendente vê cada mudança.
3. Temporizador usa o tempo do produto; cores mudam nos limites; item parado muda pela espera.
4. Pedido com cozinha e cafeteria em "Tudo junto": um único aviso ao atendente, quando as
   duas áreas concluem, com os dois pontos de retirada. Em "pode trazer": um aviso por área.
5. "Enviar" no Elevador avisa o atendente certo, com a mesa certa; sem "Peguei", sobe para todos.
6. Toque duplo em qualquer botão não gera aviso em dobro.
7. Estimativa: com fila conhecida e tempos definidos, o valor calculado bate com a conta
   manual; muda quando um item à frente é concluído; aumenta quando entra pedido na frente
   por prioridade.
8. Acompanhamento do cliente mostra as etapas e os itens corretos e nenhum dado de terceiros.
9. Mudar "quem embala" na configuração move a etapa de tela, sem alteração de código.
10. Tablet desligado e religado volta com fila e relógios corretos.
11. 👉 Teste na cozinha real, com barulho, nos tablets e nos aparelhos dos atendentes.

## Depende de
Tempo de preparo e tipo de cada produto, capacidade de cada tipo por turno, tempo de
deslocamento por região de entrega, rede sem fio estável no andar da cozinha.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-11-sorveteria-60-sabores.md' <<'__FIM_ARQUIVO_ERP__'
# RC-11: sorveteria 60 Sabores (franquia, sistema próprio)

**Definição do responsável (13/11/2026):** a sorveteria é uma franquia chamada 60 Sabores,
de autoatendimento, que já opera com o sistema de gestão da franquia (informado como
"Mollbyte"). Este projeto **não comanda nem cria nada dos sorvetes**: não cadastra
sabores, não controla o estoque deles, não registra a venda e não emite a nota deles.
O objetivo é **conversar com o sistema da franquia para extrair o que for necessário**.

**Complemento do mesmo dia:** o supervisor precisa fazer o estoque da 60 Sabores, então
este sistema terá uma **aba de controle dos potes de sorvete** (seção abaixo). A venda
continua sendo do sistema da franquia.

## O que fica fora deste sistema
Venda por peso, balança, caixa e fiscal da sorveteria. O RC-01 e o RC-10 não se aplicam
a ela, e não há baixa de sorvete por venda (a venda acontece em outro sistema).

## Aba "Potes de sorvete" (supervisor)
Controle por **pote**, que é como o estoque de buffet funciona na prática.

| Função | Como |
|---|---|
| Sabores | Lista dos sabores da franquia, ativa ou inativa. Cadastro simples, só para o controle |
| Recebimento | Potes recebidos por sabor, data, lote e validade |
| **Guardado** | Potes fechados no freezer de reserva |
| **Em uso** | Potes abertos no buffet (um por sabor em exposição) |
| **Troca de pote** | Um toque: "abri um pote novo de morango". O pote antigo é dado como consumido (ou com sobra registrada) e um pote sai do guardado. É o consumo da sorveteria |
| Perda | Descarte por validade, derretimento ou contaminação, com motivo |
| Contagem | Contagem rápida dos potes guardados por sabor; diferença com justificativa |
| Linhas de reposição | Linha saudável e de emergência por sabor, em número de potes (mesma lógica do RC-09) |
| Pedido à franquia | Lista de reposição sugerida por sabor, para o gerente geral fazer o pedido |
| Avisos | Sabor sem pote guardado, sabor em emergência, pote perto do vencimento, sabor em exposição sem reposição |
| Histórico | Consumo de potes por sabor, por dia e semana: mostra os sabores que mais saem |

Regras: o sistema não calcula venda nem peso; não mexe no sistema da franquia; a
reposição é comprada pelo gerente geral. Comparar potes consumidos com as vendas lidas
do sistema da franquia (quando houver) aponta perda fora do normal.

## O que queremos extrair (a confirmar com o cliente)
| Dado | Para quê | Frequência desejada |
|---|---|---|
| Vendas do dia (valor total, quantidade/peso, número de atendimentos) | Visão consolidada da casa para o gestor | Diária |
| Vendas por forma de pagamento | Fechamento e conciliação | Diária |
| Consumo de insumos da sorveteria | Lista de compras única, se o cliente quiser | Semanal |
| Vendas por horário | Entender picos junto com o restante da casa | Diária |

Tudo **somente leitura**. Os números da sorveteria aparecem no painel do gestor
identificados como "origem: sistema da franquia", sem se misturar ao estoque nem ao
caixa deste sistema.

## Situação da integração
**Não confirmada.** Pesquisa em 13/11/2026 não encontrou site, documentação pública nem
API de um sistema chamado "Mollbyte"; o nome pode ter outra grafia. A franquia existe e
tem site próprio (sorveteria60sabores.com.br). Não presumir que existe API.

## Caminhos possíveis, do melhor para o mais simples
1. **API ou webhook** do sistema da franquia, se existir e a franqueadora autorizar.
2. **Exportação de relatórios** (CSV, Excel ou PDF) que o sistema já gere: importação
   agendada ou envio de arquivo pelo gestor.
3. **Relatório por e-mail** enviado automaticamente pelo sistema da franquia, lido por
   uma rotina.
4. **Documentos fiscais** emitidos pela sorveteria (XML), se o CNPJ for o mesmo ou o
   cliente tiver acesso: dão vendas com confiança, sem depender do sistema.
5. **Lançamento manual do fechamento diário** em uma tela simples (três ou quatro números).

Começar pelo caminho 5 (funciona no primeiro dia) e subir de nível conforme a resposta
da franqueadora. Construir atrás de uma interface única, para trocar o caminho sem mexer
no painel.

## Cuidados
- O contrato de franquia pode restringir acesso a dados ou integrações: perguntar antes.
- Não fazer raspagem de tela nem usar a senha de alguém para "robô" acessar o sistema da
  franquia sem autorização por escrito.
- Verificar se a sorveteria tem CNPJ próprio: muda fiscal e consolidação financeira.

## Presença nos outros canais (decidir com o cliente)
- Site institucional: página da 60 Sabores como apresentação, seguindo as regras de
  marca da franquia.
- Delivery próprio e comanda do salão: sorvete **não** é vendido por este sistema, a menos
  que o cliente e a franqueadora decidam o contrário (seria outro requisito).

## Critério de aceite
Painel do gestor mostra o resultado diário da sorveteria com origem e data identificadas;
a troca de caminho de coleta não altera o painel; nenhuma escrita é feita no sistema da
franquia. Na aba de potes: receber, trocar pote, registrar perda e contar mantêm o saldo
por sabor correto; cruzar a linha gera aviso ao supervisor e item na lista do gerente.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-12-cargos-e-acessos.md' <<'__FIM_ARQUIVO_ERP__'
# RC-12: cargos, acessos e login

Definições do responsável em 13/11/2026. Cada funcionário tem login próprio; o que ele
pode fazer vem do cargo. Permissão é verificada no servidor em cada ação.

## Cargos
| Cargo | Acesso | Responsabilidades |
|---|---|---|
| **Dono** | Tudo | — |
| **Administrador** (responsável técnico) | Tudo, inclusive configuração | Suporte e manutenção |
| **Gerente geral** | Tudo, **exceto financeiro** | Áreas do andar de baixo; **faz as compras** pedidas pelo estoque; aprova ajustes e exceções |
| **Financeiro** | Financeiro completo | Da compra ao pagamento, conciliação e documentos para a contabilidade externa (RC-15) |
| **Supervisor** | Atendimento, salão e funcionários de salão; cozinha **só para ver**; alterar e corrigir pedidos; estoque dos freezers de bebida do salão, da cafeteria e dos potes de sorvete (RC-11) | Turno do salão; autorizações do caixa e do atendimento |
| **Atendente** | Atendimento: mesas, pedidos, acompanhamento, entrega | Lança o pedido e marca **Entregue** |
| **Caixa** | Frente de caixa e a própria movimentação do dia (RC-13) | Recebe; **só o caixa marca Pago**; organiza motoboys |
| **Cozinheira** | Telas de produção; estoque de alimentos da cozinha: abastecer a linha, contagem, perda, "acabou" | Produção e controle do estoque que usa |
| **Auxiliar de cozinha** | Telas de produção (fila, iniciar, pronto); contagem quando designado | Apoio à produção |
| **Motoboy próprio** | Aplicativo de entregas (RC-14): só as entregas atribuídas a ele | Entrega e prestação de contas |
| **Contador externo** (opcional) | Somente leitura do pacote contábil | — |

O gestor cria o funcionário e escolhe o cargo; ajustes pontuais de permissão ficam
registrados com autor e motivo. Desligamento corta o acesso na hora. Uma pessoa pode ter
mais de um cargo, com o cargo ativo sempre visível na tela.

## Fronteiras que precisam ficar claras
| Tema | Regra |
|---|---|
| **Gerente geral e dinheiro** | Vê os **custos da área dele** (compras, custo dos itens, perdas, custo do prato). **Não vê o faturamento da empresa**, nem saldo de contas, contas a pagar e receber, resultado, retiradas de sócios ou fechamentos consolidados (definido em 13/11/2026) |
| **Supervisor e cozinha** | Não toca nas telas de produção. Para corrigir um pedido, ele **altera o pedido** no aplicativo de atendimento; a cozinha recebe a alteração destacada, com som (RC-10). Assim a produção continua sendo registrada só por quem produz |
| **Caixa e financeiro** | O caixa vê a própria sessão e a movimentação do dia. O fechamento alimenta o financeiro automaticamente, sem o caixa ter acesso a ele |
| **Estoque por área** | Cozinha: alimentos da cozinha. Supervisor: bebidas do salão, cafeteria e potes de sorvete. Cada um vê e movimenta só a sua área. Compras de todas: gerente geral |
| **Entregue x Pago** | Atendente marca Entregue (o atendimento se encerra). Só o caixa marca Pago. Nada é apagado |

## Login na cozinha (tablets compartilhados)
Problema: o tablet é da estação, não da pessoa, e as mãos estão ocupadas e sujas.

**Solução adotada: "quem está nesta tela".**
1. **O código é digitado uma vez só, no início do turno.** A pessoa toca na própria foto
   na tela da estação e digita o **código pessoal de 4 dígitos**. Leva três segundos.
2. A partir daí a **foto dela fica no topo da tela** durante o turno todo. Ninguém digita
   código a cada pedido.
3. Se ela está sozinha na tela, todo toque em Fila, Iniciar ou Pronto já sai em nome dela,
   sem fazer mais nada.
4. Se há duas pessoas na mesma tela (ex.: cozinheira e auxiliar), as duas fotos ficam no
   topo e uma está destacada como "ativa". Para assumir, a outra **só toca na própria
   foto** (um toque, sem código) e os próximos toques passam a ser dela.
5. Trocar de estação ou sair para o intervalo: um toque no nome e "Sair". A tela Geral
   mostra quem está em cada estação.
6. Fim do turno: saída automática no horário configurado, para ninguém ficar "logado" de véspera.
7. Só as ações sensíveis (registrar perda, ajuste de estoque, "acabou") pedem o código de novo.

Cozinheira e auxiliar usam a mesma tela; o cargo define os botões que aparecem.

**Opção de evolução:** crachá de aproximação (NFC) ou crachá com QR Code lido pela
câmera do tablet, para entrar sem digitar. Avaliar depois de ver o uso real do código.

## Aparelhos
Aparelhos internos são Android da empresa e ficam na loja; o aplicativo interno só abre
em aparelho cadastrado. Exceção a decidir: aparelho do motoboy (pendência 39).

## Critério de aceite
Para cada cargo, a mesma lista de ações testada pela tela e chamando o servidor
diretamente: o que não é do cargo é recusado e fica registrado. Caixa não acessa
financeiro; gerente não acessa financeiro; supervisor não muda situação de produção;
motoboy só vê as próprias entregas; código errado três vezes bloqueia e avisa o supervisor.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-13-caixa.md' <<'__FIM_ARQUIVO_ERP__'
# RC-13: caixa

O caixa recebe tudo da loja, no mesmo computador em que os pedidos são acompanhados.
Precisa ser rápido para o operador e à prova de erro e de desvio para a casa. O caixa
não tem acesso ao financeiro: vê só a movimentação do próprio dia.

## 1. Abertura
- Uma **sessão de caixa** por operador e por terminal. Não se vende sem sessão aberta.
- **Fundo de troco** contado por cédula e moeda; o sistema soma. Diferença em relação ao
  que ficou do fechamento anterior é apontada e precisa de justificativa.
- Abertura registra operador, horário e terminal.

## 2. Tela principal (caixa e pedidos juntos)
- **Painel de contas:** mesas e comandas abertas, com situação de cada uma: em
  atendimento, **entregue aguardando pagamento**, conta pedida. As que esperam pagamento
  há mais tempo ficam no topo e mudam de cor.
- **Lançar pedido** de balcão, retirada e telefone direto no caixa (segue o RC-01).
- **Pedidos online:** já chegam pagos pelo provedor; o caixa só acompanha.
- **Botão "Pedir a conta"** no aplicativo do atendente faz a mesa aparecer destacada aqui.

## 3. Recebimento
- Dinheiro (com cálculo de troco), Pix, débito, crédito, vale-refeição e **pagamento misto**.
- Divisão da conta: por pessoa, por item ou em partes iguais. Pagamento parcial permitido;
  a conta só fecha quando o total está quitado.
- Taxa de serviço opcional, mostrada separada (pendência 45).
- **Só o caixa marca Pago.**
- **Maquininha avulsa (situação atual, um caixa):** a baixa é manual. O operador passa o
  cartão na maquininha, e no sistema escolhe a forma (débito, crédito, vale), a bandeira,
  digita o número do comprovante e marca Pago. O sistema não tem como saber se o cartão
  passou de verdade; por isso o fechamento compara o total do sistema com o relatório da
  maquininha, por bandeira, e aponta a diferença.
- **Pix:** recomendado já integrado desde o início (o sistema gera o código, o cliente
  paga e a confirmação chega sozinha), porque elimina conferência de comprovante.
- **Maquininha integrada** (o valor vai do sistema para o aparelho e a confirmação volta
  sozinha) é evolução: depende do contrato com a operadora e do modelo do aparelho.
- Pago: emite o documento fiscal (RC-06), libera a mesa e encerra a conta.
- Desconto, cortesia, cancelamento de item já lançado, estorno e reabertura de conta
  pedem **autorização do supervisor ou gerente** (código dele na hora), com motivo.

## 4. Durante o turno
- **Sangria** (retirada de dinheiro) e **suprimento** (entrada de troco): valor, motivo,
  quem autorizou, comprovante impresso ou digital.
- **Aviso de gaveta cheia:** acima do limite de dinheiro definido pela casa, o sistema
  sugere sangria.
- **Passagem de caixa** entre operadores: conferência conjunta e novo responsável.
- Gaveta só abre em venda em dinheiro, sangria, suprimento ou com autorização registrada.

## 5. Fechamento
- **Fechamento cego:** o operador conta o dinheiro e informa os totais por forma de
  pagamento **sem ver o valor esperado**. Depois o sistema mostra a comparação.
- Conferência da maquininha: totais do sistema por bandeira ao lado do total do aparelho.
- Diferença (sobra ou falta) exige justificativa e aprovação de supervisor ou gerente.
- Não fecha com conta aberta sem tratamento: transferir, cobrar ou registrar pendência.
- **Relatório de fechamento** claro: abertura, vendas por forma de pagamento, descontos,
  cancelamentos, sangrias, suprimentos, valor esperado, valor contado, diferença, assinaturas.
- O fechamento aprovado **alimenta o financeiro sozinho** (vendas, formas de pagamento,
  taxas, valores a receber de cartão). O caixa não vê esse lado.

## 6. Segurança
- Tudo registrado com operador, horário e terminal; **nada é apagado**, só estornado com motivo.
- Tela bloqueia sozinha por inatividade; volta com o código do operador.
- **Alertas ao gerente** de padrões que merecem atenção: muitos cancelamentos ou descontos
  por operador, gaveta aberta sem venda, estorno logo após pagamento, diferença de caixa
  recorrente, conta entregue e não paga além do tempo limite.
- Conta entregue e não paga não libera a mesa.
- Se a internet cair: procedimento de contingência documentado (anotar e lançar depois,
  com marcação de "lançado em contingência").

## 7. Entregas no caixa
- **Fila de expedição:** pedidos de delivery e retirada prontos, com tempo de espera.
- **Motoboys próprios:** atribuir uma ou mais entregas, ver quem está na rua e há quanto
  tempo, receber a **prestação de contas** (dinheiro recebido na entrega, entregas feitas,
  valores devidos ao motoboy). Detalhes no RC-14.
- **Motoboys do iFood:** registrar a retirada (código do pedido, nome ou placa, horário),
  para ter prova de que o pedido saiu.
- Retirada no balcão: conferir o código do cliente e marcar entregue.

## Sugestões incluídas
1. Atalhos de teclado e produtos favoritos, para o caixa não depender do mouse no pico.
2. Recibo e segunda via por QR Code ou impresso.
3. Espelho da conta para o cliente conferir antes de pagar.
4. Painel do dia para o próprio caixa: quanto vendeu, quantos atendimentos, sem dados financeiros da casa.
5. Conferência surpresa: gerente pode pedir uma contagem no meio do turno.
6. Pré-fechamento: aviso das contas abertas uma hora antes de fechar a loja.

## Critérios de aceite
1. Não vende sem sessão aberta; fundo de troco registrado por cédula.
2. Conta dividida com pagamento misto fecha no centavo; troco correto.
3. Atendente não consegue marcar Pago; caixa não consegue acessar financeiro (pela tela
   e chamando o servidor).
4. Desconto e estorno sem autorização são recusados; com autorização ficam registrados.
5. Fechamento cego: valor esperado só aparece depois da contagem; diferença exige justificativa.
6. Fechamento aprovado gera os lançamentos no financeiro uma única vez (repetir não duplica).
7. Pagamento confirmado duas vezes pelo provedor gera um único recebimento.
8. Entrega atribuída a motoboy aparece no aplicativo dele; prestação de contas bate com o caixa.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-14-entregas-e-motoboy.md' <<'__FIM_ARQUIVO_ERP__'
# RC-14: entregas e aplicativo do motoboy

## Como funciona
1. Pedido de delivery fica **pronto** (RC-10) e entra na fila de expedição do caixa.
2. O caixa **atribui** a entrega a um motoboy próprio (ou a mais de uma, na mesma saída).
3. O motoboy recebe no aplicativo, com som: **aceita**, confere os itens e toca em **Saí**.
4. O cliente vê "Saiu para entrega" e a previsão (RC-10, seção 8).
5. Na entrega, o motoboy pede o **código de 4 dígitos** que o cliente recebeu no
   acompanhamento, digita e toca em **Entregue**. É a prova de entrega.
6. Ao voltar, **presta contas** no caixa.

## Aplicativo do motoboy
- Login próprio. Vê **somente** as entregas atribuídas a ele.
- Cada entrega: itens, endereço, referência, observações, valor a receber (se for
  pagamento na entrega) e troco a levar.
- **Abrir no mapa** com um toque (aplicativo de navegação do celular).
- **Ligar ou mandar mensagem** ao cliente por botão; o número só fica visível durante a entrega.
- Situações: recebida -> aceita -> saí -> cheguei -> entregue | não entregue (com motivo:
  ausente, endereço errado, recusou; foto opcional).
- **Problema na entrega:** botão que avisa o caixa na hora.
- **Meu dia:** entregas feitas, tempo médio, valores a receber da casa e dinheiro a devolver.
- Avisos por notificação e central interna (RC-18).
- Funciona como aplicativo instalável no celular; com sinal ruim, guarda o toque e envia
  quando a conexão voltar.

## Prestação de contas
- Por saída ou no fim do turno, o caixa vê: entregas do motoboy, dinheiro que ele recebeu,
  troco que levou, valor devido a ele (taxa por entrega ou outra regra da casa).
- O caixa confere, recebe o dinheiro e marca Pago nos pedidos de pagamento na entrega.
- Diferença exige justificativa e fica registrada.

## Pagamento na entrega (se a casa aceitar; pendência 15)
- Dinheiro: o pedido informa "troco para quanto" e o motoboy sai com o troco registrado.
- Cartão: maquininha levada pelo motoboy; o comprovante é informado na prestação de contas.
- Pix na entrega: evitar comprovante por foto. Preferir Pix gerado pelo sistema, com
  confirmação automática, que o motoboy mostra no celular.

## Motoboys do iFood
Não usam o aplicativo. O caixa registra a retirada (código do pedido, identificação,
horário). O pedido do iFood é lançado manualmente até a integração (evolução).

## Sugestões incluídas
1. **Agrupar entregas** da mesma região em uma saída, com ordem sugerida.
2. **Tempo de retorno estimado** de cada motoboy, para o caixa saber quando terá entregador.
3. **Aviso ao cliente** quando o motoboy sai e quando está chegando.
4. **Avaliação da entrega** pelo cliente, ligada ao pedido.
5. **Localização durante a entrega** (com consentimento do motoboy) para o cliente ver no
   mapa: evolução.

## Critérios de aceite
1. Motoboy vê só as próprias entregas; outro login não as acessa.
2. Código de confirmação errado não conclui a entrega; com o código certo, o cliente e o
   caixa veem "Entregue" na hora.
3. Toque em "Entregue" sem sinal é enviado ao reconectar, uma única vez.
4. Prestação de contas bate com os pedidos de pagamento na entrega; só o caixa marca Pago.
5. Entrega não realizada volta para a fila do caixa com o motivo.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-15-financeiro-e-contabilidade.md' <<'__FIM_ARQUIVO_ERP__'
# RC-15: financeiro e documentos para a contabilidade

Acesso: cargo Financeiro, Dono e Administrador. A contabilidade é uma empresa externa:
o sistema não substitui o contador, **prepara e entrega a informação pronta**.

## Ciclo completo
| Etapa | O que o sistema faz |
|---|---|
| **Compra** | Pedido de compra feito pelo gerente geral -> recebimento conferido -> entra no estoque e vira **conta a pagar** com vencimento |
| **Contas a pagar** | Agenda, anexo do boleto ou nota, aprovação, baixa do pagamento com comprovante |
| **Vendas e recebimentos** | Chegam sozinhos dos fechamentos de caixa (RC-13) e do delivery: por forma de pagamento, com taxas |
| **Valores a receber** | Cartões, vales e iFood: previsto x recebido, taxas e prazos |
| **Conciliação** | Extrato bancário importado e confrontado com o que o sistema espera; divergências listadas |
| **Fluxo de caixa** | Realizado e previsto, por dia e por semana |
| **Resultado** | Resultado gerencial do mês, por competência e por caixa, separado por frente (cozinha, cafeteria, delivery; sorveteria como linha própria, RC-11) |
| **Sócios** | Aportes, retiradas e pró-labore identificados, separados da operação |
| **Despesas fixas** | Aluguel, energia, pessoal: lançamento recorrente e rateio com critério visível |

## Pacote para a contabilidade
Gerado por competência (mês), com um toque, em formato **claro, objetivo e profissional**.

**Um PDF de apresentação**, com capa (razão social, CNPJ, período, data de geração, quem
gerou), índice e, em cada seção, um resumo de uma página:

1. Faturamento do mês: por dia, por forma de pagamento e por canal.
2. Documentos fiscais emitidos, cancelados e rejeitados, com totais.
3. Compras e notas de entrada, por fornecedor.
4. Contas pagas e contas em aberto no fim do mês.
5. Fechamentos de caixa: esperado, contado, diferenças.
6. Taxas de cartão, vales e plataformas; valores a receber.
7. Movimentação dos sócios.
8. Posição de estoque no último dia do mês (quantidade e valor).
9. Pendências e observações do período.

**Anexos em pasta organizada:** planilhas de cada seção (para o contador filtrar e somar)
e os arquivos XML das notas, em subpastas nomeadas. Nomes de arquivo padronizados com
CNPJ e período.

**Controle da entrega:** o pacote tem número e versão; registra quando foi gerado, enviado
e confirmado. Correção depois do envio gera nova versão, com o que mudou. O contador pode
receber acesso de leitura para baixar direto, e devolver guias e protocolos, que ficam
anexados ao mês.

Formato de exportação para o sistema do escritório contábil: definir com ele (pendência 43).

## Regras
- Todo número do financeiro abre a origem: o pedido, o fechamento, a nota.
- Dinheiro em centavos; nada é apagado, só estornado com motivo.
- Guia recebida, guia paga e declaração entregue são situações diferentes.
- O sistema não calcula imposto por conta própria: classificação e regras são do contador (RC-06).

## Critérios de aceite
1. Compra recebida gera conta a pagar uma única vez; pagamento baixa a conta e aparece no fluxo.
2. Fechamento de caixa aprovado aparece no financeiro sem digitação.
3. Totais do pacote contábil batem com os registros de origem (teste automático de soma).
4. Pacote gerado duas vezes para o mesmo mês sem alteração é idêntico; com alteração, vira nova versão.
5. Gerente geral, caixa e supervisor não acessam nenhuma tela ou dado do financeiro.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-16-calculadoras-e-indicadores.md' <<'__FIM_ARQUIVO_ERP__'
# RC-16: calculadoras e indicadores do negócio

Ferramentas prontas, alimentadas pelos dados do sistema, com a opção de simular valores
à mão. Cada resultado mostra a conta feita e de onde vieram os números.

## Calculadoras
| Calculadora | O que responde | Conta |
|---|---|---|
| **CMV real** | Quanto custou a mercadoria vendida no período | Estoque inicial + compras - estoque final |
| **CMV %** | Quanto do faturamento vira custo de mercadoria | CMV ÷ faturamento do período |
| **CMV teórico x real** | Quanto se perdeu entre a receita e a prática | Custo pelas fichas técnicas do que foi vendido, comparado ao CMV real; a diferença é perda, porção maior, erro ou desvio |
| **Custo do prato** | Quanto custa fazer uma porção | Soma dos ingredientes da ficha técnica, com rendimento e embalagem |
| **Rendimento (fator de correção e de cocção)** | Quanto sobra depois de limpar e de cozinhar | Peso bruto ÷ peso limpo; peso cru ÷ peso pronto; corrige o custo real do ingrediente |
| **Preço de venda** | Por quanto vender | Custo do prato, margem desejada, taxas do canal (cartão, plataforma), impostos informados pelo contador |
| **Preço por canal** | Quanto cobrar no salão, no delivery próprio e no iFood para ter a mesma margem | Preço de venda com as taxas de cada canal |
| **Margem de contribuição** | Quanto cada venda sobra para pagar as contas fixas | Preço - custos variáveis |
| **Ponto de equilíbrio** | Quanto precisa vender para não ter prejuízo | Custos fixos ÷ margem de contribuição média |
| **Mercadoria (quanto comprar)** | Quantidade a pedir de cada item | Consumo previsto x dias até a próxima compra + segurança - estoque atual, arredondado pela embalagem do fornecedor |
| **Escala de receita** | Ingredientes para produzir X porções | Ficha técnica multiplicada, com conversão de unidades |
| **Simulador de promoção e combo** | Se o desconto compensa | Margem antes e depois; quantas vendas a mais para empatar |
| **Custo da entrega** | Quanto custa cada entrega e qual taxa cobrar | Custo do motoboy ÷ entregas, por região |
| **Desperdício** | Quanto se perde e em quê | Perdas registradas em quantidade e valor, por motivo |
| **Custo de mão de obra** | Quanto da venda paga a equipe | Folha informada ÷ faturamento; somado ao CMV dá o custo principal do negócio |
| **Conversor de unidades e embalagens** | Caixa, quilo, litro, unidade, porção | Conversões do cadastro |

## Indicadores acompanhados
Ticket médio; vendas por hora e dia; produtos mais vendidos e mais rentáveis
(popularidade x margem, para decidir o cardápio); tempo médio de preparo e de entrega;
prometido x realizado; itens esgotados e venda perdida; giro e dias de estoque;
cancelamentos e descontos; desempenho por atendente e por canal.

## Quem vê
Dono, Administrador e Financeiro: tudo. Gerente geral: o que usa só os **custos da área
dele** (custo do prato, rendimento, mercadoria, escala de receita, desperdício, CMV em
valor da própria área); não vê CMV %, margem, ponto de equilíbrio nem nada que revele o
faturamento da empresa. Supervisor e cozinha: rendimento, escala
de receita, conversor e desperdício da própria área.

## Regras
- CMV real só é confiável com inventário de abertura e de fechamento do período: o
  sistema lembra e bloqueia o cálculo se faltar contagem, em vez de mostrar número errado.
- Todo resultado indica período, fonte e data. Simulação manual é marcada como simulação.
- Sugestão de preço é sugestão: mudar preço é decisão de pessoa, com registro.

## Critérios de aceite
Cada calculadora conferida contra um exemplo feito à mão, registrado no teste; CMV recusa
período sem inventário; perfil sem permissão não vê custos nem faturamento.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-17-historico-e-busca-de-pedidos.md' <<'__FIM_ARQUIVO_ERP__'
# RC-17: registro de tudo e busca de pedidos

**Pedido do cliente:** tudo registrado (cada pedido que cada atendente fez, o horário),
e poder pesquisar um pedido e ver todo o caminho dele, do atendimento à entrega, com os tempos.

## O que fica registrado em cada pedido
Quem lançou, em qual aparelho, mesa ou canal, horário; cada item, alteração e
cancelamento, com autor e motivo; como o cliente quis receber (tudo junto ou por partes);
baixa de estoque; para cada item: chegou, entrou na fila, iniciou, ficou pronto, quem
fez cada toque; envio pelo elevador; aviso ao atendente e quando ele pegou; **Entregue**
(quem e quando); **Pago** (qual caixa, como e quando); documento fiscal; no delivery:
motoboy, saída, entrega e código de confirmação; estimativa prometida e tempo real.

Nada é apagado. Correção é sempre um novo registro que referencia o anterior.

## Duas situações separadas
| Situação | Quem muda | Valores |
|---|---|---|
| **Atendimento** | Atendente (ou motoboy, ou cliente na retirada) | Aberto -> Entregue |
| **Pagamento** | **Somente o caixa** (ou o provedor, no pagamento online) | A pagar -> Pago -> Estornado |

"Entregue" encerra o atendimento, não a conta. Pedido entregue e não pago fica visível no
caixa e segura a mesa. Pedido só é "Concluído" quando está entregue **e** pago.

## Busca
Por número do pedido, mesa, data e horário, atendente, cozinheira, caixa, motoboy,
cliente (nome ou telefone), produto, canal, situação, forma de pagamento e valor.

## Linha do tempo do pedido
Uma tela, de cima para baixo, com cada evento, horário, autor e o tempo gasto entre
etapas: espera até a cozinha ver, tempo na fila, tempo de preparo de cada item (comparado
ao padrão), espera no elevador, tempo até o atendente pegar, tempo até a entrega, tempo
até o pagamento. Atrasos em destaque. Dá para imprimir ou exportar.

## Relatórios derivados
Por atendente (pedidos, valor, tempo até entregar, cancelamentos); por cozinheira e
estação (itens, tempo médio, atrasos); por caixa; por motoboy; por produto; por horário.

## Privacidade e guarda
Quem vê o quê segue o cargo: atendente vê os próprios pedidos; supervisor, os do salão;
gerente e dono, todos. Dados pessoais de clientes só para quem precisa. Tempo de guarda
definido com o contador e o cliente.

## Critérios de aceite
1. Pedido de teste percorre todas as etapas e a linha do tempo mostra cada uma, com autor e horário.
2. Tentativa de alterar ou apagar um registro antigo é recusada.
3. Busca por cada filtro devolve o pedido certo.
4. Atendente marca Entregue e não consegue marcar Pago; o pedido aparece no caixa como aguardando pagamento.
5. Tempos da linha do tempo batem com os horários gravados.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/RC-18-comunicacao-e-notificacoes.md' <<'__FIM_ARQUIVO_ERP__'
# RC-18: notificações e comunicação interna

Todos os aplicativos (atendente, cozinha, cafeteria, caixa, supervisor, gerente, estoque,
financeiro, motoboy, dono) têm **dois canais**: o aviso no aparelho e a central interna.

## 1. Aviso no aparelho (notificação)
Som, vibração e texto curto, mesmo com a tela em outro lugar. Para o que exige ação
imediata: pedido pronto, pedido novo, estoque em emergência, entrega atribuída, conta
esperando pagamento, autorização pedida.

## 2. Central interna (dentro do aplicativo)
- **Caixa de avisos:** tudo que chegou para a pessoa, com situação (novo, visto,
  resolvido) e o botão de ação. Guarda o histórico.
- **Comunicados:** recados da gerência para todos, para um cargo ou para um turno, com
  **confirmação de leitura** e lista de quem ainda não leu.
- **Mensagens ligadas ao pedido:** conversa curta presa a um pedido, entre atendente,
  cozinha e caixa (ex.: "acabou o cheddar, pode trocar por prato?"), com respostas
  prontas de um toque. Fica na linha do tempo do pedido (RC-17).
- **Recados entre setores:** canais por setor (salão, cozinha, caixa, gerência).
- **Passagem de turno:** pendências deixadas para o próximo turno, com confirmação de quem recebeu.
- **Pedidos de autorização:** desconto, estorno, venda sem saldo: chegam ao supervisor ou
  gerente, que aprova ou nega no próprio aparelho.

## Regras
- Cada tipo de aviso tem prioridade (urgente, normal, informativo), destinatário por cargo
  e turno, e som próprio.
- Urgente não visto é repetido e sobe para o superior depois do tempo configurado.
- Agrupar para não cansar: "5 itens em reposição" em vez de cinco avisos.
- Horário de silêncio para o que não é urgente; fora do turno a pessoa não recebe avisos operacionais.
- Não é rede social: sem grupos livres, sem mídia pessoal. Tudo fica registrado e pode ser auditado.
- Mensagens a clientes (delivery) são outro assunto e seguem o RC-08.

## Sugestões incluídas
1. Respostas prontas configuráveis por setor.
2. Aviso falado nas telas da cozinha ("mesa doze alterou o pedido"), opcional.
3. Painel do gerente com avisos urgentes não vistos em toda a casa.

## Critérios de aceite
Aviso chega ao cargo e ao turno certos; urgente não visto sobe; comunicado mostra quem
leu; mensagem do pedido aparece na linha do tempo; quem está fora do turno não recebe
aviso operacional.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/README.md' <<'__FIM_ARQUIVO_ERP__'
# Requisitos

| Arquivo | Assunto | Situação |
|---|---|---|
| `RC-01-pedido-cozinha-estoque.md` | Pedido automático na produção e baixa de estoque | **Prioritário, primeira versão** |
| `RC-09-estoque-inteligente.md` | Em uso e guardado, disponibilidade automática, linhas de reposição, notificações | **Primeira versão, junto do RC-01** |
| `RC-10-telas-da-cozinha.md` | Telas por tipo de pedido, fila, temporizador, sons, pedido de várias áreas, estimativa de tempo, aviso ao atendente e ao cliente | **Primeira versão, junto do RC-01** |
| `RC-11-sorveteria-60-sabores.md` | Franquia com sistema próprio: só leitura de dados | Depende da franqueadora |
| `RC-12-cargos-e-acessos.md` | Cargos, fronteiras de acesso, login nos tablets da cozinha | **Primeira versão (base de tudo)** |
| `RC-13-caixa.md` | Abertura, recebimento, fechamento cego, segurança, expedição e motoboys | **Primeira versão** |
| `RC-17-historico-e-busca-de-pedidos.md` | Registro completo, Entregue x Pago, busca e linha do tempo | **Primeira versão** |
| `RC-18-comunicacao-e-notificacoes.md` | Aviso no aparelho e central interna em todos os aplicativos | **Primeira versão (básico)** |
| `RC-14-entregas-e-motoboy.md` | Aplicativo do motoboy, código de confirmação, prestação de contas | Com o delivery |
| `RC-15-financeiro-e-contabilidade.md` | Financeiro completo e pacote para a contabilidade externa | Depois do caixa |
| `RC-16-calculadoras-e-indicadores.md` | CMV, custo do prato, preço, mercadoria e outras | Depois de estoque e financeiro |
| `modulos.md` | Cadastros, estoque, PDV, caixa, financeiro, suporte | Primeira versão |
| `fluxos-criticos.md` | Fluxos que precisam fechar de ponta a ponta | Primeira versão |
| `RC-03-aplicativos-por-funcao.md` | Experiências por função e permissões | Básico na primeira versão |
| `RC-02-midia-e-tvs.md` | Central de mídia e telas | Piloto de 2 telas na primeira versão |
| `RC-07-site-institucional.md` | Site da empresa, produtos e área para empresas | Em paralelo |
| `RC-08-delivery-proprio-e-app-do-cliente.md` | Loja online, pagamento, acompanhamento e app instalável | Depois de RC-01 e pagamento |
| `RC-06-fiscal-contabil-documental.md` | Emissão fiscal e central documental | Emissão na primeira versão; o resto é evolução |
| `RC-04-equipamentos-e-rede.md` | Equipamentos, rede e energia | Levantamento; compra é decisão do cliente |
| `qualidade-operacional.md` | Padrões transversais de qualidade | Aplicar desde o início |

A numeração RC-05 não foi usada no material de origem. Não invente conteúdo para ela.

Os pedidos vieram do cliente. O desenho técnico é deste projeto: se um documento
contradiz uma decisão em `decisoes/`, vale a decisão.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/fluxos-criticos.md' <<'__FIM_ARQUIVO_ERP__'
# Fluxos que precisam fechar

Para cada fluxo: regra escrita, teste automatizado quando possível e critério de aceite.

1. **Ciclo completo:** compra -> lote -> preparo intermediário -> venda -> consumo de
   estoque -> pagamento -> documento fiscal -> conciliação.
2. **Reserva sem pagamento:** prazo de expiração e risco de vender o mesmo item em dois canais.
3. **Cancelamento** antes e depois do preparo: perda física e reversão financeira são coisas separadas.
4. **Conta dividida**, pagamento parcial, estorno parcial e reabertura autorizada.
5. **Evento externo** duplicado, fora de ordem, com timeout ou com resposta desconhecida.
6. **Pedido pago com nota rejeitada:** os dois estados coexistem; contingência só quando aplicável.
7. **Troca de receita ou preço** sem alterar o histórico de vendas.
8. **Pedido com mais de uma área** (cozinha e cafeteria): tudo junto ou por partes, com contagem do que está pronto (RC-10).
9. **Queda de internet** com mais de um caixa: sincronização, conflito de comanda,
   prevenção de cobrança e nota duplicadas (na primeira versão: procedimento de
   contingência documentado, não offline coordenado).
10. **Restauração** do banco e dos arquivos, reprocessamento das filas e conciliação com
    pagamentos já efetivados fora do sistema.

## Fluxos de ponta a ponta
| Fluxo | Sequência |
|---|---|
| Mesa | Atendente lança (e pergunta tudo junto ou por partes) -> validação e baixa (RC-01) -> telas por tipo -> fila, preparo, pronto -> elevador / balcão da cafeteria -> aviso ao atendente -> entrega -> caixa recebe |
| Sorveteria 60 Sabores | Sistema da franquia -> leitura dos dados do dia -> painel do gestor (RC-11) |
| Compra | Mínimo gera solicitação -> aprovação -> compra -> recebimento conferido -> lote e validade -> estoque e contas a pagar |
| Produção diária | Responsável define quantidade -> produção consome insumos e gera preparado -> etiqueta -> venda consome o preparado |
| Delivery próprio | Carrinho -> reserva de estoque -> pagamento confirmado pelo provedor -> liberação e baixa (RC-01) -> produção -> expedição -> entrega -> conciliação |
| Pedido de iFood | Lançamento manual -> produção -> conferência -> saída registrada -> conciliação de taxa e repasse |
| Troca de turno | Equipe registra pendências e estoque crítico -> supervisor seguinte confirma |
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/modulos.md' <<'__FIM_ARQUIVO_ERP__'
# Módulos da primeira versão

## Cadastros
Produtos com foto, descrição, alergênicos declarados, tamanhos, adicionais, combos,
horários, preço por canal e indisponibilidade. Ingredientes, unidades e conversões
explícitas (compra em kg/litro/caixa, consumo em g/ml/unidade); impedir equivalência
incorreta. Fornecedores. Setores de produção. Locais de estoque.

## Fichas técnicas
Ingredientes, quantidade, unidade, rendimento, perda prevista, embalagem e **versão**.
Mudar a receita não altera vendas passadas. Separar custo de insumo de taxas comerciais.

## Estoque
Dois locais por ingrediente (em uso e guardado), disponibilidade automática para venda,
linhas de reposição e notificações: ver RC-09.

Movimentos: entrada, produção, reserva, consumo, transferência, perda, consumo de
funcionário, ajuste (com motivo e responsável). Lotes e validade quando aplicável.
Inventário por setor: diferença entre previsto e contado, com aprovação do ajuste.
Preparos intermediários geram lote próprio. Toda quantidade deve ser explicável pelos
movimentos: nunca corrigir só o saldo final.

Critério de aceite: simular compra, preparo intermediário, venda e cancelamento; os
movimentos fecham em quantidade e custo, sem misturar unidades nem devolver produto
perdido ao saldo vendável.

## Atendimento e PDV
Abertura e fechamento por operador; mesas e comandas; transferência de itens; divisão da
conta; pagamentos mistos; desconto e cancelamento com autorização. Pedidos externos
(iFood, telefone) lançados manualmente, com origem identificada.

Critério de aceite: divisão da conta, cancelamento parcial e falha de impressão preservam
totais e histórico.

## Produção por setor
Telas por tipo de pedido (Geral, Hambúrgueres, Pratos e grelhados, Elevador; cafeteria
com tela própria), botão de fila, temporizador com cores, sons, estimativa de tempo,
envio pelo elevador e aviso ao atendente: ver RC-10. Baixa de
estoque e entrega garantida do pedido: ver RC-01.

## Caixa
Ver RC-13: abertura com fundo de troco, painel de contas, recebimento, sangria,
fechamento cego, segurança e expedição. Só o caixa marca Pago.

## Financeiro
Versão completa e pacote para a contabilidade: RC-15. Calculadoras e CMV: RC-16.
Na primeira entrega, o básico:

Contas a pagar e a receber, categorias, vencimentos, anexos. Separar vendas, recebíveis,
dinheiro em caixa e liquidações. Registrar bruto, descontos, taxas, estornos e líquido.
Retiradas e aportes de sócios identificados. Não substitui a contabilidade.

## Pagamento
Um provedor, por API. Confirmar por evento autenticado, nunca por foto de comprovante.
Vincular forma, valor, transação e estorno ao pedido. Repetição de evento não duplica
cobrança nem recebível.

## Fiscal
Um provedor especializado (não falar direto com a SEFAZ). Ver RC-06, seção de emissão.

## Registro e busca de pedidos
Ver RC-17. Atendente marca Entregue; só o caixa marca Pago; nada é apagado.

## Tarefas e comunicados
Ver RC-18 (aviso no aparelho e central interna em todos os aplicativos).

Avisos por equipe e turno com confirmação de leitura; tarefas com responsável;
passagem de turno com pendências. Não misturar conversa informal com ordem de produção.

## Suporte e manutenção
Área no próprio sistema para abrir e acompanhar chamados: protocolo, categoria,
descrição, prioridade informada, anexos, respostas, histórico e status (aberto, em
análise, em atendimento, aguardando cliente, concluído). Acesso por usuários autorizados.

## Relatórios básicos
Vendas por período, produto e canal; fechamento de caixa; posição de estoque e itens
abaixo do mínimo; perdas; pedidos por setor e tempo de preparo. Todo número permite abrir
a composição e a origem, respeitando a permissão de quem consulta.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/requisitos'
cat > 'docs/requisitos/qualidade-operacional.md' <<'__FIM_ARQUIVO_ERP__'
# Qualidade operacional

Padrões que valem para tudo que for construído. Os cinco primeiros são fundamento e
entram desde a etapa E02; os demais entram com o módulo correspondente.

## Fundamento (desde o início)
1. **Base visual única:** componentes, cores, tipografia, espaçamento, estados e
   mensagens consistentes. Layouts próprios para celular, tablet, caixa e tela de
   produção. Alvos de toque grandes, contraste alto, mensagens que dizem o próximo passo.
2. **Linha do tempo do pedido:** criação, revisões, autorizações, receita aplicada,
   movimentos de estoque, ticket recebido, preparo, expedição, pagamento, fiscal e entrega.
3. **Estoque explicado:** toda quantidade mostra de onde veio (entradas, reservas,
   consumos, perdas, ajustes), com unidade, local, lote e motivo.
4. **Publicação protegida:** homologação, CI, testes, migrações compatíveis, backup,
   versão implantada registrada e reversão planejada.
5. **Resiliência verificável:** reenvio, duplicidade, concorrência, cancelamento, falha
   de terminal e restauração provados em teste antes de afirmar confiabilidade.

## Com cada módulo
6. **Central de ocorrências:** pedido atrasado, falta de insumo, pagamento pendente,
   nota rejeitada, dispositivo desconectado. Cada uma com vínculo, responsável,
   prioridade e ação permitida. Poucos alertas, todos acionáveis.
7. **Qualidade de cadastro:** apontar produto sem receita, conversão ausente, preço
   incompleto, dado fiscal não validado. Bloquear só o fluxo afetado.
8. **Vigência e versões:** agendar preço, receita, cardápio e campanha, preservando o que
   valeu nas vendas anteriores.
9. **Ambiente de treinamento:** dados fictícios, isolado do real, com indicação visual
   clara, e roteiro por função.
10. **Indicadores explicáveis:** cada número abre composição, período e fonte.
11. **Produtividade do operador:** favoritos, atalhos, busca, formulário preservado em
    erro, estado de conexão e de salvamento visíveis.
12. **Observabilidade:** logs estruturados ligando falha técnica a pedido e integração,
    sem dados pessoais desnecessários.
13. **Verificação visual:** testar telas nos tamanhos reais de uso e automatizar no
    navegador os fluxos críticos.

## Linguagem das telas
Português simples. Explicar a tarefa do funcionário e a resposta do sistema. Definir
sigla antes de usar. Nada de fórmula ou indicador sem origem e significado.
__FIM_ARQUIVO_ERP__

mkdir -p 'docs/tarefas'
cat > 'docs/tarefas/T01-conferencia-e-fundacao.md' <<'__FIM_ARQUIVO_ERP__'
# T01: conferência do plano e início da fundação

Primeira tarefa do projeto: etapas E01 e E02 da ordem de construção
(`docs/03-roteiro-de-fases.md`). Antes de começar, mostre o plano de modelos
(`docs/05-uso-dos-modelos.md`) e confirme que a sessão está em Opus.

## Parte 1: conferência (sem escrever código)
1. Leia `CLAUDE.md`, todo o `docs/` e todo o `cerebro/`.
1a. Confira as travas (decisão 0004): o estado do cérebro apareceu no início? Tente um
    `git push origin HEAD:producao` sem a frase: deve ser bloqueado. Relate o resultado.
2. Rode `check-tools` e registre versões de Node, PostgreSQL e Docker disponíveis.
3. Responda ao responsável, em linguagem simples e em até 25 linhas:
   - o que você entendeu que será construído (5 linhas);
   - onde você **discorda** do plano ou vê risco, com a alternativa (não concorde por padrão);
   - o que consegue fazer sozinho, o que depende do responsável e o que depende do cliente;
   - no máximo 5 perguntas, cada uma com a decisão que ela muda.
4. Se discordar de uma decisão em `decisoes/`, proponha novo registro; não altere o antigo.

Não espere respostas para seguir: avance com as hipóteses de `04-pendencias.md`.

## Parte 2: fundação (etapa E02), em branch `feat/fundacao`
1. Escolha as bibliotecas previstas na decisão 0003, conferindo versão e manutenção
   atuais, e registre em novo arquivo de `decisoes/` (próximo número livre).
2. Monte o monorepositório: `apps/gestao`, `apps/loja`, `apps/site` (as duas últimas só
   com a casca e uma página), `apps/worker`, pacote de domínio, pacote de banco, pacote de interface.
3. Banco: migrações versionadas; tabelas de empresa, unidade, setor, usuário, perfil e auditoria.
4. Autenticação e permissões verificadas no servidor, com teste que prova o bloqueio de
   usuário sem alçada chamando a API diretamente.
5. Base visual mínima por variáveis de tema (identidade ainda não recebida) e uma tela de entrada.
6. Ambiente de desenvolvimento que sobe com um comando (PostgreSQL da sessão ou Docker).
7. CI no GitHub Actions: lint, tipos, testes com PostgreSQL real. Deixe prontos, sem
   ativar, os fluxos de implantação: `main` -> homologação e `producao` -> produção.
8. Preencha a seção "Comandos" do `CLAUDE.md`.
9. Abra o PR com a skill `checklist-pr` e encerre com a skill `encerrar-sessao`.

## Fora desta tarefa
Estoque, pedidos, caixa, fiscal, delivery, conteúdo do site, mídia. Cada um tem sua fase.

## Pronto quando
PR aberto, CI verde, e o responsável consegue seguir os passos "como conferir" do PR.
__FIM_ARQUIVO_ERP__

chmod +x .claude/hooks/*
echo "Projeto montado: 68 arquivos criados."
echo "Próximo passo: leia CLAUDE.md e cerebro/00-estado-atual.md."
