# Ideias do cliente

Toda ideia entra aqui antes de virar requisito (skill `nova-ideia-cliente`).
Classificação: **núcleo** | **evolução** | **adiar**.

| # | Data | Ideia (na linguagem do cliente) | Problema que resolve | Classificação | Impacto técnico | Dependências | O que desloca | Decisão |
|---|---|---|---|---|---|---|---|---|
| 1 | 14/11/2026 | Cada categoria tem seu horário, inserido à mão no sistema, de quando está disponível no delivery e na loja | Delivery começa em hora diferente da loja; nada é vendido fora de hora (cozinha fecha 23h) | **núcleo** | Horário da loja e da cozinha por dia da semana; grade por categoria x canal (loja, delivery) x dia; exceções (feriado) e pausa manual. Servidor combina com o estoque (RC-09) | Cadastro de categorias (E07) | Pouco: E12 cresce um pouco | Aprovado como proposta: RC-09 seção 2a; só gerente geral, dono e administrador mudam horários; aguarda dados (segunda-feira, início do delivery) |
| 2 | 14/11/2026 | Quando o caixa ou o supervisor entra, aparece um checklist de coisas para conferir e dar ok antes de iniciar o turno, incluindo os horários do dia | Horários do delivery mudam por dia; nada começa sem conferência | **núcleo** | Lista configurável pelo gerente; respostas registradas por pessoa e turno; liga com a grade de horários (RC-09 2a) | Abertura do caixa (RC-13), horários (E07/E12) | Pouco: entra junto com a abertura do caixa | Proposto no RC-13, seção 1 |
| 3 | 15/11/2026 | Quando faltar no estoque, o item vai para uma lista de compras dos gerentes, que também aceita itens à mão; a nota da compra abate a lista; o sistema guarda o histórico e mostra em qual mercado cada produto é mais barato | Compra feita de cabeça, item esquecido, e ninguém sabe onde está mais barato | Lista: **núcleo** (já era da E10). Preços, roteiro e leitura de nota: **evolução** | Lista com 3 origens, categorias, locais de compra, histórico de preço por unidade comparável, dicionário nota x item, entrada no estoque com conferência. XML e foto lida por IA (com travas de conferência; serviço pago, exige confirmação); QR Code do cupom a validar | E07 para começar; E09 e E10 para a parte automática e a entrada; E08 para o aviso de custo do prato | Nada do roteiro principal (frente paralela `lista-de-compras`); assume a lista da E10 | Proposta em `cerebro/frentes/lista-de-compras.md`; **aprovada em 15/11/2026**, com leitura por IA |

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
