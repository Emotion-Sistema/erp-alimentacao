# Visão e escopo

## O negócio
Uma empresa que reúne cafeteria, almoço, porções, hambúrgueres e salgados, e abriga uma
sorveteria de autoatendimento da franquia 60 Sabores, que tem sistema próprio e fica
fora deste projeto, salvo leitura de dados (RC-11). Consumo no local, balcão, retirada, delivery por iFood e por canal próprio.
Tem funcionários CLT, sócios e turnos. Objetivo: operação conectada do estoque ao
pagamento, fiscal, financeiro e rotinas da equipe, com a identidade visual da empresa.

Desenvolvimento sob encomenda para essa empresa. Não é produto para revenda.

## As três frentes
| Frente | O que é | Requisitos |
|---|---|---|
| Gestão interna | Aplicativos por função: caixa, atendimento, cozinha, estoque, gestor | RC-01, RC-03, módulos |
| Site institucional | Site da empresa com produtos e área para empresas | RC-07 |
| Delivery próprio | Loja online e aplicativo instalável, do pagamento à cozinha | RC-08 |
Um núcleo, um banco, um cadastro de produtos para as três.

## Objetivos mensuráveis
Tempo de atendimento e de preparo, divergências de caixa e de estoque, perdas, margem por
produto e canal, falhas de integração. Registrar a situação atual antes da implantação
para poder comparar depois.

## Gestão interna: o que entra
Uma empresa/CNPJ e uma unidade. Hipótese de 5 a 15 dispositivos simultâneos, a confirmar.

| Frente | Entrega |
|---|---|
| Diagnóstico e identidade | Mapeamento essencial dos processos, protótipos operacionais, aplicação de logo e paleta fornecidos pela empresa (não inclui criação de marca) |
| Cadastros e estoque | Produtos, ingredientes, unidades, receitas e adicionais, movimentos, inventário básico; estoque em uso e guardado; disponibilidade automática para venda; linhas saudável e de emergência; notificações ao responsável (RC-09) |
| Pedido e produção | Registro pelo atendimento/caixa, mesas e comandas básicas, fila por setor, status e notificações, envio automático e consumo por ficha técnica (RC-01) |
| Cargos e acessos | Um login por funcionário, permissões por cargo, login por código nos tablets da cozinha (RC-12) |
| Caixa | Abertura, painel de contas, recebimento, fechamento cego, segurança, expedição (RC-13). Só o caixa marca Pago |
| Registro e busca | Tudo registrado; busca de pedido com linha do tempo e tempos (RC-17) |
| Comunicação | Aviso no aparelho e central interna em todos os aplicativos (RC-18) |
| Financeiro | Básico na primeira entrega; completo com pacote para a contabilidade externa depois (RC-15) |
| Calculadoras | CMV, custo do prato, preço, mercadoria e outras (RC-16) |
| Entregas | Aplicativo do motoboy próprio e prestação de contas (RC-14) |
| Sorveteria 60 Sabores | Leitura de dados do sistema da franquia e aba de controle de potes (RC-11) |
| Interfaces por função | Caixa, atendimento, produção por setor, gestor/dono, estoque/expedição e colaborador básico; núcleo único; tarefas e comunicados simples |
| Mídia e TVs | Biblioteca, playlists, publicação e agenda básica, piloto em até duas telas independentes |
| Integrações delimitadas | Um provedor fiscal e um provedor de pagamento, com API documentada e ambiente de testes |
| Implantação | Configuração inicial, testes, documentação, treinamento, área de suporte no sistema para registrar e acompanhar chamados |
| Site institucional | Vitrine de produtos ligada ao cadastro, área para empresas com formulário, páginas institucionais (RC-07) |
| Delivery próprio | Loja online com entrega e retirada, pagamento online, acompanhamento do pedido, aplicativo instalável (RC-08) |

As interfaces são aplicativos web responsivos e instaláveis, por função.

## O que fica para depois (evolução)
| Tema | Primeira versão | Evolução |
|---|---|---|
| Cozinha e estoque | RC-01 com baixa por receita, auditoria, tratamento de duplicidade e cancelamento | Medição física automática, sensores |
| Aplicativos | Aplicativos web instaláveis (internos e do cliente) | Apps nativos, lojas de aplicativos, gestão de dispositivos (MDM) |
| TVs | Até 2 telas independentes, playlists e agenda | Video wall, sincronismo preciso, player próprio, mais telas |
| Delivery | Delivery próprio completo; pedidos do iFood lançados manualmente | API do iFood, WhatsApp automatizado, roteirização, rastreio no mapa |
| Ponto e RH | Escala, comunicados e tarefas básicos; link para o serviço de ponto existente | Integração de ponto, folha, banco de horas |
| Continuidade | Operação central conectada, backups, contingência documentada | Offline coordenado entre dispositivos, servidor local, alta disponibilidade |
| Gestão | Relatórios básicos e consulta por perfil | DRE avançada, conciliação bancária automática, previsão, IA |
| Fiscal/contábil | Emissão pelo provedor, com estados reais | Central fiscal, contábil e documental ampliada (RC-06) |

Atenção ao iFood: se o cliente depende dele no dia a dia, a integração pode precisar
subir de prioridade. É uma das pendências de `04-pendencias.md`.

## Regras que sustentam o projeto
- Registrar cada informação uma vez e reutilizá-la nos demais módulos.
- Separar status de pedido, produção, pagamento, entrega e documento fiscal.
- Rastreabilidade: ajustes e cancelamentos geram movimentos compensatórios e histórico.
- Confirmação humana para compras, pagamentos, mudança de preço e ações acima da alçada.
- Resolver rastreabilidade, filas, estoque e comunicação antes de automações sofisticadas.

## Papéis
| Quem | Responsabilidade |
|---|---|
| Responsável técnico (dono deste repositório) | Decisões, aprovação de PR e de implantação, contato com o cliente |
| Claude Code | Especificar, implementar, testar e documentar dentro dos limites do `CLAUDE.md` |
| Empresa cliente | Dados, receitas, identidade, equipamentos, decisões de processo, validação das entregas |
| Contador | Enquadramento, regras e cadastros fiscais, validação da parametrização |
| Fornecedores (fiscal, pagamento, iFood) | Documentação, acesso e homologação |
