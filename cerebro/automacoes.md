# Automações: skills, conectores e plugins

## Como funciona nas sessões na nuvem
- **Skills do repositório** (`.claude/skills/`) carregam em toda sessão. É o caminho principal.
- **Hooks do repositório** (`.claude/settings.json`) também carregam: são as travas automáticas.
- **Plugins declarados no repositório não são instalados** nas sessões na nuvem. Por isso
  este projeto usa skills próprias em vez de depender de plugins.
- **Conectores** habilitados na sessão funcionam; os servidores de `.mcp.json` do
  repositório também são carregados.

## Subagentes e modelos
| Subagente | Modelo | Para quê |
|---|---|---|
| `construtor` | Sonnet 5.5 | Telas, cadastros, testes e relatórios a partir de especificação |
| `ajudante` | Haiku 5.5 | Busca, leitura, resumos, dados de teste, diário |
| `revisor` | Opus 5.5 | Revisão independente do que é crítico |
A sessão principal roda em Opus 5.5 e coordena. Regras em `docs/05-uso-dos-modelos.md`.

## Skills existentes
| Skill | Quando |
|---|---|
| `encerrar-sessao` | Fim de assunto, aviso de contexto, "novo chat" |
| `publicar` | Mensagem começando com "Publique tudo" |
| `nova-ideia-cliente` | Qualquer pedido novo |
| `checklist-pr` | Abrir ou revisar PR |
| `migracao-segura` | Mudança no banco |
| `teste-idempotencia-estoque` | Pedido, estoque, tickets |
| `ensaio-restauracao` | Backup e recuperação |
| `matriz-de-permissoes` | Rota nova, ação nova, mudar o que um cargo pode (criada na E03) |

## Skills recomendadas (criar quando a fase chegar)
| Skill | Para quê | Etapa |
|---|---|---|
| `novo-modulo` | Criar módulo já com estrutura, testes e permissões no padrão | E02 a E04 |
| `tela-por-funcao` | Conferir tela contra a base visual, tamanhos reais e linguagem simples | E02 a E04 |
| `importar-cardapio` | Transformar planilha do cliente em cadastros, apontando o que falta | E07 |
| `pacote-contabil` | Gerar e conferir o pacote mensal da contabilidade | E31 |
| `calibrar-tempos-de-preparo` | Comparar tempo prometido e realizado e propor ajuste de tempos e capacidades | Após algumas semanas de uso |
| `calibrar-linhas-de-estoque` | Recalcular as linhas saudável e de emergência pelo consumo real e propor ajustes ao responsável | Após algumas semanas de uso |
| `teste-de-homologacao` | Rodar no navegador os fluxos críticos e gerar o roteiro 👉 de conferência | E14 |
| `integrar-provedor` | Checklist de integração de pagamento/fiscal: estados, erros, reenvio, segredos | E19, E20 |
| `revisar-superficie-publica` | Segurança do site e do delivery: validação, limites, dados expostos | Portão 3 |
| `provisionar-servidor` | Preparar servidor do zero pelo conector da Hostinger e por script | E06 |
| `relatorio-ao-cliente` | Resumo quinzenal em linguagem simples do que entrou e do que falta | Sempre |

O Claude deve propor uma skill sempre que repetir o mesmo procedimento pela segunda vez.

## Conectores
| Conector | Uso | Quando ligar | Cuidado |
|---|---|---|---|
| GitHub | Código, PR, CI | Já | Proteger `main` e `producao` |
| Hostinger (MCP oficial) | Consultar e gerenciar VPS, domínios e DNS sem abrir o painel | Ao contratar o servidor | Alterações só com "Publique tudo" (há trava) |
| Google Drive | Ler material bruto do cliente | Quando houver material | Confirmar na sessão se aparece; converter para `cerebro/` |

### Hostinger: como ligar (quando houver conta)
Acrescentar ao repositório o arquivo `.mcp.json`:
```json
{
  "mcpServers": {
    "hostinger": { "type": "http", "url": "https://mcp.hostinger.com" }
  }
}
```
A autorização é feita pelo navegador na primeira vez (o responsável aprova). Alternativa:
pacote `@hostinger/mcp` com token de API em variável segura. Confirmar na documentação
da Hostinger no momento de ligar, e conferir na primeira sessão quais ações ele oferece.

## Publicação automática (sem mexer em painel)
1. Preparação do servidor: uma vez, por script versionado em `infra/` (Docker, firewall,
   usuário de implantação, HTTPS).
2. Publicação: GitHub Actions implanta quando a branch `producao` recebe código. As
   credenciais do servidor ficam nos segredos do GitHub; o Claude não as vê.
3. Homologação: mesma automação, a partir da `main`.
4. DNS e servidor: pelo conector da Hostinger.
O que continua manual: contratar e pagar serviços, aprovar autorizações, criar tokens.

## O que NÃO automatizar
Pagamento a fornecedor, emissão fiscal real fora do fluxo de venda, mensagens a clientes
e exclusão de dados. Sempre com pessoa confirmando.
