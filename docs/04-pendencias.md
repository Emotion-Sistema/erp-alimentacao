# Pendências com o cliente

O questionário completo para levar ao dono da empresa está em PDF, entregue ao
responsável em 13/11/2026 ("Perguntas para o dono"). Ao receber as respostas, atualize
esta tabela e o cérebro.

Avance com hipótese explícita onde for reversível. Pergunte quando a resposta mudar uma decisão.

Na coluna "Trava", os códigos F são as fases antigas; a ordem atual usa etapas E
(`03-roteiro-de-fases.md`, tabela "O que cada etapa precisa do cliente").

| # | O que confirmar | Decisão que muda | Hipótese enquanto não há resposta | Trava |
|---|---|---|---|---|
| 1 | ~~Significado de "guardado"~~ **Respondida em 13/11/2026:** em uso (imediato) e guardado (reserva), ver decisão 0006 | — | — | — |
| 2 | Nome, marcas, CNPJ(s), UF, município, regime tributário, contador | Configuração fiscal, quem vende/recebe/emite | Um CNPJ, uma unidade | F6 |
| 3 | Pedidos por dia, pico simultâneo, número de dispositivos | Capacidade do servidor, esforço de otimização | 5 a 15 dispositivos | F9 |
| 4 | **Respondida em 13/11/2026:** sorveteria é franquia 60 Sabores com sistema próprio; fora do escopo (RC-11) | — | — | — |
| 5 | Enquanto o delivery próprio não existe, o iFood segue em uso? Quer integração depois? | Prioridade da integração | Lançamento manual; integração como evolução | F4 |
| 6 | Baixa do estoque no envio à produção ou no início do preparo | Política de consumo do RC-01 | No envio (pedido explícito do cliente) | F4 |
| 7 | Continuidade exigida sem internet | Servidor local, custo | Operação conectada com segundo link | F9 |
| 8 | Modelos exatos de impressora, balança, maquininha, TVs e rede | Agente local, integrações, RC-04 | Nenhuma compatibilidade presumida | F6/F8 |
| 9 | Sistemas e contratos atuais (PDV, fiscal, adquirente, ponto) | Construir, integrar ou migrar | Sem migração de sistema anterior | F6 |
| 10 | Cardápio, fichas técnicas, ingredientes e unidades | Cadastros e saldo inicial | Dados sintéticos de exemplo | F3 |
| 11 | Logo, paleta e identidade autorizados | Base visual | Tema neutro configurável | F7 |
| 12 | Quem valida cada entrega do lado do cliente | Aceite | Responsável técnico concentra | todas |
| 13 | Domínio a usar e quem é o dono dele | Endereços do site, loja e gestão | Subdomínios de um domínio único | P/F8 |
| 14 | Área de entrega, taxa (fixa, por bairro ou por distância), pedido mínimo, entregadores próprios ou terceiros | Cálculo de frete e expedição | Entregador próprio, taxa por bairro | F9 |
| 15 | Aceita pagamento na entrega (dinheiro/maquininha) além de Pix e cartão online? | Regra de liberação do pedido | Só pagamento online no início | F9 |
| 16 | Provedor de pagamento online preferido (ou conta já existente) | Integração de pagamento | A escolher, com ambiente de testes | F6/F9 |
| 17 | Horário do delivery e capacidade da cozinha no pico | Pausa e limite de pedidos | Mesmo horário da loja | F9 |
| 18 | Conteúdo do site: textos, fotos, serviços para empresas | Estrutura do site | Estrutura do RC-07 com textos provisórios | P |
| 19 | Identidade visual (será enviada depois) | Aparência de tudo | Tema neutro configurável | P/F7/F9 |
| 20 | **Respondida em 13/11/2026:** estoque por área: cozinha (alimentos) e supervisor (bebidas, cafeteria, potes); escalada para o gerente geral | — | — | — |
| 21 | Prazo de entrega de cada fornecedor e dias de folga desejados | Sugestão das linhas saudável e de emergência | Linhas informadas manualmente no início | F3 |
| 22 | ~~Supervisor pode vender com saldo zerado na loja física?~~ **Respondida em 13/11/2026:** sim, com contagem depois; delivery rígido | — | — | — |
| 23 | Margem de segurança na loja online (quanto segurar de cada item crítico) | Disponibilidade no delivery | Margem só nos itens que o cliente indicar | F9 |
| 24 | **Respondida em 13/11/2026:** cafeteria tem tela própria no salão; sorveteria fora do sistema | — | — | — |
| 25 | **Respondida em 13/11/2026:** telas por tipo de pedido, não por lugar; cada produto tem um tipo | — | — | — |
| 26 | **Respondida em 13/11/2026:** por item; pedido de várias áreas: atendente pergunta tudo junto ou por partes | — | — | — |
| 27 | **Respondida em 13/11/2026:** Android da empresa, usado só na loja; login por funcionário, permissões por cargo | — | — | — |
| 28 | **Respondida em 13/11/2026:** hoje a cozinha embala e sobe pelo elevador; vai mudar, então é configuração | — | — | — |
| 29 | Tempo de preparo padrão de cada produto e limites das cores | Temporizador | Verde até 70%, amarelo até 100%, vermelho depois | F3 |
| 30 | **Respondida em 13/11/2026:** só a cozinha usa o elevador; cada área entrega o seu | — | — | — |
| 31 | **Respondida em 13/11/2026:** quem compra é o gerente geral (decisão 0008) | — | — | — |
| 32 | Nome exato do sistema da franquia 60 Sabores, contato do suporte e da franqueadora; ele exporta relatórios? tem API? | Caminho de coleta do RC-11 | Lançamento manual do fechamento diário | Evolução |
| 33 | A sorveteria tem CNPJ próprio ou é o mesmo da casa? O contrato de franquia permite integração? | Fiscal, consolidação e o que pode ser lido | CNPJ e caixa separados | Evolução |
| 34 | Que dados da sorveteria o cliente quer ver no painel (vendas, pagamentos, insumos)? | Tela do gestor | Vendas e pagamentos do dia | Evolução |
| 35 | Quantas pessoas trabalham em cada tipo de pedido por turno (capacidade simultânea) | Estimativa de tempo | Capacidade 2 por tipo, ajustável | F4 |
| 36 | Tempo de deslocamento por região de entrega e limite de prazo aceitável antes de pausar o delivery | Estimativa e proteção automática | 15 min por região; pausa acima de 60 min | F9 |
| 37 | **Respondida em 13/11/2026:** cargos definidos no RC-12 | — | — | — |
| 38 | **Respondida em 13/11/2026:** gerente geral vê custos da área dele; não vê o faturamento da empresa | — | — | — |
| 39 | Motoboy usa celular próprio (pode ser iPhone) ou aparelho da empresa? | Aplicativo do motoboy e avisos | Celular próprio, qualquer sistema | F9b |
| 40 | Como o motoboy próprio é remunerado (por entrega, por região, fixo)? | Prestação de contas e custo da entrega | Valor por entrega, por região | F9b |
| 41 | **Parcial em 13/11/2026:** um caixa, maquininha avulsa (baixa manual). Falta: gaveta e impressora ligadas ao computador? Qual operadora da maquininha? | Conferência e impressão | Baixa manual com conferência no fechamento | E17 |
| 42 | Há taxa de serviço (10%) ou gorjeta? Como é repassada? | Conta e fechamento | Opcional, mostrada separada | F5 |
| 43 | O que a contabilidade pede hoje, em que formato e para qual sistema? Com que frequência? | Pacote contábil | PDF com planilhas e XML, mensal | F11 |
| 44 | Sorvete: o controle é por pote inteiro? Como é feito o pedido de reposição à franquia? | Aba de potes | Por pote; pedido feito fora do sistema pelo gerente | F5 |
| 45 | Limite de dinheiro em gaveta e tempo máximo de conta entregue sem pagamento antes de alertar | Avisos do caixa | A definir com o cliente | F5 |
| 46 | **Respondida em 13/11/2026:** código de 4 dígitos uma vez por turno; depois é só tocar na foto | — | — | — |
