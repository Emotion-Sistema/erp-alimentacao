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
