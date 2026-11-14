# 👉 Para você fazer

Lista viva do que depende do responsável. O Claude acrescenta e marca como feito.

## Agora (para começar)
- [x] 👉 Conferir o PR #4 e dar o "ok" para a E03 (feito em 14/11/2026).
- [x] 👉 Dar o "ok" para a E04 (dado em 14/11/2026).
- [x] 👉 Dar o "ok" para a E05 (dado em 14/11/2026).
- [x] 👉 Hipóteses da decisão 0013 (respondidas em 14/11/2026: dois turnos, 08h-15h30 e 15h30-23h30; ninguém de madrugada; só a gerência manda comunicados).
- [x] 👉 Margem de troca de 30 min confirmada (14/11/2026); gerentes podem mudar na tela Turnos.
- [x] 👉 Dar o "ok" para a E06 (dado em 14/11/2026).
- [x] 👉 Responder às 6 hipóteses de cargos da decisão 0011 (respondido em 14/11/2026).
- [x] 👉 Dizer a que horas a cozinha fecha (23h; loja 23h30; respondido em 14/11/2026).
- [x] 👉 Horários: segunda fechado; delivery e categorias inseridos à mão (respondido em 14/11/2026).
- [ ] 👉 Em claude.ai/code, conectar o GitHub e instalar o app do Claude neste repositório.

## Assim que possível (destrava o trabalho)
- [ ] 👉 Enviar logo, cores e identidade visual da empresa (pode ser pelo Drive).
- [ ] 👉 Responder às perguntas de `docs/04-pendencias.md` com o cliente (comece pelas de número 1, 5, 13 e 14).
- [ ] 👉 Enviar cardápio, 1 a 3 fichas técnicas de exemplo, ingredientes e unidades.
- [ ] 👉 Dizer qual domínio será usado (ou se precisa registrar um).
- [ ] 👉 Levantar com o cliente: quem cuida do estoque em cada turno, quem cuida das compras, prazo de entrega dos fornecedores e os itens que não podem faltar (pendências 20, 21, 23 e 31).
- [ ] 👉 Pedir ao cliente a lista de produtos com tempo de preparo e tipo (hambúrguer, prato/grelhado, cafeteria), e quantas pessoas trabalham em cada tipo por turno (pendências 29 e 35).
- [ ] 👉 Perguntar à franqueadora 60 Sabores: nome exato do sistema, se exporta relatórios ou tem API, e se o contrato permite integração (pendências 32 a 34).
- [ ] 👉 Levar o questionário em PDF ("Perguntas para o dono") ao dono da empresa e trazer as respostas.
- [ ] 👉 Abrir as sessões do Claude Code sempre em Opus 5.5.
- [ ] 👉 Pedir à contabilidade a lista do que ela precisa receber todo mês e em que formato.

## Antes de pagamento e fiscal (etapas E19 e E20)
- [ ] 👉 Escolher com o cliente o provedor de pagamento (Pix e cartão online) e abrir conta de testes.
- [ ] 👉 Escolher com o contador o provedor fiscal e abrir conta de testes.

## Agora (E06)
- [ ] 👉 Preparar o servidor de testes: colar a linha no terminal da Hostinger, cadastrar a deploy key no GitHub e criar seu login (passo a passo em `infra/homologacao/LEIA-ME.md`; o Claude avisa quando colar).
- [ ] 👉 Entrar em `https://gestao.187-53-114-38.sslip.io` com seu login e configurar o autenticador (critério de aceite da E06).

## Antes de mostrar ao cliente (homologação)
- [ ] 👉 Confirmar com o dono o domínio antes de usar o "domínio grátis" da Hostinger (pergunta 56 do questionário).
- [ ] 👉 Gerar o token da API da Hostinger e guardá-lo como segredo (o Claude dirá onde colar; nunca no chat).
- [ ] 👉 Autorizar o conector da Hostinger quando a sessão pedir.

## Antes de ir para o ar
- [ ] 👉 Decidir se o repositório passa para um plano pago do GitHub (Team) para a proteção de `main` e `producao` valer; no plano gratuito ela não é aplicada em repositório privado (decisão 0009).
- [ ] 👉 Criar a branch `producao` protegida (o Claude orienta) e os segredos de produção no GitHub.
- [ ] 👉 Testar na homologação o roteiro que o Claude entregar.
- [ ] 👉 Enviar a mensagem: **Publique tudo**

## Feito
- [x] Escolher o Caminho A para a proteção de branch (14/11/2026)
- [x] Dar o "ok" para a E02 (14/11/2026)
- [x] Responder às perguntas da conferência da T01 (14/11/2026)
- [x] Abrir a primeira sessão e pedir a tarefa T01 (14/11/2026)
- [x] Criar repositório privado no GitHub (13/11/2026)
- [x] Criar pasta do projeto no Drive (13/11/2026)
- [x] Contratar a VPS de homologação na Hostinger (14/11/2026)
