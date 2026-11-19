# Tela do Clube E-MOTION

Requisito: `docs/requisitos/RC-21-app-do-cliente-e-clube.md`, seção 2. Regra e motivo:
`docs/decisoes/0024-base-do-clube.md`. Regra no servidor: `packages/dominio/src/clube.ts`; o que a
tela usa (sem banco): `@erp/dominio/clube` (`clube-comum.ts`: tipos, nomes, `percentualDoTexto`,
`textoDoPercentual`, `descontoDoClube`, `pontosDoPagamento`, `textoDoBeneficio`). Componente cliente
nunca importa `@erp/dominio` raiz. Item do menu: aplicativo Gestão, `/clube`, ícone `estrela`.

| Arquivo | Faz |
|---|---|
| `page.tsx` | Página (servidor): a Casca confere `clube.ver`; passa `podeGerenciar` (`clube.gerenciar`). |
| `layout.tsx` | Metadados do aplicativo Gestão e os CSS da base visual de Cadastros (janela, cartões, abas, grade dos dias). |
| `TelaDoClube.tsx` | Faixa curta, selo Ligado/Desligado e as 4 abas. Lê `GET /api/clube`; recarrega depois de cada gravação. |
| `AbaDesconto.tsx` | Clube ligado, percentual, onde vale (todas ou as categorias marcadas, só as em uso), teto em R$, horário dos 7 dias e a prévia "Num pedido de R$ 50,00 agora: desconto de R$ 5,00". |
| `AbaPontos.tsx` | Pontos por real (com a frase calculada) e a lista de prêmios (inativos esmaecidos no fim; desativar com "Desfazer"). |
| `JanelaDoPremio.tsx` | Janela de novo ou editar prêmio: nome, pontos, descrição e produto (opcional). |
| `AbaPresentes.tsx` | Os três presentes (boas-vindas, aniversário, sentimos sua falta), cada um com o seu Salvar. |
| `AbaCampanhas.tsx` | Limite por semana, aviso fixo, lista das campanhas, editar e cancelar com motivo. |
| `JanelaDaCampanha.tsx` | Janela de agendar ou editar: título, texto com contador, público, loja (só com mais de uma), dia e hora e a prévia da notificação. |
| `contas.ts` | Contas sem React: formulário do desconto, conferência antes de mandar, frase da prévia, ordem das campanhas. |
| `textos.ts` | Textos e ajudas de campo desta tela; `textoDoEnvio` ("Terça, 24/11/2026 às 15:00"). |
| `clube.css` | O pouco que é só desta tela (faixa, prévia, contador, desenho da notificação). Só variáveis do tema. |

Gravações (todas pedem `clube.gerenciar`; erro volta como `{ mensagem }` e aparece onde se clicou):
- `POST /api/clube/regras`: a aba do desconto manda `ligado`, `descontoPb`, `todasAsCategorias`,
  `categorias` (lista COMPLETA, só as em uso), `tetoDescontoCentavos` (nulo = sem teto) e os 7
  `horarios`; a de pontos manda só `pontosPorReal`; a de campanhas, só `campanhasPorSemana`.
- `POST /api/clube/premios`: sem `id` cria; com `id` altera. Desativar manda só `{ id, ativo }`.
- `POST /api/clube/presentes`: um presente por vez; vai só o campo do benefício escolhido
  (`valor` nulo no produto grátis; `produtoId` nulo nos outros).
- `POST /api/clube/campanhas`: sem `id` agenda; com `id` muda (só agendada). `enviarEm` é o valor do
  `datetime-local` ("AAAA-MM-DDTHH:MM"), na hora local da loja. Casa aberta, prazo e limite da semana
  quem confere é o servidor.
- `POST /api/clube/campanhas/cancelar`: `{ id, motivo }`.

A prévia do desconto usa o relógio do aparelho como "agora" e o que está na tela (mesmo antes de
salvar); com o Clube desligado, mostra quanto daria quando for ligado.
Teste de tela: `apps/gestao/testes-tela/clube.spec.ts` (e a ajuda nos campos em `ajuda-nos-campos.spec.ts`).
