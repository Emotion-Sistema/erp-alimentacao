# Ordem de construção

O sistema é construído **por partes**. Cada etapa é pequena, tem teste que prova que
funciona e só começa quando a anterior foi aceita. Modelos: ver `05-uso-dos-modelos.md`.

## Regras da ordem
- **Sugestões aprovadas do site (18/11/2026):** cada uma está marcada com 📌 na etapa em que entra. Ao começar ou terminar uma etapa, confira `cerebro/agenda-de-sugestoes.md`.
1. **Uma etapa = um assunto = um PR.** Nunca duas regras críticas no mesmo PR.
2. **Servidor antes da tela.** A regra é construída e testada no servidor; a tela vem depois.
3. **Crítico primeiro, bonito depois.** Dinheiro, estoque e permissão são provados com
   teste antes de qualquer acabamento.
4. **Portões.** Nos pontos marcados com 🚪 o trabalho para até o responsável testar na
   homologação e dar o "ok".
5. **Nada vai ao ar sem "Publique tudo".**
6. **Etapa travada por resposta pendente** não é pulada com chute: usa dados fictícios
   para construir e fica aguardando a resposta para ser aceita.
7. Antes de cada etapa: mostrar o plano de modelos e esperar o "ok".

## Bloco A: base (não depende de nenhuma resposta do cliente)
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E01** Conferência | Leitura de tudo, teste das travas, discordâncias e perguntas (T01 parte 1) | Opus | Responsável leu e respondeu |
| **E02** Fundação técnica | Monorepositório, banco e migrações, ambiente de desenvolvimento, CI | Opus decide; Sonnet monta; Haiku documenta | CI verde; ambiente sobe com um comando |
| **E03** Cargos, login e auditoria | Funcionários, cargos, permissões no servidor, código pessoal, registro de tudo (RC-12, RC-17 base) | Opus; revisor | Matriz de permissões testada pela tela e direto no servidor |
| **E04** Base visual e cascas | Tema neutro por variáveis; casca dos aplicativos por cargo | Sonnet; Opus revisa | Telas abrem nos tamanhos reais (tablet, celular, computador) |
| **E05** Avisos | Central interna e aviso no aparelho, básico (RC-18) | Sonnet; Opus no tempo real | Aviso chega ao cargo e turno certos |
| **E06** Homologação 🚪 | Preparar a VPS de testes já contratada (chave SSH, firewall, Docker, HTTPS) por script em `infra/` e publicação automática da `main` | Opus | 👉 Responsável abre o endereço de testes e entra com seu login |

Critério da E05 vindo da E04 (decisão 0012): os avisos aparecem dentro da casca de **todo**
aplicativo, inclusive para quem tem um só (hoje ficam no lançador).

## Bloco B: cadastros e estoque
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E07** Cadastros | Produtos, tipos de pedido, ingredientes, unidades, conversões, fornecedores; importação de planilha | Sonnet; Opus revisa | Planilha de exemplo importada com os erros apontados |
| **E08** Fichas técnicas | Receitas versionadas, rendimento, custo do prato · 📌 em seguida: S1 alergênicos | Opus na regra; Sonnet na tela | Custo confere com conta feita à mão |
| **E09** Estoque | Áreas, em uso e guardado, movimentos, perda, contagem (RC-09) | Opus; revisor | Movimentos fecham em quantidade e custo |
| **E10** Reposição | Linhas saudável e de emergência, avisos; a lista de compras é da frente lista-de-compras (LC3), que a E10 alimenta | Opus na regra; Sonnet na tela | Um aviso por cruzamento de linha |

## Bloco C: pedido e produção (o coração do sistema)
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E11** Pedido e baixa | RC-01 no servidor: pedido, baixa única, em uso e depois guardado, outbox, idempotência | **Opus; revisor** | Todos os testes de concorrência e repetição do RC-01 passam |
| **E12** Disponibilidade | O que pode ser vendido, calculado do estoque; botão "acabou" | Opus; revisor | Ingrediente zera e os produtos somem; entrada os devolve |
| **E13** Aplicativo do atendente | Mesas, comanda virtual, lançar pedido, tudo junto ou por partes, alterar pedido | Sonnet; Opus revisa | Pedido lançado no aparelho chega ao servidor uma única vez |
| **E14** Telas de produção | Telas por tipo, fila, iniciar, pronto, temporizador com cores, sons, elevador, cafeteria (RC-10) | Sonnet nas telas; Opus no tempo real | Critérios 1 a 3, 6 e 10 do RC-10 |
| **E15** Aviso e entrega | Aviso ao atendente, "Peguei", "Entregue", linha do tempo e busca do pedido (RC-17) | Sonnet; Opus revisa | Critérios 4 e 5 do RC-10 e os do RC-17 |
| **E16** Estimativa de tempo | Fila, capacidade, faixa e horário previstos · 📌 S13 tempo de espera no site (após semanas de dados) | Opus | Valor bate com a conta manual |
| **Portão 1** 🚪 | **Ensaio na loja, sem dinheiro:** uma noite com o sistema rodando em paralelo ao que existe hoje | — | 👉 Equipe usou, problemas anotados e corrigidos |

Critérios da E13 vindos da E03 (decisão 0011): atendente só altera **pedido próprio**, com **motivo obrigatório** (lançado errado ou cliente trocou); o **aviso aos supervisores** é gravado na mesma transação; o gerente vê as alterações numa aba própria; alteração de pedido já liberado para produção gera movimento compensatório, nunca uma segunda baixa. Tudo com teste por cargo direto no servidor.

## Bloco D: caixa e dinheiro
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E17** Caixa | Sessão, fundo de troco, painel de contas, recebimento com maquininha avulsa, Pago, sangria (RC-13); **desconto de funcionário (15%, regra real da casa)** · 📌 em seguida: S5 QR na mesa, S6 reserva, S8 QR de avaliação | **Opus; revisor** | Conta dividida com pagamento misto fecha no centavo |
| **E18** Fechamento | Fechamento cego, conferência, alertas ao gerente, relatório | Opus na regra; Sonnet no relatório | Critérios 5 e 6 do RC-13 |
| **E19** Pix integrado | Pix gerado pelo sistema com confirmação automática | **Opus; revisor** | Aviso repetido do provedor gera um recebimento só |
| **E20** Fiscal | Emissão pelo provedor, em ambiente de testes, com estados reais (RC-06) | **Opus; revisor**; contador valida | Nota rejeitada, timeout e reenvio sem duplicar |
| **E21** Financeiro básico e sorveteria | 📌 conta do funcionário a receber (RC-13 3a); lançamentos vindos do fechamento; aba de potes de sorvete; lançamento do dia da sorveteria (RC-11) · 📌 em seguida: S9 convênio de almoço | Sonnet; Opus revisa | Fechamento aparece no financeiro sem digitação |

## Bloco E: entrada em operação da gestão interna
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E22** Segurança e recuperação | Backup contínuo, restauração ensaiada e cronometrada, monitoramento | Opus | Restauração feita em outro servidor, com tempo medido |
| **E23** Produção | Servidor, domínio, HTTPS, branch `producao` | Opus | 👉 Servidor contratado e segredos criados |
| **E24** Treinamento | Ambiente de treino com dados fictícios, roteiro por cargo | Sonnet; Haiku | Cada cargo fez seu roteiro |
| **Portão 2** 🚪 | **Piloto por turno e corte:** inventário inicial, um turno por vez, depois a casa inteira | — | 👉 "Publique tudo" |

## Bloco F: site institucional (em paralelo, a partir da E07)
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E25** Site | Páginas, vitrine ligada ao cadastro, área para empresas (RC-07) em 7 PRs · 📌 S2 e S7 na E25.5; S10 após a E25.3; S3 ao fim; S4 é do responsável | Sonnet; Opus revisa a parte pública | Critérios do RC-07; 👉 "Publique tudo" |

Depende de identidade visual, textos, fotos e domínio. Não depende do restante.

## Bloco G: delivery próprio
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E26** Loja online | Cardápio, carrinho, disponibilidade, área e taxa de entrega, estimativa · 📌 desconto de funcionário de 15% sobre produtos + frete, sem acumular: vale o maior (RC-13 3a) | Sonnet; Opus nas regras | Preço e taxa calculados no servidor |
| **E27** Pagamento online | Reserva de estoque, pagamento, liberação para a cozinha, estorno · 📌 depois: S11 vale-presente (com o contador) | **Opus; revisor** | Critérios 1 a 5 do RC-08 |
| **E28** Acompanhamento e aplicativo | Etapas, itens, posição na fila, previsão; aplicativo instalável · 📌 em seguida: S12 Clube E-MOTION | Sonnet; Opus revisa | Critério 6 do RC-08 |
| **E29** Entregas | Expedição no caixa, aplicativo do motoboy, código de confirmação, prestação de contas (RC-14) | Sonnet; Opus na prestação de contas | Critérios do RC-14 |
| **Portão 3** 🚪 | Revisão de segurança da área pública, teste de carga, ensaio com pedidos reais de teste | Opus; revisor | 👉 "Publique tudo" |

## Bloco H: gestão avançada
| Etapa | Entrega | Modelos | Pronto quando |
|---|---|---|---|
| **E30** Financeiro completo | Compras a pagar, valores a receber, conciliação, fluxo de caixa, resultado (RC-15) | Opus; revisor | Critérios 1 e 2 do RC-15 |
| **E31** Pacote contábil | PDF, planilhas e XML por mês, com versão e controle de envio | Sonnet; Opus confere as somas | Totais batem com a origem |
| **E32** Calculadoras | CMV real e teórico, custo, preço, mercadoria e demais (RC-16) | Opus nas contas; Sonnet nas telas | Cada uma conferida com exemplo à mão |
| **E33** Painéis | Desempenho, prometido x realizado, venda perdida | Sonnet | Números abrem a origem |

## Bloco I: complementos
| Etapa | Entrega | Modelos |
|---|---|---|
| **E34** TVs e mídia | Piloto em duas telas (RC-02) | Sonnet; Opus revisa |
| **E35** Sorveteria: coleta automática | Só se a franquia tiver relatório ou API (RC-11) | Opus |
| **E36** iFood | Integração, se o cliente quiser | Opus |

## O que cada etapa precisa do cliente
| Etapas | Precisa de |
|---|---|
| E01 a E06 | **Nada.** Podem começar já |
| E07, E08 | Cardápio, fichas técnicas, unidades (dá para construir com exemplos e trocar depois) |
| E09, E10 | Lista de itens por área de estoque, prazos dos fornecedores |
| E14, E16 | Tempo de preparo e tipo de cada produto, pessoas por tipo e turno |
| E17, E18 | Regras do caixa: taxa de serviço, limite de gaveta, quem autoriza |
| E19, E27 | Provedor de pagamento com conta de testes |
| E20 | Provedor fiscal, dados da empresa, contador |
| E23 | Domínio e servidor |
| E25 | Identidade visual, textos, fotos |
| E26, E29 | Área e taxa de entrega, regras do motoboy |
| E31 | O que a contabilidade pede e em que formato |

## Por que esta ordem
- O que mais pode causar prejuízo (estoque, pedido, dinheiro) é feito cedo, com o modelo
  mais forte e com revisão independente, quando ainda é barato corrigir.
- A casa começa a usar no Portão 2 só o núcleo. Delivery, motoboy, financeiro completo e
  calculadoras entram depois, um de cada vez, sobre uma base já provada na loja.
- A homologação existe desde a E06, então o responsável vê cada parte funcionando, em vez
  de receber tudo no fim.

## Rotina depois de no ar
Diário: caixa, rejeições fiscais, filas e backups. Semanal: contagem de itens críticos,
perdas e preços. Mensal: resultado, permissões, custos e capacidade. Ensaiar restauração
periodicamente e após mudanças relevantes.
