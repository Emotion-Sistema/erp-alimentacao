# Ideias do cliente

Toda ideia entra aqui antes de virar requisito (skill `nova-ideia-cliente`).
Classificação: **núcleo** | **evolução** | **adiar**.

| # | Data | Ideia (na linguagem do cliente) | Problema que resolve | Classificação | Impacto técnico | Dependências | O que desloca | Decisão |
|---|---|---|---|---|---|---|---|---|
| 1 | 14/11/2026 | Cada categoria tem seu horário, inserido à mão no sistema, de quando está disponível no delivery e na loja | Delivery começa em hora diferente da loja; nada é vendido fora de hora (cozinha fecha 23h) | **núcleo** | Horário da loja e da cozinha por dia da semana; grade por categoria x canal (loja, delivery) x dia; exceções (feriado) e pausa manual. Servidor combina com o estoque (RC-09) | Cadastro de categorias (E07) | Pouco: E12 cresce um pouco | Aprovado como proposta: RC-09 seção 2a; só gerente geral, dono e administrador mudam horários; aguarda dados (segunda-feira, início do delivery) |
| 2 | 14/11/2026 | Quando o caixa ou o supervisor entra, aparece um checklist de coisas para conferir e dar ok antes de iniciar o turno, incluindo os horários do dia | Horários do delivery mudam por dia; nada começa sem conferência | **núcleo** | Lista configurável pelo gerente; respostas registradas por pessoa e turno; liga com a grade de horários (RC-09 2a) | Abertura do caixa (RC-13), horários (E07/E12) | Pouco: entra junto com a abertura do caixa | Proposto no RC-13, seção 1 |
| 3 | 15/11/2026 | Quando faltar no estoque, o item vai para uma lista de compras dos gerentes, que também aceita itens à mão; a nota da compra abate a lista; o sistema guarda o histórico e mostra em qual mercado cada produto é mais barato | Compra feita de cabeça, item esquecido, e ninguém sabe onde está mais barato | Lista: **núcleo** (já era da E10). Preços, roteiro e leitura de nota: **evolução** | Lista com 3 origens, categorias, locais de compra, histórico de preço por unidade comparável, dicionário nota x item, entrada no estoque com conferência. XML e foto lida por IA (com travas de conferência; serviço pago, exige confirmação); QR Code do cupom a validar | E07 para começar; E09 e E10 para a parte automática e a entrada; E08 para o aviso de custo do prato | Nada do roteiro principal (frente paralela `lista-de-compras`); assume a lista da E10 | Proposta em `cerebro/frentes/lista-de-compras.md`; **aprovada em 15/11/2026**, com leitura por IA |
| 4 | 15/11/2026 | Cadastrar mais rápido do que digitando tudo (sem tirar o campo de digitar) e, embaixo de cada campo, uma explicação com exemplo rápido que dá para mostrar ou esconder | Cadastro inicial demorado e com erro; quem usa não sabe o que pôr em cada campo | **núcleo** (padrão de tela; os cadastros iniciais conferidos são condição da virada segura) | Ajuda: componente único de campo com explicação e exemplo recolhível, em todas as telas, com teste que falha se um campo ficar sem ajuda. Cadastro rápido: catálogo pronto de itens de lanchonete/cafeteria com unidade, área e embalagens (marcar vários de uma vez), botões de embalagem com tamanho que calculam o valor sozinho, sugestão ao digitar o nome, duplicar item, salvar e cadastrar o próximo, colar uma lista (mesmo leitor da importação da parte 3) | E07 parte 1 (feita) | Parte 2 da E07 começa depois (cerca de 2 PRs); a parte 3 encolhe, porque o leitor de lista já fica pronto | Proposta enviada em 15/11/2026; aguardando "ok" |
| 5 | 15/11/2026 | Na unidade do estoque, já deixar as comuns prontas para escolher, como kg, L etc. | Hoje a tela só oferece g, ml e un; quem compra e conta em kg ou litro estranha e erra | **núcleo** (ajuste da tela de cadastro, E07) | Proposta: o estoque continua guardando a conta em g, ml ou un (conta exata, fichas técnicas em g); o ingrediente ganha "unidade para mostrar" (kg, g, L, ml, un, dz, cx...) escolhida numa lista pronta, e saldo, compra e telas aparecem nela. Migração pequena (1 coluna) e ajuste das telas | E07 parte 1 (feita) | Entra no começo da parte 2 da E07 (1 PR pequeno) | "ok" em 15/11/2026; feita no PR 41 |
| 6 | 15/11/2026 | Embalagens: o "adicionar embalagem" fica escondido (botão Mostrar); a embalagem pode ficar atrelada ao fornecedor (opcional, vira o padrão dele); talvez uma aba só de embalagens, categorizada, para escolher a dedo ao lançar o ingrediente | Responsável ainda acha difícil lidar com embalagem no meio do cadastro do ingrediente | **núcleo** (RC-16 já pede "arredondado pela embalagem do fornecedor"; a lista de compras e a entrada por nota usam) | Proposta: aba "Embalagens" com modelos prontos e categorizados por tipo (saco, caixa, fardo...), cada um com tamanho e, opcional, fornecedor; no ingrediente, seção recolhida "Mostrar" que escolhe do catálogo (filtra pela família e mostra primeiro as do fornecedor do item) e cria nova se faltar. Migração: tabela `embalagem_modelo` + `modelo_id` e `fornecedor_id` opcionais na conversão do ingrediente. Conta continua `para_unidade_base` | E07 parte 1 e ideia 5 (feitas) | Parte 2 da E07 atrasa ~2 PRs; avisar a frente lista-de-compras (usa embalagem por fornecedor) | "ok" e capturas aprovadas em 15/11/2026; feita no PR 46 |
| 7 | 18/11/2026 | Uma paleta de cores tirada da logo, refinada e sutil, que dê desejo pelos produtos e passe confiança, com o claro predominando, para site, delivery, cardápio, telas internas e impressos | Hoje o sistema usa tema neutro (azul e cinza) que não é a cara da casa; site e delivery precisam vender | **evolução** (não toca no RC-01; entra na base visual) | Só troca de valores em `packages/interface/src/tema.css` e `cores.ts` (decisão 0012); proposta em `cerebro/empresa/paleta-da-marca/` | Escolha do clima pelo responsável; aplicação pelo chat principal | Nada no roteiro: é uma troca de valores com o teste de contraste que já existe | Frente `paleta-da-marca`; escolhido em 18/11/2026: Espuma e Brasa, claro por padrão, escuro só se o aparelho do cliente estiver escuro (site, delivery, app do cliente); interno sempre claro |
| 8 | 18/11/2026 | Site em emotionjf.com.br com o cardápio (sem preço) e uma área tipo portfólio para empresas contratarem coffee break, almoço corporativo e eventos no espaço; botão para iFood e WhatsApp até o delivery próprio | A casa não tem vitrine própria nem porta de entrada para vendas a empresas | **núcleo do site** (E25; já era RC-07, agora ampliado) | Vitrine só de leitura dos cadastros; páginas geradas com cache; oportunidades na gestão (tabela nova, migração) com sino; editor de conteúdo com rascunho/publicado; permissões `site.editar` e `empresas.*` | E07 (produtos, categorias, horários); domínio comprado e E23 para ir ao ar | Nada do roteiro principal: bloco F já era paralelo; começa depois da E07 | RC-07 v2 proposto em 18/11/2026, com 13 sugestões (S1 a S13); aguardando "ok" |
| 9 | 18/11/2026 | No site, uma parte sobre missão, valores etc.; todos os funcionários no site; e um CMS para configurar tudo que vai para o site | Mostrar quem é a casa e quem faz; mudar o site sem programador | **núcleo do site** (E25) | Quem somos e equipe (seção 3.4 do RC-07): equipe ligada ao cadastro de funcionários, autorização de imagem registrada, saída automática; CMS (seção 4): páginas por blocos, mídia, rascunho, prévia, agendamento, versões, editor x publicador; migrações e permissões novas | E03 (funcionários), E07; autorização de imagem validada pelo jurídico/contador | E25 passa de 5 para 7 PRs; nada do roteiro principal | Proposto em 18/11/2026; aguardando "ok" |
| 10 | 18/11/2026 | Todos os funcionários da empresa têm 15% de desconto nos produtos da loja (já acontece hoje) | Regra real da casa que o sistema precisa seguir, sem conta de cabeça e sem desvio | **núcleo** (caixa, E17) | Desconto por grupo calculado no servidor em centavos, gravado no pedido com percentual e funcionário; identificação do próprio funcionário; percentual configurável com histórico; relatório mensal | E17 (caixa), E03 (funcionários); fiscal com o contador (E20) | Pouco: E17 cresce um pouco; a mesma regra serve ao S9 e ao S12 | Registrado no RC-13 seção 3a. Respostas de 18/11/2026: vale no delivery próprio (com frete) e na sorveteria, não acumula (vale o maior desconto, corrigido no mesmo dia), pago na hora ou na conta do funcionário (conta a receber, E21) |

## Já registradas como requisito (não repetir aqui)
- Pedido chega sozinho na cozinha e baixa o estoque: RC-01.
- Vídeos de comida nas TVs, escolhidos no sistema: RC-02.
- Cada setor com seu próprio aplicativo: RC-03.
- Central fiscal, contábil e de documentos: RC-06.
- Site institucional com páginas de produtos e contato para empresas: RC-07.
- Delivery próprio pelo site e aplicativo para o cliente pedir: RC-08.
- Estoque ligado à venda (em uso e guardado), notificações ao responsável e linhas saudável e de emergência: RC-09.
- Telas da cozinha por tipo de pedido, botão de fila, temporizador com cores, som de pedido novo, botão de pronto, aviso ao atendente com a mesa, tudo junto ou por partes: RC-10.
- Cliente acompanha etapas e vê estimativa de tempo pela fila e pelo preparo: RC-10 (seções 7 e 8) e RC-08.
- Sorveteria 60 Sabores: extrair dados do sistema da franquia e aba de controle dos potes: RC-11.
- Cargos e acessos, login por pessoa na cozinha: RC-12.
- Caixa completo e organização dos motoboys: RC-13. Aplicativo do motoboy: RC-14.
- Financeiro completo e documentos para a contabilidade: RC-15.
- CMV, calculadora de mercadoria e outras: RC-16.
- Registro de tudo, busca de pedido com linha do tempo, Entregue x Pago: RC-17.
- Notificação e comunicação interna em todos os aplicativos: RC-18.

## Sugestões do Claude ainda não pedidas pelo cliente (avaliar com ele)
| Sugestão | Por que vale | Classificação proposta |
|---|---|---|
| Acompanhamento do pedido em tempo real por link, sem instalar nada | Reduz ligações "cadê meu pedido" | núcleo do delivery |
| Retirada no balcão com horário marcado | Mesmo fluxo do delivery, sem entregador | núcleo do delivery |
| Pausar o delivery ou aumentar o prazo com um toque quando a cozinha lota | Evita atraso e cancelamento | núcleo do delivery |
| Pedido agendado (almoço de amanhã, encomenda) | Aumenta ticket e previsibilidade | evolução |
| Cardápio por QR Code na mesa usando a mesma loja | Reaproveita tudo do delivery | evolução |
| Cupom de primeira compra e programa de pontos | Traz o cliente do iFood para o canal próprio (sem taxa) | evolução |
| Formulário de encomendas e eventos para empresas, virando oportunidade no sistema | É a "área para empresas" com acompanhamento | núcleo do site |
| Avaliação após a entrega, ligada ao pedido | Qualidade com rastreio | evolução |
| Contagem rápida diária de poucos itens no aplicativo de estoque | Mantém o estoque do sistema fiel ao real sem parar a loja | núcleo do estoque (RC-09) |
| Lista de compras automática por fornecedor, aprovada por pessoa | Tira a conta da cabeça do responsável | núcleo do estoque (RC-09) |
| Relatório de venda perdida por item esgotado | Mostra o custo de não repor | evolução |
| "Terminar juntos": indicar quando iniciar cada item para a mesa ficar pronta ao mesmo tempo | Nada esfria esperando | núcleo da cozinha (RC-10) |
| Reabrir pedido que subiu errado, com prioridade | Corrige erro sem confusão | núcleo da cozinha (RC-10) |
| Painel de desempenho da cozinha (tempo por produto, estação e turno) | Mostra gargalos | evolução |
| Acompanhar o pedido da mesa por QR Code, sem instalar nada | O cliente do salão também vê as etapas | núcleo (RC-10) |
| Capacidade da cozinha informada por turno | Deixa a estimativa de tempo realista | núcleo (RC-10) |
| Relatório prometido x realizado | Calibra a estimativa e mostra onde atrasa | evolução |
| Senha de retirada na TV do salão | Organiza o balcão | evolução |
| Fechamento cego do caixa | Protege contra erro e desvio | núcleo do caixa (RC-13) |
| Alertas ao gerente de padrões suspeitos no caixa | Segurança sem vigiar tela | núcleo do caixa (RC-13) |
| Código de 4 dígitos do cliente como prova de entrega | Acaba com "não recebi" | núcleo das entregas (RC-14) |
| Mensagens presas ao pedido, com respostas prontas | Cozinha e salão se falam sem sair do lugar | núcleo (RC-18) |
| CMV teórico x real | Mostra perda e desvio que o CMV sozinho esconde | RC-16 |
| Crachá de aproximação para login na cozinha | Entra sem digitar | adiar |
| Aviso por WhatsApp do andamento do pedido | Muito valorizado; depende de serviço pago e aprovação | adiar |
| Aplicativo nas lojas (Android/iPhone) | Só se o instalável pelo navegador não bastar | adiar |
