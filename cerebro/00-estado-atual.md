# Estado atual do projeto

Atualizado em: 18/11/2026

## Em que pé estamos
- **Novo visual "Balcão" (decisões 0028 e 0030), partes 1 a 4 feitas em 25/11/2026:** casca e acabamento iguais ao protótipo A; telas Produtos, Funcionários, Ingredientes, Estoque e Fichas no formato do protótipo; abas novas Mesas, Novo pedido e Produção; tema claro/escuro e letra normal/grande por pessoa (sol/lua no topo, "Letra grande" no menu da conta). Frente: `cerebro/frentes/visual-limpo.md`.
- **Junção automática ligada (25/11/2026):** regra `main protegida` com testes obrigatórios; todo PR é aberto com auto-merge (squash). CI em 3 trabalhos paralelos (~3,5 min).
- Fase: **E02 (fundação) feita** no PR #4: monorepositório, banco, login e permissões no
  servidor, CI. Comandos no `CLAUDE.md`; bibliotecas na decisão 0010.
- **E03 (cargos, login e auditoria) feita** no PR #5 (merge a853254): matriz de cargos testada pela
  tela e pela API, cargo ativo, bloqueios, segundo fator, estação da cozinha. Revisão independente
  aprovada na 2ª rodada. Hipóteses da 0011 respondidas em 14/11/2026: atendente altera pedido (avisa supervisores),
  financeiro compra materiais, caixa com mapa de mesas. Cozinha fecha 23h, loja 23h30;
  horários de venda por categoria e canal no RC-09 (seção 2a): segunda fechado; delivery e
  categorias sempre à mão (com padrão); checklist de início do turno (RC-13, ideia nº 2).
- Tablet da cozinha: sai às 00h30, a cozinha estende 30 min até 4x, com bipe (migração 0003).
- Regra do responsável: nunca ignorar falha (CLAUDE.md); testes rodam em ordem embaralhada.
- **Regra do responsável (15/11/2026): ele nunca altera textos para colar.** Todo texto ou script que ele deve
  colar (chat novo, terminal) vai inteiro e pronto; se mudar, reenviar inteiro na sequência.
- **Fotos dos produtos** (pasta "E-MOTION" do marketing, 19/11/2026): 67 fotos feitas com IA, **aceitas** pelo responsável, mesmo as que divergem do prato. Preço do prato do dia = o da arte (cardápio de 18/11 desatualizado nisso); executivos do dia escolhidos à mão (S2), sem escala fixa. Detalhe em `cerebro/empresa/fotos-dos-produtos.md`; nada no repositório ainda.
- **Drive** (pasta "Claude"): 00 Referências, 01 Cliente, 02 Fiscal e contador, 03 Equipamentos, 04 Exportações,
  05 Fichas técnicas (Prontas, Para atualizar), 06 Cardápio e produtos, 07 Identidade visual, 08 Compras e notas,
  09 Planilhas para importar, e o documento LEIA-ME (criados em 15/11/2026). Caixa de entrada; a verdade é o repositório.
- **E04 (base visual e cascas) feita** no PR #11 (merge 858ad9f; decisão 0012).
- **E05 (avisos) feita** no PR #12 (merge 5a3ceac; decisão 0013): avisos por cargo ativo, unidade e
  turno, comunicados com confirmação de leitura, sino em todo app.
- **Ajuste da E05: turnos da equipe** (migração 0005): Turno 1 08h-15h30, Turno 2 15h30-23h30;
  cada um tem o próprio login e é do turno em que entrou (15h10 = Turno 1); margem de troca de
  30 min que os gerentes mudam na tela Gestão → Turnos (ação `horarios.gerenciar`); botão
  "Continuo no turno" com senha. 169 testes + 64 de tela; revisão aprovou na 4ª rodada.
  154 testes + 63 de tela; revisão reprovou 1x (corrigido) e aprovou.
- **E06 (homologação) feita** (PRs #15 e #16; decisão 0014): servidor no ar em
  `https://gestao.187-53-114-38.sslip.io` (certificado válido), preparado pelo responsável em
  15/11/2026; cada merge na main com CI verde aparece lá sozinho (o servidor puxa a branch
  `homologacao`, migra, confere e volta se falhar; o fluxo do GitHub espera a versão em
  /api/saude). Papéis separados do banco (app não apaga). Login de dono do responsável
  (nomes de empresa e loja de teste; ainda sem tela para mudar, vem na E20).
- **E07 (cadastros) em andamento** (ok do responsável em 15/11/2026), em 3 PRs: (1) unidades,
  conversões, ingredientes, fornecedores, locais de estoque; (2) categorias com horários, tipos de
  pedido e produtos; (3) importação de planilha (.xlsx, .csv e também **.html** com tabela, pedido
  do responsável), com relatório de erros por linha na tela, sem gravar até estar certo.
  Cardápio inventado até chegar o real; o responsável pode mandar atualizações a qualquer momento.
  Hipóteses: `cadastros.gerenciar` para dono, administrador e gerente geral; custo só com `custos.ver`.
  **Parte 1 feita** (PR 26, merge 05a65b2, no ar na homologação; migração 0006, decisão 0015;
  diário `diario/2026-11-15-e07-cadastros.md`). **Ideia nº 4 feita** (PRs 32 e 34: ajuda em cada campo e
  cadastro rápido; no ar na homologação). **Reforma visual feita** (PR 37, merge 65352af, aprovada pelo
  responsável e no ar na homologação às 15:15 UTC: dados com rótulo, selos, fundo sempre claro). **Ideia nº 5 feita** (PR 41; embalagens num bloco só, aprovado, PR seguinte, merge 58f00a2, no ar na homologação; migração 0008, adendo na decisão 0015): lista pronta de unidades (kg, g, L, ml, un, dz); conta por dentro segue em g/ml/un. **Ideia nº 6 feita** (PR 46, merge eac6ff2, no ar na homologação; migração 0009, decisão 0015 item 10): aba Embalagens (catálogo por tipo, padrão por fornecedor) e bloco recolhido no ingrediente; telas em `apps/gestao/app/cadastros/embalagens/` com LEIA-ME. **Aba Ingredientes** com a lista primeiro e janela "Adicionar ingrediente" (Rápido/Comum) (PR 48, merge 77986a6, no ar na homologação em 17/11/2026). **Parte 2 em andamento (17/11/2026):** PR 1 de categorias e horários de venda feito (PR 51, merge 1ce59cb; migração 0010, decisão 0016; telas `/cadastros/horarios` e `/cadastros/categorias`). Os 11 itens de unidade a confirmar estão com asterisco (PR 52; resposta do responsável em 22/11, lembrete agendado). Diário `diario/2026-11-17-e07-parte2-horarios.md`. Janela deslocada corrigida (PR 54, merge edb9e7d). **PR 2 tipos de produção feito** (PR 57, merge d9fdea1; migração 0011, decisão 0017; tela `/cadastros/tipos-producao`). Posição na lista no lugar do número de ordem (PR 61, merge 92d157d; adendo 18/11 da decisão 0012: campo que depende do que já existe mostra a lista). **PR 3 produtos feito** (PR 76, merge adfa12d, na homologação; migração 0012, decisão 0018; tela `/cadastros/produtos`). **E07 terminada (19/11/2026):** unidades confirmadas, escolha da unidade no cadastro rápido e tipos Porções, Salgados e Almoço (PR 107, migração 0013); **importar planilha** .xlsx/.csv/.html com erros por linha (PR 108, migração 0014, decisão 0020; revisor aprovou na 2ª rodada). **Passo 3, produtos completos (19/11/2026):** parte 1 preço do delivery (vazio = igual à loja), tamanhos por acréscimo e grupos de adicionais com mínimo/máximo, tela `/cadastros/adicionais` (PR 111, migração 0015, decisão 0021); parte 2 foto do produto no PostgreSQL, refeita pelo servidor com sharp em WebP ≤1200 px e ≤1 MB, sem EXIF (PR 112, migração 0016, decisão 0022; revisor aprovou na 3ª rodada); parte 3 combos por partes e opções, combo sem tipo de produção, cada opção vai para a sua tela (PR 113, migração 0017, decisão 0023). Regra única do preço `precoDoItem` (tela e servidor) e `calcularPrecoDoItem` pronta para a E11. **Passo 4, base do Clube na gestão feito (19/11/2026)** (PR 115, merge a0825ba; migração 0018, decisão 0024; tela `/clube` no app Gestão; permissões `clube.ver`/`clube.gerenciar` para dono, administrador e gerente geral; desconto do app, categorias, teto, horário, pontos, prêmios, presentes e campanhas, tudo editável, Clube nasce desligado; revisor aprovou com ressalvas, corrigidas). **Repositório público desde 19/11/2026** (decisão do responsável, para ter minutos ilimitados no GitHub Actions; os minutos grátis do mês tinham acabado): tudo no Git e no cérebro é visível a qualquer pessoa; segredos continuam só nos cofres (varredura de 19/11 sem nenhum). **E08 fichas técnicas feita (19/11/2026)** (PRs 118, 119 e 120; migração 0019, decisão 0025; tela Cadastros → Fichas técnicas): fichas de produto, tamanho, adicional e preparo da casa; versões imutáveis; consumo direto (ingredientes e preparos, fração exata, é o que a E11 baixa) e expandido (custo); pendências (incompleta não baixa); custo de referência e margem por canal com alerta; versão para a cozinha (1x/2x/3x); comparar versões; importar por planilha (conferir, gravar tudo, pular as com erro). Revisor aprovou na 4ª rodada. **Fichas reais da casa** (59) viraram planilhas no Drive "09 Planilhas para importar" (ingredientes.csv 168, produtos.csv 30, fichas.csv 15 preparos + 44 produtos, 222+ pendências); NUNCA entram no Git (repositório público). Ordem para importar: ingredientes → produtos (Cadastros → Importar planilha) → fichas (Fichas técnicas → Importar, marcando "gravar as boas"). **Ideia nº 13 feita (20/11/2026, PR 124):** toda importação (cadastros e fichas) deixa corrigir os erros ali mesmo no painel ("Corrigir aqui", conferir de novo, baixar a planilha corrigida) e avisa quando a planilha parece de outro tipo; regra: toda importação nova já nasce assim (adendos 0020 e 0025). Pendência técnica: ler .xlsx com texto compartilhado ainda expande tudo na memória (pôr teto do total lido). **S1 alergênicos feita (24/11/2026, PR 127; migração 0020, decisão 0026):** catálogo editável (lista inicial = hipótese pela RDC 26/2015 e 136/2017, confirmar com o responsável e nutricionista); ingrediente marcado contém/traços/não contém e "conferido"; prato herda pela ficha (preparos, opcionais à parte); na dúvida "em conferência", nunca "não contém" (inclui alergênico novo na lista, troca de nome/fornecedor, tela com lista antiga); revisor aprovou na 3ª rodada. Pendente: aviso ao gerente, selos no site/delivery. **E09 estoque feita (25/11/2026), completa a pedido do responsável, em 5 PRs** (decisão 0027): PR 1 núcleo (PR 129, migração 0021: lotes, em uso/guardado com passagem automática, movimentos imutáveis, custo médio, chave contra repetição, `consumirNaTransacao` para a E11) e PR 2 compras (PR 130, migração 0022: nota, foto da nota, correção de custo pela média, lista de entradas, saldo inicial por planilha com correção no painel) **juntados na main**; PR 3 produção de preparo com rendimento real e desfazer (`estoque.desfazer`, PR 131) e PR 4 contagem cega/rápida/inventário (PR 132, migração 0023; cega também no painel e nas mensagens para quem não é da gestão) **juntados na main** (revisor aprovou na 3ª rodada); PR 5 telas, 23 rotas e relatórios (PR 137, merge 9abe633: painéis /estoque e /estoque/salao com "Dar entrada", mudar de lugar entre áreas com "quem recebeu", contagens, compras, /estoque/custos com perdas, diferenças pelo valor lançado no fechamento e valor por área, CSV). Hipóteses confirmadas em 25/11/2026 (custo médio; gestão vê quantidades na contagem; **quem recebe confirma**). **Recebimento feito (PR 146, merge ae8b9c8; migração 0024; decisão 0027):** transferência entre áreas vai para "a receber" no destino; a pessoa indicada ou a supervisão do destino confirma (em uso/guardado) ou recusa (volta à origem); quem mandou nunca confirma nem recusa; contagem do item bloqueada nas duas áreas enquanto pendente; envio, confirmação ou recusa lançados depois de contar pedem recontagem. Revisor aprovou na 4ª rodada. **E10 reposição em andamento (ok do responsável em 25/11/2026):** parte 1 só regras (PR 158, branch feat/e10-reposicao-regras; migração 0025, decisão 0029: linhas saudável/emergência/abastecimento por item e área, estado e um aviso por cruzamento avaliados em `Lancamento.fechar()`, `itensParaRepor` para a lista de compras, `sugerirLinhas`); **juntado na main (merge 04b5eaa)**, revisor aprovou na 2ª rodada; worker reavalia de hora em hora (pg-boss, minuto 1, fuso da loja) para lote vencido sem movimento. Pendências da parte 2: ingrediente nunca comprado fica calado ao definir a linha (hipótese adotada, evita 168 avisos "esgotado" na primeira carga); `dia` fixo antes dos blocos na reavaliação perto da meia-noite; `areaJaUsada` sem índice. Parte 2: telas no visual Balcão (skill `tela-da-gestao`, decisão 0028; não mexer na tela de Estoque enquanto o outro chat a converte), agrupar avisos, silêncio, subir ao gestor. Depois, PR próprio com D1, D7 e D4a da ideia nº 15 (agenda). **Homologação não tem os logins fictícios** (gerente.geral etc. só existem na semente local): para testar, o responsável usa o próprio login e cria funcionários de teste. Testes instáveis corrigidos: sufixo aleatório repetia entre arquivos (trocava dígito por x); 23505 desconhecido não vira mais "nome repetido". Lição: worktree com atalho de node_modules entra no commit (o .gitignore agora ignora `node_modules` sem barra); testes de sessões em paralelo usam bancos próprios (`erp_meu_teste` etc.). **Ideia nº 12 registrada (19/11/2026):** app do cliente e Clube de benefícios (desconto pelo app, cadastro no primeiro QR, saída da mesa ao pagar), requisito `docs/requisitos/RC-21-app-do-cliente-e-clube.md`. **Ideia nº 11 registrada (18/11/2026):** comanda compartilhada pelo QR da mesa, requisito `docs/requisitos/RC-20-comanda-compartilhada-pela-mesa.md`; entra na E13, dados já na E11 (roteiro). **Marca E-MOTION aplicada a todo o sistema** (PR 79, merge abbb7aa, na homologação; decisão 0019; `cerebro/empresa/identidade-visual.md`). Conector do Google Drive ligado em 15/11/2026.
- **Site emotionjf.com.br (18/11/2026): RC-07 v2 proposto, aguardando "ok".** Domínio a comprar; cardápio sem preço; para empresas: coffee break, almoço corporativo, eventos no espaço (portfólio + orçamento que vira oportunidade na gestão); botão iFood e WhatsApp até o delivery próprio (`pedir.`); começa depois da E07, em 7 PRs (E25.1 a E25.7); 13 sugestões S1 a S13 no RC-07. Skill nova `pagina-publica`. Ampliado (ideia nº 9): Quem somos (missão, visão, valores, história), equipe toda no site ligada ao cadastro com autorização de imagem, e CMS completo; E25 agora em 7 PRs. Confirmado: editam o site dono, administrador e gerente geral; publicam só dono e administrador. **Sugestões S1 a S13 todas aprovadas (18/11/2026)**, cada uma com gatilho em `cerebro/agenda-de-sugestoes.md` (o hook de início mostra as pendentes; 📌 no roteiro).
- **Regra real da casa (18/11/2026): funcionário tem 15% de desconto nos produtos da loja.** Entra na E17 (RC-13 seção 3a, ideia nº 10): vale também no delivery próprio (sobre o total com frete, 📌 E26) e na sorveteria; não acumula: vale sempre o maior desconto; pago na hora ou na conta do funcionário (📌 E21; limite e fechamento: o responsável vai confirmar).
- **Fato novo (18/11/2026): todo o caixa da E-MOTION usa hoje o Mollsales**, obrigatório para os sorvetes pela 60 Sabores. Afeta RC-11, RC-13 e o plano de virada: **tratar em sessão própria** (pergunta à franqueadora no para-você-fazer).
- **Frentes paralelas** (15/11/2026): outro chat, com o modelo que o responsável escolher, pode cuidar
  de uma função só e falar com este pelo `cerebro/frentes/mural.md` (regras em `cerebro/frentes/README.md`).
  Aberta: **lista-de-compras** (Central de Compras, proposta aprovada; começa a LC1 depois da E07;
  migrações 0100+; RC-19 reservado para ela) e **fichas-tecnicas** (lê as fichas do Drive, sem código;
  lista de ingredientes em `cerebro/empresa/fichas-tecnicas/ingredientes.md`, 11 unidades divergentes do catálogo).
- SSH do servidor só por chave desde 15/11/2026 (PR #18), conferido pelo responsável.
- Travas: reforçadas (decisão 0009). Proteção de branch do GitHub não vale no plano
  gratuito; a trava do repositório é a única barreira automática.
- Contexto: aviso a cada 10% (de 1 milhão); no aviso, atualizar o cérebro em silêncio e pedir `/compact` só junto da próxima mensagem útil.
- **Regra do responsável (17/11/2026): menos interrupção.** Mensagem só com entrega pronta ou decisão dele, completa, sem picotar; sem avisos de andamento; sem "nada desta vez" (CLAUDE.md regra 2).
- GitHub: Caminho A (14/11/2026): plano gratuito, sem proteção de branch; a trava do
  repositório é a barreira. Rever antes da E23.
- **Modelos: tudo no Opus 5.5** (decisão do responsável, 15/11/2026): sessão e todos os subagentes; outro modelo só se ele pedir (`docs/05-uso-dos-modelos.md`).
- Aguardando: respostas do dono da empresa ao questionário em PDF (previstas para 14/11/2026).
- No ar (produção): **nada**. Homologação: **no ar** em `https://gestao.187-53-114-38.sslip.io` (dados de teste).
- Infraestrutura: VPS de homologação contratada na Hostinger em 14/11/2026 (KVM 2, IP
  187.53.114.38, Ubuntu 26.04 LTS), configurada na E06 (comandos no servidor: `erp situacao`,
  `erp registros`, `erp atualizar`).
  Produção e domínio: não contratados. Integrações validadas: nenhuma.
- **Diretriz do responsável (14/11/2026): a passagem para o sistema oficial tem que ser segura e
  tranquila.** Já previsto: ensaio na loja em paralelo ao sistema atual (Portão 1), nada no ar sem
  "Publique tudo", ensaio de backup e restauração. Falta: um plano de virada próprio (data, quem faz
  o quê, como voltar atrás, cadastros e saldos iniciais conferidos) antes da E23. Tratar em sessão própria.
- Identidade visual: será enviada depois; usar tema neutro configurável até lá.

## O que será construído (resumo)
1. Gestão interna com aplicativos por função (caixa, atendimento, cozinha, estoque, gestor).
2. Site institucional com páginas de produtos e área de contato para empresas.
3. Delivery próprio pelo site e por aplicativo instalável, do pagamento à cozinha.
Tudo sobre um núcleo único. Detalhes em `docs/01-visao-e-escopo.md`.

## O que ler conforme o assunto
| Assunto da sessão | Ler |
|---|---|
| Primeira sessão (T01) | Tudo em `docs/` e `cerebro/` |
| Pedidos, estoque | `docs/requisitos/RC-01-...`, `RC-09-...`, `modulos.md`, `docs/02-arquitetura.md` |
| Telas de produção, estimativa de tempo, avisos | `docs/requisitos/RC-10-...`, `RC-01-...`, `RC-04-...`, `docs/decisoes/0007-...` |
| Sorveteria 60 Sabores | `docs/requisitos/RC-11-...` |
| Cargos, permissões, login | `docs/requisitos/RC-12-...`, `docs/decisoes/0008-...` |
| Caixa | `docs/requisitos/RC-13-...`, `RC-17-...` |
| Entregas e motoboy | `docs/requisitos/RC-14-...`, `RC-08-...` |
| Financeiro, contabilidade, calculadoras | `docs/requisitos/RC-15-...`, `RC-16-...` |
| Histórico, busca, comunicação | `docs/requisitos/RC-17-...`, `RC-18-...` |
| Delivery, app do cliente | `docs/requisitos/RC-08-...`, `RC-01-...`, `fluxos-criticos.md` |
| Site institucional | `docs/requisitos/RC-07-...`, `cerebro/empresa/identidade-visual.md` |
| Fiscal, pagamento, financeiro | `docs/requisitos/RC-06-...`, `fluxos-criticos.md` |
| Telas e aplicativos internos | `docs/requisitos/RC-03-...`, `qualidade-operacional.md` |
| TVs e mídia | `docs/requisitos/RC-02-...` |
| Equipamentos e rede | `docs/requisitos/RC-04-...` |
| Servidor, publicação, backup | `docs/02-arquitetura.md`, `docs/decisoes/0004-...`, `cerebro/automacoes.md` |
| Ideias do cliente | `cerebro/ideias-do-cliente.md`, `docs/01-visao-e-escopo.md` |

## Histórico de sessões
| Data | Assunto | Resultado | Diário |
|---|---|---|---|
| 26/11/2026 | Apresentação aos sócios (HTML animado com a marca) | 18 slides: escopo, pronto, roteiro, prazo em 2 cenários (19 e 29 semanas), auditoria de valor de mercado e simulador; arquivo entregue fora do repositório (repositório público e assunto comercial) | — |
| 18/11/2026 | Site emotionjf.com.br (planejamento) | RC-07 v2, ideias 8 a 10 (site, equipe, CMS, desconto de funcionário), sugestões S1 a S13 aprovadas com agenda, skill `pagina-publica`; sem código | `diario/2026-11-18-site-emotionjf.md` |
| 17/11/2026 | E07 parte 2, PR 1: categorias e horários | PRs 51 e 52 juntados (horários, categorias, asterisco nos itens a confirmar) | `diario/2026-11-17-e07-parte2-horarios.md` |
| 15/11/2026 | E07: cadastros (parte 1) | Ingredientes, fornecedores, conversões; PR 26 juntado; revisão aprovou na 3ª rodada | `diario/2026-11-15-e07-cadastros.md` |
| 15/11/2026 | Mod "Salão" do Claude (ferramenta, fora do ERP) | Construído e **cancelado pelo responsável no mesmo dia**; tudo removido do repositório | `diario/2026-11-15-mod-salao.md` |
| 13/11/2026 | Preparação do projeto (F0) | Instruções, requisitos, cérebro, skills e travas criados | `diario/2026-11-13-preparacao-do-projeto.md` |
| 14/11/2026 | T01 parte 1 (E01): conferência e teste das travas | Estrutura juntada na `main` (PR #1); trava de `producao` bloqueou; 2 brechas e 3 propostas | `diario/2026-11-14-t01-conferencia.md` |
| 14/11/2026 | E06: homologação | Servidor por script, publicação automática, papéis do banco; revisão aprovou com ressalvas (corrigidas) | `diario/2026-11-14-e06-homologacao.md` |
| 14/11/2026 | E05: avisos | PR #12 juntado; avisos por cargo e turno, comunicados com leitura; 154 testes + 63 de tela | `diario/2026-11-14-e05-avisos.md` |
| 14/11/2026 | E04: base visual e cascas | Lançador e 7 aplicativos por cargo; 128 testes + 56 de tela | `diario/2026-11-14-e04-cascas.md` |
| 14/11/2026 | E03: cargos, login e auditoria | PR #5 juntado; 99 testes + 24 de tela; revisão reprovou 1x (corrigido) e aprovou | `diario/2026-11-14-e03-acessos.md` |
| 14/11/2026 | E02: fundação técnica | Monorepositório, banco, login/permissões, CI; revisão independente achou 1 defeito grave (corrigido) | `diario/2026-11-14-e02-fundacao.md` |
