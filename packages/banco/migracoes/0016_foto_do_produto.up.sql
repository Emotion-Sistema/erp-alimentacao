-- Foto do produto (passo 3 do plano de 19/11/2026; decisão 0022).
-- A foto fica no próprio PostgreSQL (a única dependência de dados, decisão 0003): entra no backup
-- junto com o resto, sem outro serviço. O servidor sempre REFAZ a imagem antes de gravar
-- (WebP de até 1200 px, sem os dados escondidos da câmera, como a localização), então o que está
-- aqui é pequeno e seguro de mostrar. Nada se apaga: trocar ou tirar a foto deixa a anterior
-- inativa (histórico); no máximo uma foto ativa por produto.

CREATE TABLE produto_foto (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  produto_id    integer NOT NULL REFERENCES produto (id),
  tipo          text NOT NULL DEFAULT 'image/webp' CHECK (tipo = 'image/webp'),
  conteudo      bytea NOT NULL CHECK (octet_length(conteudo) BETWEEN 1 AND 1048576),
  largura       smallint NOT NULL CHECK (largura BETWEEN 1 AND 1200),
  altura        smallint NOT NULL CHECK (altura BETWEEN 1 AND 1200),
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  ativa         boolean NOT NULL DEFAULT true,
  enviada_por   integer NOT NULL REFERENCES usuario (id),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX produto_foto_ativa ON produto_foto (produto_id) WHERE ativa;
