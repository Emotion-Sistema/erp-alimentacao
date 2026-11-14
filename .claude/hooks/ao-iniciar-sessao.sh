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
