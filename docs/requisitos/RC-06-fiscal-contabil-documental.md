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
