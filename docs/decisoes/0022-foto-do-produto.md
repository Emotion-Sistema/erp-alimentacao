# 0022: foto do produto (produtos completos, parte 2)

- Data: 19/11/2026
- Status: aceita
- Assunto da sessão: passo 3 do plano de 19/11/2026 (produtos completos)

## Contexto
O responsável pediu foto nos produtos, com a base pronta para a equipe só cadastrar (decisão
0018, respostas de 19/11/2026). A foto vai aparecer no cardápio do delivery e da mesa (E26, RC-20).
Arquitetura: PostgreSQL é a única dependência de dados (decisão 0003). Foto de celular costuma
ter 3 a 8 MB e leva dados escondidos (localização, modelo do aparelho).

## Decisão
1. **A foto fica no PostgreSQL** (`produto_foto`, migração 0016), no máximo 1 MB por foto. Entra
   no backup com o resto e não pede outro serviço nem chave.
2. **O servidor sempre refaz a imagem** (biblioteca `sharp` 0.35.5): confere pelos primeiros bytes
   que é JPEG, PNG ou WebP (nunca pelo nome), abre com limite de 40 milhões de pixels (contra
   "bomba" de imagem), endireita pela orientação da câmera, reduz para no máximo 1200 px,
   transparência vira fundo branco e grava **WebP novo sem metadados** (sem localização). Lado
   menor abaixo de 200 px e foto mais comprida que 4 por 1 são recusados. Se o WebP passar de 1 MB
   (foto com muito detalhe fino), é refeito com qualidade menor (82, 70, 55, 40); se ainda passar,
   recusa com mensagem clara. No máximo 2 fotos são refeitas ao mesmo tempo (as outras esperam a
   vez), e a biblioteca não guarda cache. Arquivo até 8 MB; a tela já reduz antes de enviar (e
   assim converte a foto HEIC do iPhone).
3. Uma foto ativa por produto (índice único no banco). Trocar ou tirar deixa a anterior inativa
   (nada se apaga); a auditoria guarda quem, quando e a impressão (sha256), nunca o conteúdo.
4. A foto é servida por id (`/api/cadastros/produtos/foto/[id]`) com permissão `cadastros.ver`,
   tipo `image/webp`, `nosniff`, CSP `sandbox` e cache imutável (trocar a foto cria outro id).
   O cardápio público (E26) terá a sua rota própria, só da foto ativa de produto à venda.
5. Envio e troca: `cadastros.gerenciar`, com a permissão conferida antes de ler o arquivo.
   Envios ao mesmo tempo para o mesmo produto são enfileirados pela trava do produto (teste
   determinístico que falha sem a trava). O id da foto só aceita dígitos e é conferido depois da
   permissão.

## Alternativas descartadas
- Pasta no disco do servidor: fica fora do backup do banco e some se o contêiner for recriado.
- Serviço de arquivos na nuvem: serviço pago a mais e chave para guardar; reavaliar se as fotos
  passarem de alguns milhares.
- Guardar o arquivo como chegou: pesado, com localização e com risco de arquivo disfarçado.

## Consequências
A biblioteca `sharp` entra como dependência (binário pronto para Linux, já usado pelo Next.js).
Cada foto ocupa por volta de 50 a 200 KB no banco.

## Critério de aceite e evidência
`packages/dominio/testes/fotos.teste.ts` (PostgreSQL real, imagens geradas no teste): EXIF e GPS
removidos e orientação aplicada; PNG transparente; recusa de SVG, GIF, texto, arquivo quebrado,
foto pequena e excesso de pixels; enviar, trocar, tirar e auditoria; permissões; base64 inválido e
acima de 8 MB; concorrência (uma ativa só); o banco recusa duas ativas. Testes de tela da foto.
