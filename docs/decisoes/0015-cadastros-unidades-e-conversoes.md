# 0015: cadastros (E07): unidades, conversões, ingredientes e fornecedores

- Data: 15/11/2026
- Status: aceita (E07, parte 1); hipóteses no item 7
- Assunto da sessão: E07, cadastros
- Complementa: `docs/requisitos/modulos.md` (Cadastros), RC-01, RC-09, decisões 0008 e 0011

## Contexto
A ficha técnica (E08), o estoque (E09) e a compra (frente lista-de-compras) dependem de uma
conta só: quanto uma quantidade comprada ou gasta vale na unidade do estoque. O requisito pede
conversões explícitas (compra em kg, litro ou caixa; consumo em g, ml ou unidade) e que o
sistema impeça equivalência incorreta.

## Decisão
1. **Unidade do estoque** de cada ingrediente: g, ml ou un. É nela que o estoque conta e a
   ficha técnica gasta. **Não muda depois de criada**: mudar trocaria o sentido de todo saldo
   e de toda conversão. Errou? Desative e cadastre outro, com o mesmo nome se quiser (nomes só
   precisam ser únicos entre os ativos); o gatilho no banco também recusa a troca.
2. **Unidades padrão** (tabela `unidade_medida`, fixa; o aplicativo não consegue mudá-la, só
   migração): mg, g, kg, t (massa), ml, cl, dl, l (volume), un e dz (contagem), com apelidos
   ("quilo", "litros", "duzia", "cc"). Dentro da mesma grandeza o sistema converte sozinho.
   Nomes são comparados numa forma única (`nome_de_unidade`): sem maiúscula, acento, pontuação
   nem o "1" da frente ("1 Kg." = "kg").
3. **Conversão explícita por ingrediente** (`ingrediente_conversao`): "1 caixa = 30 un",
   "1 saco 25 kg = 25000 g", "1 kg = 1030 ml" (leite, pela densidade), "1 unidade = 50 g".
   É o único jeito de passar de uma grandeza para outra ou de usar uma embalagem.
4. **Equivalência errada é recusada no banco:** uma conversão com o nome de uma unidade padrão
   da mesma grandeza da base ("kg = 900 g", "dúzia = 10 un") é recusada, porque o sistema já
   sabe a conta certa. Sem caminho de conversão, a conta é recusada com a explicação; nunca chuta.
   Nome que já diz o tamanho ("saco 25 kg", "bandeja 12 un") tem de valer exatamente isso.
5. **Uma conta só:** a função `para_unidade_base` do banco. Compra, ficha técnica e importação
   usam ela (no código: `converterParaBase`). Quantidade é decimal exato, com até 4 casas
   (numeric(14,4)), aceita vírgula, nunca passa por float. Quantidade vazia, zero ou negativa é
   recusada (estorno é movimento próprio). O resultado é arredondado a 4 casas (meio para cima);
   se der zero, é recusado.
   **Para a E08/E09:** o movimento grava a quantidade já convertida (e qual conversão usou), porque
   mudar uma conversão depois não pode mudar o sentido de compras passadas.
6. **Nada se apaga** (RC-17): ingrediente, conversão e fornecedor são desativados. Toda criação e
   mudança fica na auditoria com o antes e o depois. Nomes não se repetem (sem diferença de
   maiúsculas e espaços); CPF/CNPJ do fornecedor é conferido pelos dígitos e guardado só com números.
7. **Hipóteses (a confirmar com o responsável):**
   - Quem muda cadastros: dono, administrador e gerente geral (`cadastros.gerenciar`).
   - Quem vê: os mesmos, financeiro, supervisor e cozinheira (`cadastros.ver`). Atendente, caixa,
     auxiliar, motoboy e contador não veem a lista de ingredientes.
   - Cada ingrediente fica em **uma** área de estoque (as 4 da decisão 0008).
   - Custo do ingrediente não está no cadastro: vem das compras (E09 e frente lista-de-compras).
8. **Para a parte 3 (importação):** procurar por nome só entre os ativos; grafias como "kgr" e
   "k g" ainda passam como embalagem (lista de apelidos); se `nome_de_unidade` mudar, a mesma
   migração refaz o índice (REINDEX).
9. **Fica para as próximas partes da E07:** categorias com horários por canal, tipos de pedido
   e produtos (parte 2); importação de planilha .xlsx, .csv e .html (parte 3).

## Consequências
- A E08 grava a ficha em unidade base; a compra converte a embalagem por esta mesma função.
- A frente lista-de-compras usa ingredientes, fornecedores e conversões daqui (mural).
