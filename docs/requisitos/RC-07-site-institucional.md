# RC-07: site institucional (emotionjf.com.br)

**Pedido do cliente (13/11/2026):** site próprio da empresa, com apresentação dos produtos e um
espaço para empresas entrarem em contato.
**Ampliado pelo responsável (18/11/2026):** o domínio será **emotionjf.com.br** (a comprar); o site
terá o **cardápio** e uma área tipo **portfólio para empresas contratarem a E-MOTION**; o Claude
propõe o que mais faz sentido. Versão 2 deste requisito: **proposta, aguardando o "ok" do
responsável** (início previsto: depois da E07). Ampliada em 18/11/2026 com Quem somos, equipe
completa e CMS (seções 3.4 e 4).

Respostas do responsável em 18/11/2026:
- Serviços para empresas: **coffee break e café**, **almoço corporativo** e **eventos no espaço da
  loja**. (Salgados em quantidade não foi marcado: fica fora até ele pedir.)
- Cardápio do site **sem preço**.
- Botão "Peça agora": **iFood e WhatsApp** até o delivery próprio entrar no ar; depois troca sozinho.
- Começar **depois da E07** (o cardápio do site lê os cadastros).

## 1. Endereços (um domínio só)
| Endereço | O que é | Quando |
|---|---|---|
| `emotionjf.com.br` e `www.emotionjf.com.br` | Site institucional (este requisito) | E25 |
| `pedir.emotionjf.com.br` | Delivery e aplicativo do cliente (RC-08) | E26 a E29 |
| `gestao.emotionjf.com.br` | Aplicativos internos | E23 |
| `homologacao.emotionjf.com.br` | Testes (hoje no endereço sslip.io) | quando o domínio existir |

O `www` redireciona para o endereço sem `www` (um endereço só para o Google). Tudo com HTTPS.
Hipótese: domínio registrado no Registro.br, no CPF/CNPJ da empresa, com o dono como titular
(pendência 13). E-mail com o domínio (ex. `contato@` e `eventos@`) é serviço à parte: só com
confirmação específica do responsável.

## 2. Princípio: uma fonte, várias vitrines
O que já existe no sistema **não é digitado de novo** no site:
| Dado | Vem de | Aparece também em |
|---|---|---|
| Produtos, descrição, categoria, ordem | Cadastro de produtos (E07, decisão 0018) | Delivery, TV do salão (RC-02), cardápio impresso |
| Horário da loja e de cada categoria | Horários de venda (decisão 0016) | "Aberto agora", delivery, checklist do turno |
| Esgotado hoje | Disponibilidade calculada (RC-09, E12) | Delivery, aplicativo do atendente |
| Foto, selos, alergênicos | Cadastro de produtos (PR próprio, hipótese da 0018) | Delivery, impresso |
| Pedidos de orçamento | Formulário do site | Gestão → Empresas, sino (RC-18) |

## 3. Páginas
### 3.1 Início
- Foto grande (ou vídeo curto sem som) da casa e dos pratos, com a frase da marca.
- **Selo ao vivo "Aberto agora · cozinha até 23h"** ou "Fechado · abre terça às 10h", calculado dos
  horários cadastrados (segunda fechado).
- Botões **Pedir no iFood** e **Pedir pelo WhatsApp** (mensagem pronta: "Olá, vim pelo site...").
  Quando o delivery próprio estiver no ar, os dois viram **Peça agora** para `pedir.`, e o iFood
  fica como opção secundária (o canal próprio não paga taxa).
- As quatro frentes da casa em cartões: **Cafeteria**, **Almoço**, **Hambúrgueres e porções**,
  **Salgados**, cada um levando à sua parte do cardápio.
- Destaques da semana (produtos marcados como destaque na gestão).
- Faixa "Para sua empresa" com os três serviços e o botão **Pedir orçamento**.
- Faixa da sorveteria 60 Sabores (ver 3.6).
- Depoimentos escolhidos à mão na gestão (com autorização de quem falou).
- Endereço, mapa e horário no rodapé de todas as páginas.

### 3.2 Cardápio (sem preço)
- Por categoria, na ordem do cadastro, com foto, nome, descrição curta e selos (vegetariano,
  picante, novidade, mais pedido).
- Cada categoria mostra o próprio horário ("Almoço: ter a dom, 11h às 15h"), lido do cadastro.
- Depois da E12: produto esgotado aparece como **"Acabou por hoje"** (nunca mostra quantidade).
- Busca e filtro por selo; link direto para cada produto (bom para compartilhar no WhatsApp,
  com imagem do produto na prévia do link).
- **Alergênicos** de cada prato (ver sugestão S1): exibidos com o aviso "pode conter traços".
- Botão no fim: "Gostou? Peça no iFood / WhatsApp".
- O mesmo cardápio serve para o **QR Code da mesa** (sugestão S5). Atenção: na mesa o cliente
  costuma querer ver preço; isso fica para decidir quando o QR for feito.

### 3.3 Para empresas (portfólio)
Página principal com os três serviços, a galeria de trabalhos feitos e um formulário de orçamento.

**Serviços** (uma página para cada, com texto, fotos e perguntas frequentes):
| Serviço | O que mostra |
|---|---|
| **Coffee break e café** | Formatos (ex. café da manhã de reunião, intervalo de treinamento, café da tarde), o que vai em cada um, montagem no local ou entrega, quantidade mínima de pessoas, antecedência |
| **Almoço corporativo** | Almoço para equipes (avulso, para um dia) e **convênio mensal** (a empresa cadastra os funcionários; ver S9), cardápio da semana, entrega ou almoço na casa |
| **Eventos no espaço da loja** | Tipos (confraternização, aniversário, lançamento, reunião), capacidade, o que a casa oferece, fotos do espaço, como reservar |

Valores: **sob consulta** (coerente com o cardápio sem preço). Pacotes com preço podem vir depois,
se o dono quiser.

**Portfólio:** galeria de eventos e entregas feitos (fotos, tipo de serviço, número de pessoas,
mês), logos de empresas atendidas **só com autorização por escrito** delas, depoimentos.
**Como funciona** em 4 passos: pedido de orçamento → conversa e proposta → confirmação → no dia.
**Kit para empresas** em PDF para baixar (gerado com os mesmos textos e fotos do site).

**Formulário de orçamento** (curto, em etapas no celular): serviço, data e horário, número de
pessoas, local (na casa ou na empresa, bairro), restrições alimentares, nome, empresa, CNPJ
(opcional), telefone/WhatsApp, e-mail, observação, consentimento para uso dos dados.

**No sistema (gestão):** cada envio vira uma **oportunidade** em Gestão → Empresas, com situação
(Nova · Em conversa · Proposta enviada · Fechada · Perdida, com motivo), responsável, histórico com
autor e horário (RC-17) e aviso no sino aos cargos escolhidos (RC-18). Nada é apagado. Botão
"Responder pelo WhatsApp" abre a conversa com mensagem pronta (o envio é feito pela pessoa).
Relatório simples: quantos pedidos por mês, quantos fechados, por serviço e por origem.

### 3.4 Quem somos (missão, visão, valores e equipe)
Pedido do responsável em 18/11/2026: uma parte sobre valores e missão, e **todos os funcionários
no site**.

**Nossa essência** (textos escritos pelo dono e editáveis no CMS):
- **Missão** (para que a casa existe), **Visão** (aonde quer chegar) e **Valores** (de 3 a 7, cada um
  com título curto, uma frase e um ícone ou foto que mostra o valor na prática).
- **Nossa história** em linha do tempo: abertura, marcos, novidades, com foto e ano.
- **Como trabalhamos**: compromissos visíveis (ex. ingredientes frescos, fornecedores de Juiz de
  Fora, cozinha organizada). Só o que a casa faz de verdade.
- Os valores também aparecem em pequenos trechos no Início e na área para empresas.

**Nossa equipe** (todos os funcionários):
- Um cartão por pessoa: foto, **primeiro nome** (ou apelido escolhido por ela), função, setor,
  tempo de casa ("desde 2024") e, se ela quiser, uma frase curta e o "prato preferido da casa".
- Organizada por setor: Cozinha, Hambúrgueres e grelhados, Cafeteria, Salão e atendimento, Caixa,
  Entregas, Gestão. Fotos de grupo por setor e dos bastidores.
- **Ligada ao cadastro de funcionários do sistema** (E03): quem é contratado aparece como
  "convite pendente"; quem é desligado **sai do site no mesmo dia, sozinho**. Ninguém digita a
  equipe duas vezes.
- **Autorização de cada pessoa:** nome e imagem de funcionário são dados pessoais. A pessoa só
  aparece depois de assinar a autorização de uso de imagem (modelo validado pelo jurídico ou
  contador da empresa) e pode retirar a qualquer momento; o sistema guarda quem autorizou, quando e
  qual texto. A meta é ter **todos** no site, mas quem não autorizar não aparece (nem sem foto):
  a página mostra só quem autorizou e o setor continua completo nas fotos de grupo autorizadas.
- A pessoa pode revisar o próprio cartão pelo aplicativo dela (frase e prato) e o gestor aprova
  antes de publicar.
- Nunca vai para o site: sobrenome (salvo pedido da pessoa), salário, turno, telefone, e-mail,
  documentos, login ou cargo de permissão no sistema.
- Opcional (decidir depois): "Destaque do mês", aniversário de casa, vagas abertas ligando ao
  Trabalhe conosco.

### 3.5 Visite / Contato
Endereço, mapa, como chegar, estacionamento, acessibilidade, horário (do cadastro, com feriados
e pausas), WhatsApp, Instagram, telefone, formulário de contato geral (vira mensagem na gestão).
O mapa é uma imagem com link para o Google Maps (não carrega nada do Google até a pessoa tocar).

### 3.6 Sorvetes 60 Sabores
Página de apresentação da franquia dentro do site, seguindo o manual de marca dela. **Só com
autorização da franqueadora** (pendências 32 a 34). Os sabores não vêm deste sistema (RC-11).

### 3.7 Trabalhe conosco (evolução)
Formulário simples com envio de currículo; os dados ficam guardados por prazo definido (hipótese:
6 meses) e depois são anonimizados. Visível só para dono, administrador e gerente geral.

### 3.8 Privacidade, termos e página "não encontrada"
Política de privacidade e termos (texto validado pelo cliente). Sem cookies de rastreamento: não
precisa de faixa de cookies. Página 404 com a cara da marca e atalhos para cardápio e contato.

## 4. CMS: painel para configurar tudo do site (Gestão → Site)
Pedido do responsável em 18/11/2026: **tudo que aparece no site se configura num painel**, sem
programador. O CMS é parte da gestão (mesmo login, mesmo banco, decisão 0003), não um serviço de
fora.

### 4.1 O que se configura
| Área do CMS | O que dá para mudar |
|---|---|
| **Páginas** | Criar página nova a partir de modelos (serviço, evento, campanha, página livre), mudar título, endereço e ordem no menu, esconder ou mostrar |
| **Blocos de cada página** | Montar a página com blocos e mudar a ordem arrastando: faixa com foto, texto, galeria, vídeo, cartões, depoimentos, perguntas frequentes, equipe, valores, linha do tempo, botão de ação, mapa, formulário, destaques do cardápio |
| **Textos e fotos** | Todos os textos de todas as páginas; biblioteca de fotos e vídeos com busca, texto alternativo e corte para celular |
| **Menu e rodapé** | Itens do menu, links, endereço, telefone, WhatsApp, Instagram, iFood |
| **Início** | Foto ou vídeo principal, frase, destaques da semana, faixas e a ordem das seções |
| **Cardápio no site** | O que aparece vem do cadastro; no CMS: esconder um produto só do site, marcar destaque, escolher foto do site, texto extra da categoria, "Hoje no almoço" (S2) |
| **Para empresas** | Serviços, o que inclui cada um, perguntas frequentes, portfólio (evento, fotos, nº de pessoas, empresa com autorização), depoimentos, kit em PDF |
| **Quem somos** | Missão, visão, valores, história, compromissos |
| **Equipe** | Aprovar cartões, ordem por setor, fotos de grupo, ver quem falta autorizar |
| **Avisos e campanhas** | Faixa no topo ou aviso de abertura ("fechado no feriado", "festival do hambúrguer") com **data e hora para entrar e sair sozinho** |
| **Formulários** | Para quem vai o aviso no sino, texto de agradecimento, campos opcionais ligados ou desligados (os obrigatórios ficam travados) |
| **Busca e compartilhamento** | Título e descrição de cada página para o Google, imagem da prévia no WhatsApp |
| **Aparência** | Só entre as variações já aprovadas da marca (Espuma e Brasa): escolher foto de fundo, faixa clara, dourada ou escura. Cor livre não, para não quebrar o contraste conferido |
| **Textos legais** | Privacidade e termos (com data da versão) |

Não se configura no CMS (vem do sistema e só muda lá): produtos, categorias, horários, o que está
esgotado e a lista de funcionários.

### 4.2 Como funciona
- **Rascunho → pré-visualização (celular e computador) → publicar** ou **agendar** para data e hora.
- **Histórico de versões** de cada página com autor e horário (RC-17) e botão "voltar para esta
  versão". Nada se apaga: página removida fica arquivada.
- **Quem edita e quem publica** podem ser pessoas diferentes: o editor deixa pronto e o
  publicador aprova (aviso no sino).
- Fotos enviadas pelo celular; o sistema reduz, gera os tamanhos e avisa se faltar texto
  alternativo. Tamanho máximo por arquivo e só imagem e vídeo.
- Conferência automática antes de publicar: link quebrado, foto sem descrição, texto grande demais
  para o celular, página sem título para o Google.
- Mudança publicada aparece no site em até 1 minuto.
- Permissões novas (hipótese, ligar pela skill `matriz-de-permissoes`): `site.editar` (dono,
  administrador, gerente geral), `site.publicar` (dono e administrador), `empresas.ver` e
  `empresas.gerenciar` (dono, administrador, gerente geral), `equipe.site` (aprovar cartões:
  dono e administrador).

## 5. Regras
- O site **lê** do sistema por uma "vitrine" própria: só os campos públicos (nome, descrição,
  categoria, foto, selos, horário, esgotado sim/não). Usuário do banco só de leitura, sem acesso a
  custo, estoque, pedidos ou pessoas. Preço não sai (decisão de 18/11/2026).
- Páginas geradas com antecedência e guardadas em cache: o site continua no ar mesmo se a gestão
  estiver em manutenção; mudança publicada aparece em até 1 minuto.
- Formulários: validação no servidor, limite de envios por endereço, campo-armadilha contra robôs
  (sem captcha de terceiros), consentimento registrado, nenhum dado interno na resposta.
- Rápido em celular comum e 4G fraco; acessível (contraste da paleta já conferido, navegação por
  teclado, textos alternativos nas fotos).
- Bom para busca: título e descrição por página, dados estruturados de restaurante, cardápio e
  serviços, mapa do site, prévia bonita ao compartilhar.
- Marca: paleta Espuma e Brasa aprovada (`cerebro/empresa/paleta-da-marca/`), claro por padrão e
  escuro só se o aparelho do visitante estiver escuro.
- Medição própria e sem cookies (visitas por página, cliques em iFood e WhatsApp, orçamentos
  enviados), guardada no nosso banco e mostrada ao gestor. Nada enviado a terceiros.
- Checklist de toda página pública: skill `pagina-publica`.

## 6. Sugestões do Claude (além do pedido)
| # | Sugestão | Por que vale | Classificação proposta |
|---|---|---|---|
| S1 | **Alergênicos calculados da ficha técnica**: cada ingrediente marca o que contém (glúten, leite, ovo, amendoim...) e o prato herda sozinho | Segurança do cliente; nunca fica desatualizado (mesmo princípio do RC-09) | evolução (depois da ficha técnica, E08) |
| S2 | **"Hoje no almoço"**: o gerente marca o prato do dia na gestão e ele aparece no site e na TV | Almoço muda todo dia; hoje isso se faz em story | núcleo do site |
| S3 | **Cardápio impresso em PDF gerado do cadastro**, com a marca | Muda o produto, o impresso já sai certo | evolução |
| S4 | **Google Perfil da Empresa** cuidado e ligado ao site (horário igual ao do sistema) | É por onde a maioria acha restaurante na cidade | 👉 ação do responsável, sem código |
| S5 | **Cardápio por QR Code na mesa** (mesma página) | Reaproveita tudo; já estava na lista | evolução |
| S6 | **Reserva de mesa e do espaço** com calendário, ligada ao mapa de mesas do caixa (RC-13) | Eventos e grupos sem troca de mensagens | evolução |
| S7 | **Agenda** (música ao vivo, festival do hambúrguer, datas especiais) | Motivo para voltar ao site e ao salão | evolução |
| S8 | **Avalie a gente**: QR no recibo leva à avaliação no Google | Aumenta as notas e a busca | evolução |
| S9 | **Convênio de almoço para empresas**: cadastro da empresa, funcionário pede, fatura mensal | Receita fixa e previsível | evolução grande (toca financeiro, RC-15) |
| S10 | **Proposta em PDF montada na gestão** a partir da oportunidade (serviço, itens, data) | Responde à empresa no mesmo dia | evolução |
| S11 | **Vale-presente** E-MOTION | Datas comemorativas e brinde de empresa | adiar (toca pagamento e financeiro) |
| S12 | **Clube E-MOTION** (pontos) junto com o delivery próprio | Traz cliente do iFood para o canal próprio | evolução (com RC-08) |
| S13 | Aviso de espera no salão ("agora: ~15 min") vindo da fila da cozinha (RC-10) | Cliente decide vir na hora certa | adiar (depois da E16) |

## 7. Ordem de construção proposta (E25 em PRs pequenos)
| PR | Entrega | Quem revisa |
|---|---|---|
| E25.1 | Casca com a marca, Início, Sobre, Visite, privacidade, 404, títulos e mapa do site; "Aberto agora" pelos horários | construtor; Opus revisa |
| E25.2 | Cardápio sem preço lido da vitrine (usuário só de leitura), páginas por produto, cache | Opus; **revisor** (superfície pública) |
| E25.3 | Para empresas: 3 páginas de serviço, portfólio, formulário → oportunidade, Gestão → Empresas, sino | Opus; **revisor** (dados pessoais, público) |
| E25.4 | CMS base: páginas, blocos, textos, fotos, menu, rascunho, prévia, publicar, agendar, versões, editor x publicador | Opus; **revisor** (permissões, envio de arquivo) |
| E25.5 | CMS completo: avisos com data, cardápio no site, "Hoje no almoço" (S2), Quem somos (missão, visão, valores, história) | construtor; Opus revisa |
| E25.6 | Equipe no site ligada ao cadastro de funcionários, autorização de imagem registrada, saída automática no desligamento | Opus; **revisor** (dados pessoais) |
| E25.7 | Medição própria, dados estruturados, kit para empresas em PDF, teste de carga leve | Opus; **revisor** |
| depois | Foto e selos no cadastro de produto (PR próprio da 0018), alergênicos (S1), 60 Sabores, Trabalhe conosco e as evoluções da seção 6 | conforme o caso |

O site vai para a **homologação** primeiro (endereço de teste). Só entra no domínio real com
**"Publique tudo"**, depois de o domínio comprado apontar para o servidor de produção (E23).

## Fora desta entrega
Blog, loja com envio por correio, área de franquias, outros idiomas, preço no site.

## Critério de aceite
1. Mudar um produto, categoria ou horário na gestão reflete no site em até 1 minuto, sem digitar
   de novo.
2. O formulário de empresas cria uma oportunidade visível na gestão, com aviso no sino, e um envio
   repetido (duplo toque) não cria duas.
3. Nenhuma resposta pública contém preço, custo, estoque, dado de pessoa ou identificador interno
   (teste automático confere).
4. Páginas carregam bem em celular comum; com a gestão desligada, o site continua respondendo.
5. Excesso de envios do mesmo endereço é recusado; robô que preenche o campo-armadilha é ignorado.
6. Todo texto, foto, bloco, menu e aviso do site muda pelo CMS, com rascunho, prévia, publicação
   agendada e volta à versão anterior; quem não tem `site.publicar` não publica (teste no servidor).
7. Funcionário sem autorização registrada não aparece; desligado ou que retirou a autorização sai
   do site no mesmo dia; nenhum dado além do cartão público sai na resposta.
