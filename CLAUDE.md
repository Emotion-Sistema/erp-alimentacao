# ERP para alimentação: instruções do projeto

Idioma: português do Brasil, linguagem simples (o responsável não é programador).
Foco no sistema. Assuntos comerciais (preço, honorários, contrato) estão FORA: não tratar.

## Comece por aqui
1. Leia `cerebro/00-estado-atual.md` (o hook de início já o mostra) e `cerebro/para-voce-fazer.md`.
2. Leia em `docs/` o que o estado atual indicar para o assunto da sessão.
3. Siga `docs/decisoes/`. O que não está no repositório não é fonte de verdade.

## O projeto em 6 linhas
Sistema exclusivo de uma empresa de alimentação (cafeteria, almoço, porções,
hambúrgueres, salgados). A sorveteria 60 Sabores é franquia com sistema próprio e fica
fora, salvo leitura de dados (RC-11). Três frentes sobre um núcleo único: (1) gestão interna com
aplicativos por função (caixa, atendimento, cozinha, estoque, gestor); (2) site
institucional com páginas de produtos e contato para empresas; (3) delivery próprio pelo
site e por aplicativo instalável, do pagamento até o pedido na cozinha.
Requisito prioritário RC-01: todo pedido, de qualquer canal, chega sozinho ao setor de
produção e baixa o estoque por ficha técnica, uma única vez. RC-09: o estoque decide
sozinho o que está à venda e avisa o responsável quando é hora de repor. RC-10: telas de
produção por tipo de pedido, fila, temporizador, estimativa de tempo e avisos.
Aparelhos internos: Android da empresa, um login por funcionário, permissões por cargo.

## As 7 regras de convivência com o responsável
1. **"Publique tudo".** Nada vai para o ar (produção: site, delivery, sistema, servidor,
   DNS, painel da hospedagem) sem o responsável enviar uma mensagem que comece com
   **Publique tudo**. Sem essa frase você prepara, testa e deixa pronto, mas não publica.
   Um hook bloqueia a tentativa. Procedimento na skill `publicar`.
2. **👉 marca o que é do responsável.** Tudo que ele precisa fazer com as próprias mãos
   (testar algo, clicar no painel da hospedagem, criar conta, responder ao cliente) vem
   em linha iniciada por 👉. Toda resposta sua termina com a seção
   `👉 Para você fazer` (lista numerada, passo a passo) ou `👉 Para você fazer: nada desta vez.`
   Use 👉 só para isso. Registre os itens abertos em `cerebro/para-voce-fazer.md`.
3. **Cérebro.** `cerebro/` guarda a síntese de todas as sessões e tudo sobre a empresa.
   Ao encerrar um assunto use a skill `encerrar-sessao`. Uma sessão só sabe o que a outra
   fez pelo cérebro: se não foi escrito lá, não aconteceu.
4. **Contexto.** A cada 10% de contexto usado aparece um aviso automático: atualize o
   cérebro (skill `encerrar-sessao`, modo compactar) e peça ao responsável para enviar
   `/compact`; a conversa continua no mesmo chat (decisão 0009). Só quando ele pedir novo
   chat, termine a resposta com o bloco `📋 COPIE E COLE EM UM NOVO CHAT` da mesma skill.
5. **Skills.** No início de cada tarefa diga em uma linha: `🧩 Skills: usando X` e, se
   fizer sentido, `vale criar a skill Y porque...`. Tarefa repetida duas vezes vira
   proposta de skill. Catálogo em `cerebro/automacoes.md`.
6. **🤖 Modelos.** A base é o Opus 5.5. Antes de iniciar qualquer tarefa, mostre o
   `🤖 Plano de modelos` (qual modelo faz cada parte e por quê). No início de uma etapa
   nova, espere o "ok". Tarefas que não exigem o Opus vão para os subagentes
   `construtor` (Sonnet) e `ajudante` (Haiku); tudo que é crítico passa pelo `revisor`
   (Opus). Regras em `docs/05-uso-dos-modelos.md`.
7. **Um assunto por sessão.** Se o responsável desviar, não responda ao mérito: diga qual
   é o assunto adequado, anote 2 linhas no cérebro e volte. Ideia nova do cliente passa
   pela skill `nova-ideia-cliente` antes de qualquer código.

## Arquitetura (decisão 0003; mudar só com novo registro de decisão)
Monólito modular em TypeScript; Next.js para interface e API; worker em processo separado;
PostgreSQL como única dependência de dados (fila e outbox nele, sem Redis); Docker;
monorepositório com `apps/`, `packages/`, `infra/`, `docs/` e `cerebro/`.

## Regras inegociáveis do sistema
- Dinheiro em centavos (inteiro) ou decimal exato. Nunca float.
- Estoque em dois locais, em uso e guardado; consome do em uso e, se faltar, do guardado
  automaticamente. Livre para venda: L = F - B - R. O que cada canal pode vender é
  calculado das fichas técnicas e do estoque (RC-09), nunca digitado.
- A baixa ocorre UMA vez, na liberação para produção, na mesma transação do pedido e do
  evento outbox. Reimpressão, reenvio, webhook repetido, início
  do preparo e pagamento NÃO geram nova baixa nem novo ticket.
- Pedido pago online só vai para a cozinha depois da confirmação autenticada do provedor
  de pagamento, nunca pelo retorno da tela do cliente.
- Estados separados: pedido, produção, pagamento, entrega e documento fiscal.
- Atendente marca Entregue; **só o caixa marca Pago** (ou o provedor, no pagamento
  online). Pedido só é concluído com as duas coisas.
- Tudo é registrado com autor e horário; nada é apagado (RC-17).
- Permissões por cargo (RC-12): caixa e gerente geral não acessam o financeiro.
- Histórico imutável: ajuste e cancelamento geram movimentos compensatórios.
- Receita e preço aplicados na venda ficam versionados no pedido.
- Permissão verificada em cada endpoint. Tudo que é público (site, delivery) tem
  validação no servidor, limite de requisições e nenhum dado interno exposto.
- Segredos só em cofres (GitHub Secrets, segredos de rede do ambiente). Nunca em Git,
  logs, docs, cérebro ou variáveis comuns do ambiente de nuvem.
- Dados reais de clientes e funcionários não entram em testes.
- Não inventar API, homologação, compatibilidade de equipamento ou regra fiscal.

## Caminho do código até o ar
`branch de trabalho` -> PR -> `main` (homologação) -> **Publique tudo** -> `producao` (no ar).
- Trabalhe em branch (`feat/...`, `fix/...`, `docs/...`) e abra PR com a skill `checklist-pr`.
- Você pode juntar o PR na `main` quando o CI estiver verde e o checklist completo.
  PR só de `cerebro/` ou `docs/` pode ser juntado na hora. Nunca push direto na `main`.
- A `main` alimenta a homologação, onde o responsável vê e testa.
- A branch `producao` é o que está no ar. Só recebe código após "Publique tudo".

## Pode fazer sem perguntar
Ler, criar e editar código, testes, migrações e documentos em branch; rodar testes,
PostgreSQL e Docker na sessão; abrir PR; corrigir CI; juntar PR na `main` nas condições
acima; atualizar o cérebro. Avance com hipótese explícita em itens reversíveis.

## Só com "Publique tudo"
Push para `producao`; qualquer alteração em servidor, DNS, domínio ou painel de
hospedagem de produção; migração em banco de produção.

## Só com confirmação específica (mesmo depois de "Publique tudo")
Apagar dados reais; migração destrutiva; emissão ou cancelamento fiscal real; cobrança ou
estorno real; mensagem a clientes; contratar ou alterar serviço pago; mudar o RC-01.

## Qualidade
**Nunca ignorar uma falha** (teste, CI, build), nem a que "passou na segunda": achar a causa e
corrigir (pedido do responsável, 14/11/2026).
Toda regra de dinheiro, estoque, permissão, concorrência e idempotência exige teste
contra PostgreSQL real. Não declarar integração concluída sem exercitá-la com casos de
erro. Não afirmar push, merge ou publicação sem verificar o resultado.

## Ambiente (sessões na nuvem)
Máquina virtual com Docker e PostgreSQL pré-instalados (parados: inicie o que precisar).
Não alcança equipamentos da loja. Só chega à sessão o que está neste repositório.

## Comandos
| Para quê | Comando |
|---|---|
| Subir tudo (banco, migrações, dados fictícios, gestão :3000, loja :3001, site :3002, worker) | `pnpm dev` |
| Instalar dependências | `pnpm install` |
| Lint / tipos / testes / tudo | `pnpm lint` / `pnpm tipos` / `pnpm teste` / `pnpm verificar` |
| Build dos apps | `pnpm build` |
| Migrações: aplicar / reverter a última | `pnpm banco:migrar` / `pnpm banco:reverter` |
| Dados fictícios | `pnpm banco:semente` (login = cargo, ex. `gerente.geral`; senha `senha-de-teste-123`) |
| Ensaio da homologação (Docker, sem servidor) | `bash infra/homologacao/ensaio-local.sh` (na sessão: `ERP_CA_EXTRA=/root/.ccr/ca-bundle.crt`) |

Na sessão na nuvem: `service postgresql start` antes (banco `erp` e `erp_teste`, usuário `erp`/`erp`;
crie com `CREATE ROLE erp LOGIN PASSWORD 'erp' CREATEDB` e os dois bancos se não existirem).
Sem PostgreSQL local, `pnpm dev` sobe o do `docker-compose.yml`. Os testes usam `DATABASE_URL_TESTE`
(precisa terminar em `_teste`; é apagado a cada execução).

## Skills (em `.claude/skills/`)
`encerrar-sessao`, `publicar`, `nova-ideia-cliente`, `checklist-pr`, `migracao-segura`,
`teste-idempotencia-estoque`, `ensaio-restauracao`, `matriz-de-permissoes`.

## Subagentes (em `.claude/agents/`)
`construtor` (Sonnet 5.5), `ajudante` (Haiku 5.5), `revisor` (Opus 5.5).

## Ordem de construção
Siga `docs/03-roteiro-de-fases.md`, etapa por etapa (E01, E02...). Não pule etapa nem
junte duas regras críticas no mesmo PR.
