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
