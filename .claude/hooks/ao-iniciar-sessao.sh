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
if [ -f "$dir/cerebro/frentes/mural.md" ]; then
  echo "=== MURAL ENTRE CHATS (cerebro/frentes/mural.md, últimos recados) ==="
  grep '^- ' "$dir/cerebro/frentes/mural.md" | tail -n 15
  echo
fi
if [ -f "$dir/cerebro/agenda-de-sugestoes.md" ]; then
  echo "=== AGENDA DAS SUGESTÕES APROVADAS (cerebro/agenda-de-sugestoes.md): entram na etapa do gatilho ==="
  grep '| pendente |' "$dir/cerebro/agenda-de-sugestoes.md" | cut -d'|' -f3-5
  echo
fi
echo "=== LEMBRETES ==="
echo "1) Nada vai para o ar sem a mensagem do responsável começando com: Publique tudo"
echo "2) O que o responsável precisa fazer vem com 👉 e fecha toda resposta."
echo "3) Ao encerrar o assunto, use a skill encerrar-sessao (atualiza o cérebro)."
echo "4) Ao começar uma etapa, confira a agenda das sugestões acima e inclua no plano as que ela libera."
exit 0
