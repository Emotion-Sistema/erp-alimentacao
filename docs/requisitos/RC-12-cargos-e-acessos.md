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
| **Atendente** | Atendimento: mesas, pedidos, acompanhamento, entrega; **altera pedido** (não cancela) | Lança o pedido e marca **Entregue**. Cada alteração feita por atendente avisa os supervisores e aparece para o gerente numa aba de alterações, com motivo (lançado errado ou cliente trocou) |
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

## Compras (definido em 14/11/2026)
Gerente geral compra o que é de estoque (alimentos, bebidas). Financeiro compra o que não é de
estoque de comida: material físico, utensílios, eletrodomésticos.

## Aparelhos
Aparelhos internos são Android da empresa e ficam na loja; o aplicativo interno só abre
em aparelho cadastrado. Exceção a decidir: aparelho do motoboy (pendência 39).

## Critério de aceite
Para cada cargo, a mesma lista de ações testada pela tela e chamando o servidor
diretamente: o que não é do cargo é recusado e fica registrado. Caixa não acessa
financeiro; gerente não acessa financeiro; supervisor não muda situação de produção;
motoboy só vê as próprias entregas; código errado três vezes bloqueia e avisa o supervisor.
