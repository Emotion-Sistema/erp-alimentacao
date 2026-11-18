# Estado atual do projeto

Atualizado em: 18/11/2026

## Em que pé estamos
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
  responsável e no ar na homologação às 15:15 UTC: dados com rótulo, selos, fundo sempre claro). **Ideia nº 5 feita** (PR 41; embalagens num bloco só, aprovado, PR seguinte, merge 58f00a2, no ar na homologação; migração 0008, adendo na decisão 0015): lista pronta de unidades (kg, g, L, ml, un, dz); conta por dentro segue em g/ml/un. **Ideia nº 6 feita** (PR 46, merge eac6ff2, no ar na homologação; migração 0009, decisão 0015 item 10): aba Embalagens (catálogo por tipo, padrão por fornecedor) e bloco recolhido no ingrediente; telas em `apps/gestao/app/cadastros/embalagens/` com LEIA-ME. **Aba Ingredientes** com a lista primeiro e janela "Adicionar ingrediente" (Rápido/Comum) (PR 48, merge 77986a6, no ar na homologação em 17/11/2026). **Parte 2 em andamento (17/11/2026):** PR 1 de categorias e horários de venda feito (PR 51, merge 1ce59cb; migração 0010, decisão 0016; telas `/cadastros/horarios` e `/cadastros/categorias`). Os 11 itens de unidade a confirmar estão com asterisco (PR 52; resposta do responsável em 22/11, lembrete agendado). Diário `diario/2026-11-17-e07-parte2-horarios.md`. Janela deslocada corrigida (PR 54, merge edb9e7d). **PR 2 tipos de produção feito** (PR 57, merge d9fdea1; migração 0011, decisão 0017; tela `/cadastros/tipos-producao`). Posição na lista no lugar do número de ordem (PR 61, merge 92d157d; adendo 18/11 da decisão 0012: campo que depende do que já existe mostra a lista). **PR 3 produtos feito** (PR 76, merge adfa12d, na homologação; migração 0012, decisão 0018; tela `/cadastros/produtos`). **Ideia nº 11 registrada (18/11/2026):** comanda compartilhada pelo QR da mesa, requisito `docs/requisitos/RC-20-comanda-compartilhada-pela-mesa.md`; entra na E13, dados já na E11 (roteiro). **Marca E-MOTION aplicada a todo o sistema** (PR 79, merge abbb7aa, na homologação; decisão 0019; `cerebro/empresa/identidade-visual.md`). Conector do Google Drive ligado em 15/11/2026.
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
