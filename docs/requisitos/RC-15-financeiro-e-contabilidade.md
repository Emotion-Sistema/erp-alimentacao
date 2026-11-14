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
