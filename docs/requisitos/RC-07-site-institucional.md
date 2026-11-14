# RC-07: site institucional

**Pedido do cliente:** site próprio da empresa, com áreas como apresentação de produtos e
um espaço para empresas entrarem em contato.

## Estrutura proposta
| Área | Conteúdo | De onde vem |
|---|---|---|
| Início | Quem é a casa, destaques, botão "Peça agora" | Editável no sistema |
| Cardápio / produtos | Vitrine por categoria (cafeteria, almoço, lanches), fotos, descrição, alergênicos | **Mesmo cadastro do sistema** (sem digitar duas vezes) |
| Sorvetes 60 Sabores | Página de apresentação da franquia, seguindo as regras de marca dela | Editável (os sabores não vêm deste sistema, RC-11) |
| Para empresas | Encomendas, eventos, coffee break, convênio de almoço; formulário de contato | Formulário vira oportunidade no sistema, com responsável e andamento |
| Sobre e contato | História, endereço, mapa, horário, redes sociais | Editável |
| Trabalhe conosco | Formulário simples | Evolução |
| Termos e privacidade | Textos obrigatórios | Fornecidos/validados pelo cliente |

"Subsites" são seções do mesmo site (ou subdomínios do mesmo domínio), não sites separados.

## Regras
- Conteúdo que já existe no sistema (produtos, preços, horário, disponibilidade) é lido
  dele. Preço mostrado no site é o do canal correspondente.
- Textos, banners e fotos institucionais são editáveis por perfil autorizado, com
  pré-visualização e publicação (rascunho -> publicado).
- Rápido no celular, acessível, bom para busca (títulos, descrições, dados estruturados
  de restaurante e cardápio, mapa do site).
- Formulários com validação no servidor, proteção contra envio automático e consentimento
  para uso dos dados. Nada de dado interno exposto.
- Identidade visual por variáveis de tema (ver `cerebro/empresa/identidade-visual.md`).
- O site continua no ar mesmo se o sistema interno estiver em manutenção (páginas geradas
  com antecedência e cache).

## Fora desta entrega
Blog, loja de produtos com envio por correio, área de franquias, múltiplos idiomas.

## Critério de aceite
Mudar um produto no sistema reflete na vitrine; formulário de empresas cria oportunidade
visível para o gestor; páginas carregam bem em celular comum; nenhum dado sensível nas
respostas públicas.
