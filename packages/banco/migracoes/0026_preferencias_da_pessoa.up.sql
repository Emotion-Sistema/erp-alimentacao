-- 0026: preferências de tela de cada pessoa (decisão 0030; frente visual-limpo, parte 4). Só adiciona.
-- Tema claro ou escuro e letra normal ou grande, guardados no usuário: a escolha vale em qualquer
-- aparelho em que a pessoa entrar. Quem nunca escolheu fica no claro, com letra normal (como hoje).
ALTER TABLE usuario
  ADD COLUMN tema text NOT NULL DEFAULT 'claro' CHECK (tema IN ('claro', 'escuro')),
  ADD COLUMN letra text NOT NULL DEFAULT 'normal' CHECK (letra IN ('normal', 'grande'));
