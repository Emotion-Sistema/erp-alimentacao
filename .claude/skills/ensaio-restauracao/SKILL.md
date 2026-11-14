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
