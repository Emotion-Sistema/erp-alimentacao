# 0026: alergênicos calculados da ficha técnica (S1)

- Data: 20/11/2026
- Status: aceita (lista inicial e quem marca são hipóteses a confirmar)
- Assunto da sessão: S1, alergênicos calculados da ficha técnica (logo depois da E08)

## Contexto
A sugestão S1 (RC-07, aprovada pelo responsável em 18/11/2026) pede que o prato "herde" os
alergênicos dos ingredientes pela ficha técnica (decisão 0025), sem ninguém escrever à mão, e que o
site e o delivery mostrem ícones e "pode conter traços". O RC-07 deixou para decidir a lista de
alergênicos e quem marca. É informação de **saúde do cliente**: errar para "não contém" pode causar
dano; errar para "em conferência" só custa uma pergunta a mais.

Fatos: as fichas têm preparos dentro de preparos, itens opcionais e itens sem quantidade (pendência);
o expandido das fichas (decisão 0025, item 4) já previa servir aos alergênicos. O papel do aplicativo
no banco não apaga linha (decisão 0014, RC-17).

## Decisão
1. **Catálogo editável** (migração 0020, tabela `alergenico`): código estável (só letras minúsculas
   e `_`), nome, descrição, ordem, ativo. Ver = `cadastros.ver`; adicionar, editar, desativar e
   reativar = `cadastros.gerenciar`. Nada se apaga. **Desativar não some com o aviso**: o alergênico
   desativado continua contando nos pratos e nos ingredientes que já o têm (com o nome), só sai da
   escolha nos ingredientes que ainda não o têm.
2. **Marca no ingrediente** (`ingrediente_alergenico`: contém ou pode conter traços; desmarcar deixa
   a linha inativa) e **conferência** no ingrediente (`alergenicos_conferidos_em` e `_por`; os dois
   juntos, por CHECK). Nulo = ainda não conferido. Conferido sem nenhuma marca = "não contém nenhum".
   Gravar a lista do ingrediente marca conferido com quem e quando, com auditoria antes e depois.
   Um código não fica nas duas listas.
3. **Regra única e pura** `alergenicosDasFichas` (`fichas-comum`): percorre TODOS os ingredientes
   que a versão atual alcança, inclusive itens sem quantidade, opcionais e de dentro de preparos
   (mesmo de ficha incompleta ou de preparo desativado), com a mesma proteção de receita circular e
   de profundidade (8 níveis) de `analisarFichas`. Devolve por ficha: `contem`, `tracos` (sem repetir
   os de contém), `opcionais` ("contém se pedir X", com o nome do item opcional de mais fora),
   `emConferencia` (ingredientes a conferir), `pendencias` e a `situacao`.
4. **Na dúvida, em conferência, nunca "não contém":** ingrediente não conferido ou desativado,
   ficha sem receita ou sem itens, receita circular ou funda demais, preparo não encontrado e item
   sem ficha deixam o prato "Alergênicos em conferência". O selo "Não contém nenhum alergênico da
   lista" só aparece com tudo conferido.
5. **Onde aparece:** painel de fichas (selos e filtro "Alergênicos em conferência"), ficha aberta
   (bloco com os ingredientes a conferir e link para a janela de cada um), versão para a cozinha e
   aba "Alergênicos" (catálogo). `alergenicosDoProduto(db, produtoId, tamanhoId?)` serve ao cardápio
   futuro (site, delivery, atendente): ficha ativa do tamanho, se houver; senão, a do produto; sem
   ficha, em conferência. Sempre ícone + texto, nunca só cor.

## Hipóteses (a confirmar com o responsável e um nutricionista)
- **Lista inicial**, baseada na RDC 26/2015 da Anvisa (rotulagem de alergênicos) e, para a lactose,
  na RDC 136/2017: glúten (trigo, centeio, cevada, aveia), crustáceos, ovos, peixes, amendoim, soja,
  leite (de todos os mamíferos), castanhas e nozes (amêndoa, avelã, castanha-de-caju,
  castanha-do-pará, macadâmia, nozes, pecã, pistache, pinoli), látex natural, lactose. Nenhuma outra
  regra da Anvisa foi aplicada (frases obrigatórias de rótulo, limites de traço etc. ficam fora).
- **Quem marca** = quem gerencia cadastros (`cadastros.gerenciar`); a cozinha consulta.
- **Opcional à parte:** alergênico que só vem de item opcional aparece como "contém se pedir X";
  o ingrediente opcional não conferido também deixa o prato em conferência.
- Traços em item que sempre vai contam como "pode conter traços" do prato.
- Ao gravar, um código desativado que o ingrediente já tem pode continuar (o aviso não some).
- Adicionais e combos: cada adicional tem a própria ficha (e os próprios alergênicos); somar
  adicional ao prato e montar combo ficam para quando o cardápio do site e do delivery usar isso.
- O aviso ao gerente quando um prato fica "em conferência" (RC-07) não entrou aqui: o filtro e os
  selos já mostram; o aviso pela central entra junto com o cardápio público.

## Alternativas descartadas
- Escrever os alergênicos no produto, à mão: fica errado quando a cozinha troca um ingrediente.
- Tratar ingrediente sem marca como "não contém": seria afirmar saúde sem ninguém ter conferido.
- Apagar a marca ao desmarcar: o papel do aplicativo não apaga (RC-17); a linha fica inativa.
- Esconder do prato o alergênico desativado no catálogo: um clique no catálogo sumiria com um aviso
  de saúde.

## Consequências
Trocar o ingrediente na ficha muda o aviso sozinho. Cada ingrediente precisa ser conferido uma vez;
até lá, os pratos com ele ficam "em conferência" (é o esperado no começo). Uma consulta a mais no
painel de fichas (marcas dos ingredientes alcançados).

## Critério de aceite e evidência
`packages/dominio/testes/alergenicos.teste.ts` (PostgreSQL real): herda de preparo, traços,
opcional à parte, item sem quantidade conta, não conferido (também dentro de preparo e opcional) em
conferência, conferido sem nada = não contém, ingrediente desativado, alergênico desativado continua
contando, troca de ingrediente muda o resultado, ficha sem itens, permissões e auditoria, catálogo
(adicionar, repetido, código inválido, desativar e reativar), tamanho x produto em
`alergenicosDoProduto`, ciclo e profundidade. Matriz da API com as rotas novas. Teste de tela
`apps/gestao/testes-tela/alergenicos.spec.ts` (marcar ingrediente pelo link, selos na ficha e na
cozinha, filtro, catálogo, cozinheira só lê, celular sem rolagem de lado).
