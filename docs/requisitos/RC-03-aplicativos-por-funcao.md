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
