# 2026-11-17: E07 parte 2, PR 1: categorias e horários de venda

- Assunto da sessão: E07, cadastros (parte 2)
- Branch / PR: PR 51 (merge 1ce59cb, servidor + telas) e PR 52 (merge 711eb56, asterisco nos itens a confirmar)

## O que foi pedido
"ok" do responsável para começar a parte 2 da E07. Ela vai em 3 PRs: (1) horários; (2) tipos de
produção; (3) produtos.

## O que foi feito
- **Migração 0010:**
  - `categoria`, com 6 iniciais: Cafeteria, Almoço, Porções, Hambúrgueres, Salgados, Bebidas.
  - `horario_unidade`: a semana do responsável, também por gatilho em toda unidade nova.
  - `horario_venda`: canal ou categoria por dia, com segue, fechado ou aberto.
  - Datas especiais: `horario_unidade_data` e `horario_venda_data`.
  - `pausa_venda`.
  - A função `situacao_de_venda`, regra única de "pode vender agora", com o motivo e a hora em que abre.
- **Servidor:**
  - Domínio em `packages/dominio/src/horarios.ts`; textos e partes sem banco em `horarios-comum.ts` (`@erp/dominio/horarios`).
  - 10 rotas (`/api/horarios/**` e `/api/cadastros/categorias`), todas na matriz da API.
- **Testes:** 39 verdes (horários e matriz).
- **Decisão 0016.**
- **Revisor:** aprovou com ressalvas. As 3 foram corrigidas (commit 2dbba06):
  - canal nulo liberava a venda;
  - a tela prometia a hora de abrir mesmo com pausa marcada;
  - editar a categoria apagava a descrição.

  As sugestões também entraram: auditoria do cancelamento completa, mais testes e 3 hipóteses novas na 0016.
- **Telas:** com o `construtor` (Opus, worktree), branch `feat/horarios-telas`:
  - `/cadastros/horarios`: Agora, Semana da loja, Canais, Datas especiais, Pausas;
  - `/cadastros/categorias`, com o horário de cada categoria;
  - entrada no menu.

## O que foi decidido (e por quê)
Ver a decisão 0016: três camadas com interseção, semana como padrão, data especial, pausa e a
regra só no banco. Hipóteses abertas: uma janela por dia; sem passar da meia-noite; às 23h em
ponto já não aceita pedido; categoria vale para a empresa toda.

## Depois (mesmo dia)
- As telas do construtor foram juntadas à branch do servidor. Passaram `pnpm teste` (346) e `teste:tela` (139). O PR 51 teve CI verde e foi juntado.
- O responsável confirmou: **às 23h em ponto o sistema já não aceita pedido** (decisão 0016).
- As perguntas 1 e 2 das fichas só terão resposta em **22/11**. Há um lembrete agendado nesta sessão para 22/11 às 9h (horário de Brasília).
- A pedido dele, os 11 itens de unidade a confirmar ganharam **asterisco** (PR 52):
  - no cadastro rápido, não podem ser marcados;
  - no cadastro comum e na lista colada, aparece um aviso.

  A lista fica num lugar só, `NOMES_A_CONFIRMAR` em `catalogo-ingredientes.ts`. Com a resposta, corrigir as unidades e esvaziar a lista.
- Aprendizado: `pnpm tipos` não confere o app Next (`apps/gestao`). Erro de tipo das telas só aparece no `next build`, que roda no teste de tela e no CI.

## Mais tarde (mesmo dia)
- O responsável viu que a janela "Pausar agora" abria deslocada no canto. A causa era a regra `.hor-tela > * { margin: 0 }`, que também tirava a margem automática do `<dialog>`. A correção foi trocar para `> :not(dialog)` (PR 54, merge edb9e7d). O teste novo `janelaNoCentro` (em `testes-tela/ajudas.ts`) confere as janelas.
- O responsável conferiu na homologação todos os testes anteriores, e tudo deu certo.
- **PR 2 (tipos de produção) em andamento** na branch `feat/tipos-de-producao`:
  - feito: migração 0011 (`tipo_producao`: nome, área cozinha/cafeteria, capacidade 1 a 50, ordem, ativo), regra em `packages/dominio/src/tipos-producao.ts`, rotas `/api/cadastros/tipos-producao`, decisão 0017 e 6 testes;
  - tela `/cadastros/tipos-producao` feita pelo construtor;
  - revisor aprovou com ressalvas, todas corrigidas: desativar manda só `{ id, ativo }` (não desfaz mudança de outra pessoa); nomes próprios `AREAS_DE_PRODUCAO`, `NOME_DA_AREA_DE_PRODUCAO` etc.;
  - **PR 57 juntado (merge d9fdea1).**
- Falha ocasional em `gerente.spec` achada e corrigida: o anunciador de página do Next também é `role="alert"`. Use `avisoNaTela(page)` (em `testes-tela/ajudas.ts`), nunca `page.getByRole("alert")` solto.
- **Regra nova do responsável:** menos interrupção. Mensagem só com entrega pronta ou decisão dele (CLAUDE.md regra 2; PR 56).
- Hipóteses da 0017: cada tipo começa com capacidade 1; porções, salgados e almoço ficam em "Pratos e grelhados" até haver tipo próprio.

## 18/11/2026: posição na lista
- O responsável não entendeu o campo "Ordem na lista" (10, 20, 30). Pediu também que **todo campo que depende do que já existe mostre a lista para comparar**.
- Feito no PR 61 (merge 92d157d):
  - nas janelas de Categorias e Tipos de produção, "Posição na lista" ("1º: no começo", "2º: depois de X") com a prévia de como fica;
  - o servidor renumera de 10 em 10 (`packages/dominio/src/posicao.ts`), com trava única por tabela.
- O revisor reprovou a 1ª versão (deadlock entre duas pessoas mudando a posição). Corrigido com `pg_advisory_xact_lock`, o primeiro comando de toda gravação. O teste com 8 rodadas de 4 gravações falha sem a trava e passa com ela. Aprovado na 2ª revisão.
- Regra registrada no adendo de 18/11 da decisão 0012. Usar `PosicaoNaLista` em Produtos.

## 18/11/2026: produtos (PR 3)
- PR 76 juntado (merge adfa12d), no ar na homologação: migração 0012 (`produto`), decisão 0018, tela `/cadastros/produtos`.
- Preço em centavos (R$ 0,01 a R$ 9.999,99; `centavosDoTexto` lê "12,50" sem float); tipo de produção opcional (sem tipo = não passa pela produção) e tempo de preparo junto do tipo (o banco segura); posição dentro da categoria.
- Revisor: APROVADO; ressalvas corrigidas (id grande, caractere de controle, testes de reativar e da corrida com categoria sendo desativada).
- Teste de horários quebrava depois das 23h30 (pausa passa da meia-noite): corrigido para esperar a data de amanhã nesse caso.
- Hipóteses da 0018: um preço para todos os canais; foto, alergênicos, tamanhos, adicionais e combos num PR depois; preço mínimo R$ 0,01.

## 18/11/2026: marca E-MOTION no sistema (feita: PR 79, merge abbb7aa, na homologação)
- O responsável aprovou paleta, letras e logo (frente paleta-da-marca) e pediu para aplicar a todo o ERP, "perfeito".
- Branch `feat/identidade-visual` (worktree no scratchpad), decisão 0019: tema.css com a paleta, `publico.css` (letras do cliente e modo escuro só em loja/site), letras via @fontsource, casca da gestão com faixa café e logo, entrada com logo, ícones da marca (`scripts/gerar-marca.py`). Construtor faz o acabamento das telas internas.

## 18/11/2026: ajustes vistos no celular do responsável (PR 82, merge 0872ab4)
- O navegador do celular escurecia a gestão sozinho: agora `color-scheme: only light` e a meta `color-scheme` (gestão sempre clara).
- Menu que rola de lado mostra que rola: bordas esmaecidas, setas e a aba aberta centrada.
- Botão **Tela cheia** no topo da gestão e na estação da cozinha (some onde o aparelho não deixa, ex.: iPhone no navegador).
- Próxima etapa proposta: E07 parte 3 (importação de planilha .xlsx, .csv e .html com relatório de erros por linha).

## 18/11/2026: gestão repaginada no celular (PR 86, merge e6f4cf6)
- Pedido: "layout do celular cru e de acesso chato"; computador fica como está.
- Até 640 px: topo de 64 px (símbolo, aplicativo, quem usa; sino e botão redondo da conta); gaveta da conta que sobe de baixo (trocar cargo, tela cheia, minha conta, sair); menu preso no alto; lançador em linhas compactas.
- Testes de celular que tocam em Sair/Trocar de cargo usam `abrirConta(page)` (ajudas.ts).

## 18/11/2026: navegação do celular em protótipo; tela cheia
- O responsável não gostou da faixa de menu que rola de lado. Protótipos com 4 alternativas (barra de baixo; ação principal no polegar; painel de atalhos; seletor no título) no artifact https://claude.ai/artifact/PwVVpmbMVxpXXesgEfe2E1. Aguardando a escolha dele.
- Tela cheia saía ao abrir um aplicativo pelo lançador (link comum recarregava a página): corrigido no PR 90 (Link do Next; trocar de cargo sem recarregar).
- CI da main falhou uma vez (produtos.spec lia a lista antes de carregar): corrigido no PR 94 (`expect.poll`).

## 18/11/2026: navegação do celular escolhida e feita (PR 97, merge 13789f7)
- Escolha do responsável: B (botão Novo pedido no meio) no Atendimento, A (barra de baixo + Mais) nos outros. Adendo na decisão 0019.
- Testes de celular leem o menu com `nomesDoMenu(page)` (barra + Mais; nome inteiro no aria-label).

## O que ficou pendente
- Conferir com o responsável o visual novo na homologação (inclusive num Android real: letras).
- Telas com mais de um botão cheio (Horários, Funcionários, Turnos, Estações): rever a regra "um botão forte por tela" se o responsável quiser.
- Foto, alergênicos, tamanhos, adicionais e combos dos produtos (PR próprio).
- As 11 unidades divergentes do catálogo esperam as perguntas 1 e 2 das fichas (`cerebro/empresa/fichas-tecnicas/perguntas.md`).

## O que deu errado ou surpreendeu
- A semana inserida só na migração não pegava unidade criada depois, pela semente ou pelo primeiro acesso. Virou gatilho.

## 👉 Ficou para o responsável
Responder às perguntas 1 e 2 das fichas e confirmar as hipóteses da 0016.

## Skills usadas / skill que valeria criar
`migracao-segura`, `matriz-de-permissoes`, `encerrar-sessao`.
