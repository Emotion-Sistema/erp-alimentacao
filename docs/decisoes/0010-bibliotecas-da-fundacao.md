# 0010: bibliotecas e estrutura da fundação (E02)

- Data: 14/11/2026
- Status: aceita (decisão técnica delegada pela 0003; item de autenticação aceito pelo responsável em 14/11/2026)
- Assunto da sessão: T01 parte 2, etapa E02

## Contexto
A 0003 deixou para a E02 a escolha das bibliotecas, conferindo versão e manutenção atuais.
Versões conferidas no registro do npm em 14/11/2026 (todas com publicação nas últimas semanas).

## Decisão
| Para quê | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript 6.0 | O 7.0 (compilador novo) ainda não é aceito pelo typescript-eslint; subir quando for |
| Ambiente | Node 22 LTS, pnpm 10 (workspaces) | Disponíveis na sessão e no CI; sem ferramenta extra de monorepo |
| Interfaces | Next.js 16 + React 19 | Previsto na 0003 |
| Acesso ao banco | Kysely 0.29 sobre `pg` 8 | Consulta tipada que gera o SQL que se lê; `sql` explícito nas operações de estoque e dinheiro |
| Migrações | SQL puro versionado (`packages/banco/migracoes`, `NNNN_nome.up.sql` e `.down.sql`) com executor próprio de ~100 linhas | Nada de geração automática de esquema (0003); trava consultiva contra execução dupla; cada migração na sua transação |
| Fila | pg-boss 12 (esquema `fila` no mesmo PostgreSQL) | Fila durável no PostgreSQL, com repetição e expiração; sem Redis (0003). O pg-boss cria e atualiza o próprio esquema; nossas tabelas seguem só pelas migrações |
| Validação | Zod 4 | Validação de toda entrada no servidor |
| Senha | Argon2id (`@node-rs/argon2`), 19 MiB, 2 passagens | Parâmetro mínimo da OWASP; biblioteca mantida |
| Sessão | Própria: token aleatório de 32 bytes no cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção; no banco só o hash SHA-256; validade de 12 h; revogação ao sair e ao desligar o funcionário | Simples, auditável, sem serviço externo |
| Testes | Vitest 5 contra PostgreSQL real; Playwright para o navegador | Regras críticas exigem banco real (`CLAUDE.md`) |
| Lint | ESLint 10 + typescript-eslint | Inclui proibição de `parseFloat` (dinheiro só em centavos) |

**Autenticação "própria" (esclarece o item 5 da 0003):** tudo no nosso servidor e banco,
sem serviço externo de login, mas usando bibliotecas mantidas para o que é sensível
(hash de senha, geração de token, e na E03 o segundo fator). Nada de criptografia escrita à mão.

**Permissões:** a lista de ações de cada cargo fica no código (`packages/dominio/src/permissoes.ts`),
versionada e testada; o banco guarda o catálogo de cargos e quem tem qual cargo. Toda ação
protegida chama `exigir()`, que registra a recusa na auditoria. A matriz completa é a E03.

**API:** a lógica de cada rota fica em `apps/gestao/src/servidor/rotas.ts` como função
`Request -> Response`, testada chamando o servidor diretamente; os arquivos do Next só a expõem.
POST e DELETE de outra origem são recusados.

## Alternativas descartadas
- ORM com geração de esquema (Prisma, Drizzle Kit): contraria a 0003 e esconde o SQL das regras críticas.
- Serviço externo de login (Auth0, Clerk): dependência e custo; dados de funcionários fora da casa.
- Redis/BullMQ: serviço a mais (0003).

## Consequências
- Os tipos das tabelas em `packages/banco/src/tabelas.ts` são escritos à mão e precisam acompanhar as migrações.
- Limite conhecido da E02: ainda não há bloqueio por tentativas de senha nem segundo fator; entram na E03 (RC-12: código errado três vezes bloqueia).
- Ninguém cria, promove ou desliga alguém com cargo de mais poder que o seu (`cabeNoPoderDe`): achado da revisão independente (gerente geral conseguia criar um usuário financeiro).
- **Pendente para a E06 (revisão de 14/11/2026):** separar os papéis no PostgreSQL. Um papel dono das tabelas roda só as migrações; a aplicação usa outro papel, com só `INSERT, SELECT` na auditoria e sem ser dona de nada. Hoje a conta da aplicação é dona da tabela e conseguiria desligar o gatilho que protege a auditoria.
- O IP só é gravado atrás do nosso proxy (`CONFIAR_PROXY=1`, E06); até lá fica vazio, porque `x-forwarded-for` pode ser inventado.
- Reverter a 0001 com a auditoria preenchida exige `ERP_CONFIRMO_APAGAR_AUDITORIA=sim` (só desenvolvimento).
- Ainda não medido: tempo de resposta igual para login inexistente e senha errada (o código já confere um hash falso).

## Critério de aceite e evidência
CI verde (lint, tipos, migração aplica/reverte/aplica, testes com PostgreSQL real, build).
