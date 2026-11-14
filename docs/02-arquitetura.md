# Arquitetura

Arquitetura adotada. As escolhas e seus motivos estão em `decisoes/0003-arquitetura-base.md`.
Para mudar algo, crie novo registro de decisão.

## Componentes
| Camada | Decisão |
|---|---|
| Interfaces | Aplicação web responsiva/PWA em React/Next.js; uma experiência por função, sem duplicar regra de negócio |
| Servidor | TypeScript, API modular, validação no backend, PostgreSQL, transações nas operações críticas |
| Tarefas assíncronas | Worker em processo separado; fila durável e outbox no próprio PostgreSQL, com novas tentativas e identificação única; sem Redis na primeira versão |
| Implantação | Docker, Git, migrações versionadas, homologação separada, publicação controlada com reversão |
| Arquivos | Armazenamento separado quando necessário; fotos, XML e anexos com controle de acesso e backup próprio |
| Tempo real | Envio do servidor (SSE) para as telas de produção; a fila gravada no banco é a verdade |
| Operação local | Agente local para impressão e balança quando necessário; servidor local na loja é evolução |

Modelo: **monólito modular**. Sem microserviços no início. Um banco, módulos com
fronteiras claras (cadastros, estoque, pedidos, produção, caixa, financeiro, fiscal,
pessoas, mídia, suporte).

Estrutura do monorepositório: `apps/gestao` (interna), `apps/loja` (delivery e app do
cliente), `apps/site` (institucional), `apps/worker`; `packages/` (domínio, banco,
interface compartilhada); `infra/` (Docker, implantação); `docs/`; `cerebro/`.

## Superfície pública (site e loja)
- Endereços separados por subdomínio: `www` (site), `pedidos` (loja), `gestao` (interno).
- A loja e o site só enxergam o que é público: produto vendável, preço do canal,
  disponibilidade, horário. Custo, estoque numérico, margens e dados de pessoas nunca saem.
- Validação e cálculo de preço no servidor; limite de requisições; proteção de formulários.
- Pagamento por campo/checkout do provedor: dado de cartão não toca o nosso servidor.
- Confirmação de pagamento por aviso autenticado do provedor, idempotente.
- Acompanhamento do pedido por link com código imprevisível, sem login.
- O site institucional usa páginas geradas e cache, e segue no ar se o resto estiver em manutenção.

## Entidades principais
Empresa/CNPJ, unidade, setor, usuário/perfil, funcionário, turno/caixa, cliente,
mesa/comanda, produto/adicional, receita/versão, ingrediente/unidade, fornecedor, compra,
lote, produção, movimento de estoque, pedido/item, pagamento, recebível, despesa,
liquidação, documento fiscal, evento de integração, dispositivo, chamado de suporte.

## Regras de dados
- Dinheiro em centavos ou decimal exato; arredondamento definido e testado.
- Chaves idempotentes e restrições únicas. Eventos externos podem chegar repetidos ou
  fora de ordem: validar assinatura, manter log, reconciliar divergências.
- Publicação de evento na mesma transação do dado (outbox).
- Horários preservam instante e fuso operacional.
- Item vendido guarda o preço e a receita aplicados na venda.
- Separar marca, setor, unidade e CNPJ. Identidade visual não define quem vende, recebe ou emite nota.
- CNPJ como texto.
- IA só para explicar e sugerir. Estoque, financeiro, tributos e permissões seguem regras determinísticas e auditáveis.

## Ambientes e publicação
Caminho: branch de trabalho -> PR -> `main` (homologação) -> "Publique tudo" -> `producao` (no ar).
Implantação pelo GitHub Actions, com credenciais nos segredos do GitHub (decisão 0004).

| Ambiente | Onde | Dados | Observação |
|---|---|---|---|
| Desenvolvimento | Sessão na nuvem do Claude Code (Docker e PostgreSQL disponíveis) | Sintéticos | Nada de credencial real |
| Homologação | Servidor com endereço acessível, separado da produção | Sintéticos ou mascarados | Onde o responsável e o cliente veem e testam |
| Produção | VPS (preferência do projeto: Hostinger, plano KVM 4 como ponto de partida) | Reais | Só com confirmação do responsável |

Preferência registrada: Hostinger, Ubuntu LTS, Docker; aplicação, PostgreSQL e worker na
mesma máquina no início. Isso NÃO é banco gerenciado nem alta disponibilidade. Não
compilar nem rodar testes pesados no servidor de atendimento. Dimensionar pela carga medida
em homologação e confirmar plano e valores na página oficial antes de contratar.

## Continuidade
| Situação | Comportamento esperado |
|---|---|
| Cai a internet principal | Roteador assume segundo link (4G/5G); testar a troca |
| Sem internet externa | PDV executa só as funções locais previstas; PWA instalada não garante offline |
| Vários dispositivos sem internet | Exige servidor local para coordenar; navegadores isolados não sincronizam entre si (evolução) |
| Pagamento ou fiscal indisponível | Exibir a pendência real e aplicar o procedimento definido |
| Retorno da conexão | Sincronizar registros únicos e reconciliar sem duplicar |

Metas a validar, não garantias: **RPO de até 15 minutos e RTO de até 2 horas.** Backup
diário isolado não atende esse RPO. Para atender: arquivamento contínuo de logs do
PostgreSQL para armazenamento externo, recuperação pontual e restauração ensaiada
(decisão 0003, item 8). Sem isso, a meta honesta é a idade do último backup.

## Segurança mínima
Usuários individuais; MFA para administração; permissões no backend; auditoria; SSH por
chave; firewall; banco sem acesso público; HTTPS; segredos fora do código; minimização e
retenção de dados pessoais; alertas de indisponibilidade, fila parada, disco cheio e
backup atrasado. O dono do negócio tem visão ampla, mas não recebe credenciais de
servidor ou banco no aplicativo.

## Observabilidade
Logs estruturados com identificador que ligue a falha técnica ao pedido e à integração.
Medir: tempo da confirmação até o recebimento no terminal, fila pendente, idade do pedido
mais antigo. Avaliar OpenTelemetry ou solução mais simples compatível com a escala.

## Ainda a escolher na etapa E02
Bibliotecas de fila sobre PostgreSQL, acesso tipado ao banco, validação e testes;
armazenamento de arquivos e mídia; forma de impressão conforme o equipamento real.
Registrar em novo arquivo de `decisoes/` com o próximo número livre.
