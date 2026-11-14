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
- **E04 (base visual e cascas) feita** no PR #11 (merge 858ad9f; decisão 0012).
- **E05 (avisos) feita** no PR #12 (merge 5a3ceac; decisão 0013): avisos por cargo ativo, unidade e
  turno, comunicados com confirmação de leitura, sino em todo app.
- **Ajuste da E05: turnos da equipe** (migração 0005): Turno 1 08h-15h30, Turno 2 15h30-23h30;
  cada um tem o próprio login e é do turno em que entrou (15h10 = Turno 1); margem de troca de
  30 min que os gerentes mudam na tela Gestão → Turnos (ação `horarios.gerenciar`); botão
  "Continuo no turno" com senha. 169 testes + 64 de tela; revisão aprovou na 4ª rodada.
  154 testes + 63 de tela; revisão reprovou 1x (corrigido) e aprovou.
- **E06 (homologação) pronta no código** (decisão 0014): o servidor puxa a branch `homologacao`
  (avançada pelo GitHub quando o CI da main passa), monta, migra, confere e volta sozinho se
  falhar; HTTPS em `gestao.187-53-114-38.sslip.io`; papéis separados do banco (app não apaga);
  primeiro acesso do dono pelo terminal. Falta o responsável colar a linha no terminal da
  Hostinger (`infra/homologacao/LEIA-ME.md`) e entrar: é o critério de aceite da E06.
- Próxima etapa depois do aceite: **E07** (cadastros).
- Travas: reforçadas (decisão 0009). Proteção de branch do GitHub não vale no plano
  gratuito; a trava do repositório é a única barreira automática.
- Contexto: aviso a cada 10% (de 1 milhão); no aviso, atualizar o cérebro e pedir `/compact`.
- GitHub: Caminho A (14/11/2026): plano gratuito, sem proteção de branch; a trava do
  repositório é a barreira. Rever antes da E23.
- Modelos: base Opus 5.5; Sonnet e Haiku por subagentes (`docs/05-uso-dos-modelos.md`).
- Aguardando: respostas do dono da empresa ao questionário em PDF (previstas para 14/11/2026).
- No ar (produção): **nada**. Homologação: **sendo preparada** (E06; servidor ainda sem configurar).
- Infraestrutura: VPS de homologação contratada na Hostinger em 14/11/2026 (KVM 2, IP
  187.53.114.38, Ubuntu 26.04 LTS), ainda sem configuração; será preparada na etapa E06.
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
| 13/11/2026 | Preparação do projeto (F0) | Instruções, requisitos, cérebro, skills e travas criados | `diario/2026-11-13-preparacao-do-projeto.md` |
| 14/11/2026 | T01 parte 1 (E01): conferência e teste das travas | Estrutura juntada na `main` (PR #1); trava de `producao` bloqueou; 2 brechas e 3 propostas | `diario/2026-11-14-t01-conferencia.md` |
| 14/11/2026 | E06: homologação | Servidor por script, publicação automática, papéis do banco; revisão aprovou com ressalvas (corrigidas) | `diario/2026-11-14-e06-homologacao.md` |
| 14/11/2026 | E05: avisos | PR #12 juntado; avisos por cargo e turno, comunicados com leitura; 154 testes + 63 de tela | `diario/2026-11-14-e05-avisos.md` |
| 14/11/2026 | E04: base visual e cascas | Lançador e 7 aplicativos por cargo; 128 testes + 56 de tela | `diario/2026-11-14-e04-cascas.md` |
| 14/11/2026 | E03: cargos, login e auditoria | PR #5 juntado; 99 testes + 24 de tela; revisão reprovou 1x (corrigido) e aprovou | `diario/2026-11-14-e03-acessos.md` |
| 14/11/2026 | E02: fundação técnica | Monorepositório, banco, login/permissões, CI; revisão independente achou 1 defeito grave (corrigido) | `diario/2026-11-14-e02-fundacao.md` |
