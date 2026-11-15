# Uso dos modelos de IA

Base do projeto: **Opus 5.5**. O que não precisa dele vai para um modelo menor, mais
rápido e mais econômico. Quem coordena é a sessão principal (Opus).

## Quem faz o quê
| Modelo | Como é chamado | Responsável por |
|---|---|---|
| **Opus 5.5** | Sessão principal | Decisões e arquitetura; regras de dinheiro, estoque, concorrência, idempotência e permissões; integrações de pagamento e fiscal; migrações de risco; tempo real e estimativa de tempo; depuração difícil; segurança; coordenação; **revisão final de todo PR** |
| **Opus 5.5** | Subagente `revisor` | Revisão independente (sem ter visto o trabalho sendo feito) de tudo que toca em dinheiro, estoque, permissão, pagamento, fiscal e área pública |
| **Sonnet 5.5** | Subagente `construtor` | Telas e componentes a partir de requisito escrito; cadastros simples; testes a partir de critérios já definidos; relatórios; documentação; refatoração mecânica |
| **Haiku 5.5** | Subagente `ajudante` | Busca e leitura de arquivos; resumos; conferências repetitivas; dados fictícios de teste; mensagens de commit; atualização do diário e das listas do cérebro |

Os subagentes estão em `.claude/agents/`. O modelo de cada um está no próprio arquivo.

## Regras
1. **Avisar antes de começar.** Antes de iniciar qualquer tarefa, a sessão principal
   mostra ao responsável o plano de modelos, neste formato:

   ```
   🤖 Plano de modelos desta tarefa
   | Parte | Modelo | Por quê |
   |---|---|---|
   | Regra de baixa do estoque | Opus 5.5 | Regra crítica, concorrência |
   | Tela de cadastro | Sonnet 5.5 (construtor) | Especificação fechada |
   | Dados de teste e diário | Haiku 5.5 (ajudante) | Tarefa leve |
   | Revisão antes do merge | Opus 5.5 (revisor) | Toca em estoque |
   ```
   No início de uma **etapa nova** da ordem de construção, espera o "ok" do responsável.
   Dentro de uma etapa já iniciada, mostra o plano e segue.
2. **Na dúvida, sobe.** Se uma parte parecia simples e encostou em regra crítica, volta
   para o Opus. Economia nunca justifica risco em dinheiro, estoque ou permissão.
3. **Modelo menor não decide.** Construtor e ajudante executam especificação; dúvida de
   projeto volta para a sessão principal.
4. **Nada crítico entra sem o revisor.** O Opus principal confere o resultado de todo
   subagente antes de aceitar; o que é crítico passa também pelo `revisor`.
5. **Registrar.** O diário da sessão anota que modelo fez cada parte e se o resultado
   precisou ser refeito. Se um modelo menor errar o mesmo tipo de tarefa duas vezes,
   esse tipo de tarefa sobe de modelo e a tabela acima é atualizada.
6. **A sessão deve ser aberta em Opus.** Se a sessão estiver em outro modelo, avisar o
   responsável antes de qualquer trabalho crítico.

## Como o responsável escolhe o modelo da sessão
No Claude Code, pelo seletor de modelo ou enviando `/model opus`.

## Frentes paralelas (15/11/2026)
O responsável pode abrir outro chat com outro modelo (ex.: Fable) para uma função separada
(`cerebro/frentes/README.md`). O revisor (Opus) continua obrigatório no que é crítico.
