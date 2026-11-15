# Estado atual do projeto

Atualizado em: 14/11/2026

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
  cadastro rápido; no ar na homologação). **Reforma visual no PR 37** (dados com rótulo,
  selos, fundo sempre claro), aguardando o "aprovado" do responsável pelas capturas. Depois: parte 2 (categorias,
  tipos de pedido, produtos). Conector do Google Drive ligado em 15/11/2026.
- **Frentes paralelas** (15/11/2026): outro chat, com o modelo que o responsável escolher, pode cuidar
  de uma função só e falar com este pelo `cerebro/frentes/mural.md` (regras em `cerebro/frentes/README.md`).
  Aberta: **lista-de-compras** (Central de Compras, proposta aprovada; começa a LC1 depois da E07;
  migrações 0100+; RC-19 reservado para ela).
- SSH do servidor só por chave desde 15/11/2026 (PR #18), conferido pelo responsável.
- Travas: reforçadas (decisão 0009). Proteção de branch do GitHub não vale no plano
  gratuito; a trava do repositório é a única barreira automática.
- Contexto: aviso a cada 10% (de 1 milhão); no aviso, atualizar o cérebro e pedir `/compact`.
- GitHub: Caminho A (14/11/2026): plano gratuito, sem proteção de branch; a trava do
  repositório é a barreira. Rever antes da E23.
- Modelos: base Opus 5.5; Sonnet e Haiku por subagentes (`docs/05-uso-dos-modelos.md`).
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
| 15/11/2026 | E07: cadastros (parte 1) | Ingredientes, fornecedores, conversões; PR 26 juntado; revisão aprovou na 3ª rodada | `diario/2026-11-15-e07-cadastros.md` |
| 15/11/2026 | Mod "Salão" do Claude (ferramenta, fora do ERP) | Construído e **cancelado pelo responsável no mesmo dia**; tudo removido do repositório | `diario/2026-11-15-mod-salao.md` |
| 13/11/2026 | Preparação do projeto (F0) | Instruções, requisitos, cérebro, skills e travas criados | `diario/2026-11-13-preparacao-do-projeto.md` |
| 14/11/2026 | T01 parte 1 (E01): conferência e teste das travas | Estrutura juntada na `main` (PR #1); trava de `producao` bloqueou; 2 brechas e 3 propostas | `diario/2026-11-14-t01-conferencia.md` |
| 14/11/2026 | E06: homologação | Servidor por script, publicação automática, papéis do banco; revisão aprovou com ressalvas (corrigidas) | `diario/2026-11-14-e06-homologacao.md` |
| 14/11/2026 | E05: avisos | PR #12 juntado; avisos por cargo e turno, comunicados com leitura; 154 testes + 63 de tela | `diario/2026-11-14-e05-avisos.md` |
| 14/11/2026 | E04: base visual e cascas | Lançador e 7 aplicativos por cargo; 128 testes + 56 de tela | `diario/2026-11-14-e04-cascas.md` |
| 14/11/2026 | E03: cargos, login e auditoria | PR #5 juntado; 99 testes + 24 de tela; revisão reprovou 1x (corrigido) e aprovou | `diario/2026-11-14-e03-acessos.md` |
| 14/11/2026 | E02: fundação técnica | Monorepositório, banco, login/permissões, CI; revisão independente achou 1 defeito grave (corrigido) | `diario/2026-11-14-e02-fundacao.md` |
