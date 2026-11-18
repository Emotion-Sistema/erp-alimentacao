---
name: pagina-publica
description: Conferir toda página, rota ou formulário que o público acessa (site emotionjf.com.br, delivery, app do cliente, QR Code da mesa) antes do PR. Use SEMPRE que a tarefa criar ou mudar algo em apps/site ou apps/loja, um formulário aberto ao público, uma rota de API sem login, a "vitrine" que o site lê, ou quando o responsável falar em site, cardápio online, SEO, Google ou "para empresas".
---

# Página pública

Tudo que o público vê é vitrine e porta de entrada ao mesmo tempo. Confira cada item e
registre o resultado no PR (skill `checklist-pr`). Item que não se aplica: escreva "não se aplica".

## 1. Nada de dado interno
- O site lê só pela vitrine (usuário do banco só de leitura, apenas campos públicos).
- A resposta não leva: preço (decisão de 18/11/2026 para o site), custo, saldo, quantidade,
  identificador interno, nome de funcionário, e-mail ou telefone de cliente, mensagem de erro técnica.
- Teste automático que procura esses campos na resposta pública (critério 3 do RC-07).

## 2. Formulários
- Validação no servidor (o que a tela valida não conta como proteção).
- Limite de envios por endereço e por minuto; campo-armadilha contra robôs; sem captcha de terceiros.
- Envio repetido (duplo toque, recarregar) não cria dois registros: chave de idempotência.
- Consentimento registrado com data e texto aceito. Só os campos necessários.
- Resultado vira registro na gestão com autor "site" e horário (RC-17) e aviso no sino (RC-18).

## 3. Continua no ar
- Página gerada com antecedência e cache; com a gestão desligada o site ainda responde.
- Mudança publicada na gestão aparece em até 1 minuto.

## 4. Celular, acessibilidade e marca
- Testada em largura de celular (360 px) e em rede lenta; fotos em tamanhos certos e com texto alternativo.
- Cores só pelas variáveis do tema (paleta Espuma e Brasa); claro por padrão, escuro se o aparelho estiver escuro.
- Navegável por teclado; contraste mínimo de 4,5:1 no texto.
- Linguagem simples, em português, no tom da casa.

## 5. Busca e compartilhamento
- Título e descrição únicos por página; dados estruturados (restaurante, cardápio, serviço) válidos.
- Mapa do site atualizado; prévia com imagem ao compartilhar no WhatsApp.
- Endereço único (sem `www`, com HTTPS); página 404 da marca.

## 6. Privacidade e terceiros
- Nada de cookie de rastreamento nem script de terceiros carregando sozinho (mapa só ao tocar).
- Medição própria, no nosso banco. Nenhum serviço novo pago sem confirmação do responsável.
- Dados reais de clientes nunca em testes.

## 7. Antes do merge
- Superfície pública nova ou formulário com dado pessoal passa pelo subagente `revisor`.
- Nada vai para o domínio real sem "Publique tudo" (skill `publicar`).
