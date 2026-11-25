# 0030: tema claro ou escuro e letra normal ou grande, cada pessoa escolhe

- Data: 25/11/2026
- Status: aceita (frente visual-limpo, parte 4)
- Assunto da sessão: novo visual do ERP
- Revê: decisão 0012, "gestão sempre clara" (15/11/2026), que passa a ser o **padrão**, não a única
  opção. Completa a 0028 (visual Balcão), item 3 (letra).

## Contexto
Na versão 4 do protótipo (25/11/2026) o responsável pediu "tema claro ou escuro, cada pessoa
escolhe (botão sol/lua no topo)" e, no plano da frente, letra normal ou grande por pessoa. Antes
(15/11 e 18/11) ele tinha pedido que o navegador do celular nunca escurecesse a gestão sozinho; isso
continua valendo. Os aparelhos da loja são compartilhados (um login por funcionário).

## Decisão
1. **Guardado no usuário** (migração 0026: `usuario.tema` claro|escuro e `usuario.letra`
   normal|grande, com padrão claro e normal). Vale em qualquer aparelho em que a pessoa entrar; no
   aparelho compartilhado, cada um vê a sua.
2. **O servidor aplica antes de desenhar:** o layout lê a sessão e põe `data-tema` e `data-letra`
   no `<html>`. Sem sessão (tela de entrada, sessão vencida): claro e letra normal.
3. **Nunca automático:** o tema não segue o modo escuro do aparelho (`prefers-color-scheme` continua
   fora do `tema.css`); o escuro só vem pela escolha.
4. **Cores do escuro:** a mesma paleta "Noite de Torra" dos apps do cliente (`publico.css`), em
   `:root[data-tema="escuro"]` no `tema.css`, mais as poucas cores só da gestão (seção aberta do
   trilho, mesa ocupada). O teste `cores.teste.ts` confere que os valores são iguais aos do cliente
   e o contraste AA de cada par.
5. **Letra grande:** a página inteira cresce 12,5% (16 px para 18 px de base; o texto da equipe
   vai de 15 px para cerca de 17 px). Tudo é medido em rem, então cresce junto.
6. **Onde a pessoa troca:** botão sol/lua no topo (ao lado do sino) e "Letra grande" no menu da
   conta. Muda na hora; se o servidor recusar, volta como estava.
7. **Permissão:** qualquer cargo muda a própria aparência (`POST /api/eu/preferencias`, só com
   sessão e segundo fator em dia). Não muda a de ninguém mais. Cada troca vai para a auditoria
   (`sessao.preferencias`, com o antes e o depois).

## Alternativas descartadas
- Guardar no aparelho (navegador): no aparelho compartilhado, a escolha de um valeria para todos.
- Seguir o modo escuro do aparelho: contraria o pedido de 15/11 (nada escurece sozinho).
- Paleta escura nova só para a gestão: duas paletas para manter; a do cliente já tem contraste testado.

## Consequências
Tela nova não precisa fazer nada: usa as variáveis do tema e herda claro, escuro e letra grande.
Cor escrita fora do `tema.css` continua proibida (o escuro não funcionaria nela).

## Critério de aceite e evidência
Teste contra PostgreSQL real (`preferencias.teste.ts`: padrão, troca, outro aparelho, isolamento
entre pessoas, recusas, sessão encerrada, valores fora da lista barrados no banco), matriz da API
(rota de sessão), contraste AA do escuro (`cores.teste.ts`) e teste de tela (`preferencias.spec.ts`:
computador e celular, troca, recarregar mantém, volta ao claro, entrada sempre clara). Revisão
independente (migração e rota nova).
