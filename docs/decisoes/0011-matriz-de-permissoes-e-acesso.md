# 0011: matriz de permissões, cargo ativo, bloqueios, segundo fator e estação da cozinha

- Data: 14/11/2026
- Status: aceita (E03). Hipóteses respondidas pelo responsável em 14/11/2026 (seção própria).
- Assunto da sessão: E03, cargos, login e auditoria
- Complementa: RC-12, decisões 0008 e 0010

## Decisão

### 1. Matriz (fonte: `packages/dominio/src/permissoes.ts`)
A permissão vem **só do cargo ativo**. O que não está listado é recusado e registrado.

| Ação | Dono / Adm. | Gerente geral | Financeiro | Supervisor | Atendente | Caixa | Cozinheira | Auxiliar | Motoboy | Contador |
|---|---|---|---|---|---|---|---|---|---|---|
| Ver funcionários | ✓ | ✓ | | ✓ | | | | | | |
| Gerenciar funcionários | ✓ | ✓ (cargos de operação) | | | | | | | | |
| Desbloquear código | ✓ | ✓ | | ✓ | | | | | | |
| Cadastrar estações / ver estações | ✓ / ✓ | ✓ / ✓ | | – / ✓ | | | | | | |
| Ver auditoria | ✓ | ✓ | | | | | | | | |
| Configuração do sistema | ✓ | | | | | | | | | |
| Enviar comunicados e ver quem leu (E05, decisão 0013) | ✓ | ✓ | | | | | | | | |
| Lançar pedido | ✓ | ✓ | | ✓ | ✓ | | | | | |
| Ver os próprios pedidos / todos | ✓ | ✓ | | – / ✓ | ✓ / – | – / ✓ | | | | |
| Alterar pedido | ✓ | ✓ | | ✓ | ✓ (avisa os supervisores) | | | | | |
| Cancelar pedido | ✓ | ✓ | | ✓ | | | | | | |
| **Marcar Entregue** | | | | | ✓ | | | | ✓ | |
| Ver a produção | ✓ | ✓ | | ✓ | | | ✓ | ✓ | | |
| **Operar a produção** (fila, iniciar, pronto) | | | | | | | ✓ | ✓ | | |
| **Ação sensível na cozinha** (perda, ajuste, "acabou") | | | | | | | ✓ | | | |
| Estoque da cozinha / do salão | ✓ / ✓ | ✓ / ✓ | | – / ✓ | | | ✓ / – | | | |
| Compras do estoque (comida, bebida) | ✓ | ✓ | | | | | | | | |
| Compras de materiais (utensílios, eletrodomésticos) | ✓ | ✓ | ✓ | | | | | | | |
| Custos da área | ✓ | ✓ | ✓ | | | | | | | |
| **Operar o caixa** / **marcar Pago** | | | | | | ✓ / ✓ | | | | |
| Autorizações do caixa e do atendimento | ✓ | ✓ | | ✓ | | | | | | |
| Organizar motoboys | ✓ | ✓ | | | | ✓ | | | | |
| **Entregas próprias** | | | | | | | | | ✓ | |
| Financeiro, faturamento, fechamentos do caixa | ✓ | | ✓ | | | | | | | |
| Pacote contábil | ✓ | | ✓ | | | | | | | ✓ |

**Em negrito: ações exclusivas de quem faz o trabalho.** Nem o dono as tem pelo próprio
cargo: quem quiser marcar Pago precisa ter o cargo de caixa **ativo**. Assim cada registro
diz quem de fato recebeu, produziu ou entregou (regra "só o caixa marca Pago").

### 2. Quem dá cada cargo (lista explícita, no lugar da comparação de ações da 0010)
| Cargo | Quem pode dar, tirar ou desligar quem o tem |
|---|---|
| Dono | só o dono |
| Administrador, financeiro, contador, gerente geral | dono e administrador |
| Supervisor, atendente, caixa, cozinheira, auxiliar, motoboy | dono, administrador e gerente geral |

Para mexer em alguém é preciso poder dar **todos** os cargos dele. Ninguém mexe nos
próprios cargos nem se desliga. O teste confere que quem dá um cargo já tem todo o poder
dele, exceto as ações exclusivas.

### 3. Cargo ativo
Quem tem mais de um cargo escolhe com qual está agindo (troca registrada). Cada sessão tem
o seu. Cargo tirado enquanto a pessoa está dentro: o poder some na hora. Tirar cargo não
apaga: a linha ganha data e autor.

### 4. Bloqueios
- **Senha:** 5 erros seguidos bloqueiam por 15 minutos (nem a senha certa entra). A tentativa é
  reservada no banco antes de conferir a senha: com rajada simultânea, no máximo 5 conferências.
- **Código da cozinha:** 3 erros seguidos bloqueiam até o supervisor, gerente ou administrador
  desbloquear; registra e gera um aviso para supervisor e gerente (uma vez só, mesmo com
  tentativas simultâneas). A central de avisos e o aviso no aparelho são a E05.
- Código: 4 números, sem repetição (1111) nem sequência (1234). Só para quem é da cozinha.
  Guardado como hash (Argon2id), nunca vai para a auditoria.

### 5. Segundo fator (dono e administrador)
Código de 6 números de um aplicativo autenticador (padrão TOTP, biblioteca `otpauth`).
Vale para quem **tem** cargo de dono ou administrador, mesmo agindo com outro cargo.
Sem confirmar, o servidor recusa tudo. A semente fica cifrada (AES-256-GCM) com a chave
`ERP_CHAVE_SEGREDOS`, que em produção vem do cofre. Código já usado não vale de novo.
Os erros contam por pessoa (todas as sessões, reservados antes de conferir): 5 erros bloqueiam
por 15 minutos e encerram as sessões. Entrar de novo com a senha não dá mais chances. Celular perdido: **outro** administrador reinicia.
Limite conhecido: no primeiro acesso, quem tem a senha configura o segundo fator. Por isso
a senha inicial deve ser entregue em mãos e trocada no primeiro acesso.

### 6. Estação da cozinha (RC-12, "quem está nesta tela")
O gestor cadastra o tablet uma vez, pelo próprio tablet (o aparelho guarda um cookie; o banco
guarda só o hash). A pessoa toca na foto e digita o código no início do turno; um toque na
foto troca quem está ativa; sozinha na tela, tudo sai em nome dela. Entrar em outra estação
tira da anterior. Saída automática no fim do turno da unidade (padrão 23:30, no máximo 16 h).
Ação sensível pede o código de novo. Desligar a pessoa ou a estação tira todo mundo na hora.
Quem sobra sozinha na tela vira a ativa. Cadastrar o tablet encerra, na mesma resposta, a
sessão do gestor que fez o cadastro. A própria pessoa troca o código, mas não se desbloqueia.
Cada gestor só mexe em gente da própria unidade (criar, dar cargo, desligar, desbloquear, listar).

## Respostas do responsável (14/11/2026)
1. **Atendente altera pedido** (não cancela). Toda alteração feita por atendente **avisa os
   supervisores** e aparece para o gerente numa **aba própria de alterações**, para ele entender
   se o pedido foi lançado errado ou se o cliente trocou (motivo obrigatório). Tela e aviso: E13 e E15.
2. **Financeiro compra**, mas fora do estoque de comida: material físico, utensílios,
   eletrodomésticos (ação `compras.materiais`). Compras do estoque continuam com o gerente geral.
   O gerente geral também compra materiais (confirmado em 14/11/2026).
3. Segundo fator só para dono e administrador: ok.
4. Supervisor vê funcionários e desbloqueia código, sem criar nem desligar: ok.
5. **Caixa vê todos os pedidos**: sim. Tela com **mapa visual das mesas**, mostrando quais estão
   livres e ocupadas; um toque na mesa abre as funções dela. Tela: E13 e E17 (RC-13).
6. Senha: 5 erros e 15 minutos: ok. **Cozinha fecha às 23h e a loja às 23h30** (14/11/2026). A saída
   automática do tablet fica às **00h30**, com opção de a cozinha estender 30 min (até 4 vezes) e
   aviso sonoro 15 min antes (migração 0003). Horários de venda
   por categoria e canal: RC-09, seção 2a.

## Limites conhecidos
- O aviso "bloqueado" só aparece para login que existe: com 5 tentativas dá para saber se um
  login existe. Aceito para o sistema interno (logins seguem o nome das pessoas). Medir a
  diferença de tempo de resposta continua pendente (0010).
- O gerente geral não dá cargo a si mesmo, mas pode criar um login de caixa com senha que ele
  conhece. A auditoria registra quem criou; a conferência é do dono.
- Recusas anônimas (sem sessão, tablet não cadastrado) são registradas; sem o limite de
  requisições (E06), um script poderia encher a auditoria.

## Fica para depois
- Ajustes pontuais de permissão por pessoa, com autor e motivo (RC-12): quando aparecer o
  primeiro caso real.
- "Aplicativo interno só abre em aparelho cadastrado" para os outros aplicativos (hoje só a
  estação da cozinha): com a casca dos aplicativos (E04) e a homologação (E06).
- Foto real das pessoas na estação (hoje: iniciais).
- Gerente geral vê toda a auditoria; quando houver ações do financeiro, filtrar o que ele vê.
- Pendências da 0010 para a E06 continuam (papéis do PostgreSQL, limite de requisições, HTTPS).

## Alternativas descartadas
- Somar as permissões de todos os cargos da pessoa: perde-se quem agiu em qual papel e o
  caixa-dono poderia marcar Pago sem estar no caixa.
- Comparar ações para decidir quem dá cargo (0010): impedia o gerente de criar caixa assim
  que o caixa ganhou "marcar Pago".
- Código da cozinha a cada toque: inviável com as mãos ocupadas (RC-12).

## Critério de aceite e evidência
Teste da matriz por cargo no domínio e pela API (cada cargo x cada rota: 403 e registro),
cobertura de rotas (rota nova sem teste quebra o CI), bloqueios com tentativas simultâneas,
segundo fator e estação contra PostgreSQL real.
