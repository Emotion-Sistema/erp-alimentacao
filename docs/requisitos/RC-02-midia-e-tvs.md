# RC-02: central de mídia e TVs

**Pedido do cliente:** escolher vídeos de comida dentro do sistema e publicar nas TVs,
por tela ou grupo, com agenda por horário e setor.

## Primeira versão: piloto com duas telas independentes
- Biblioteca: envio de vídeos e imagens autorizados, miniatura, duração, orientação, validade.
- Grupos de telas (salão, cafeteria e outros), com nome e código por tela e pareamento seguro.
- Playlists com ordem e duração; agenda por faixa de horário.
- Publicação com rascunho e histórico de quem publicou; reversão para a versão anterior.
- Estado de cada tela: última conexão, versão publicada, baixada e em execução.
- Conteúdo de contingência: o player continua com o que já baixou; campanha vencida não é exibida.

## Desenho técnico
As telas não conversam entre si: cada player consulta o sistema central. O player é uma
página do próprio ERP, aberta em modo quiosque em um aparelho dedicado validado (não o
navegador de uma Smart TV doméstica), que baixa os arquivos antes de exibir e os mantém
em cache local. O servidor cuida de catálogo, permissão e agenda; os arquivos ficam em
armazenamento próprio para mídia. Não transmitir vídeo continuamente a partir do servidor
do caixa, nem converter vídeo nele.

Alternativa se o player próprio der manutenção demais: plataforma pronta de sinalização
com API. Decidir depois do piloto, com base em falhas reais.

## Limites que precisam ficar claros para o cliente
| Necessidade | O que atende | Observação |
|---|---|---|
| Conteúdo diferente por TV | Um player por tela | É o piloto |
| Mesmo vídeo em várias telas | Mesma playlist | Pode ficar defasado: não é sincronismo |
| Vídeos sincronizados | Player e software com sincronismo próprio, rede cabeada | Evolução |
| Mesmo sinal espelhado | Um player com distribuidor HDMI | Depende de distância e dos painéis |
| Uma imagem dividida entre TVs | Video wall | Evolução, solução específica |
| Ligar e desligar a TV | Depende do modelo e da interface | Player online não prova TV ligada |

Player em execução comprova reprodução, não atenção do público nem aumento de venda.
Tela promocional é separada da tela de produção e do painel de retirada; nenhuma exibe
dado pessoal desnecessário.

## Evolução
Preço vindo do cadastro na tela; troca automática de campanha quando o produto falta;
aprovação em duas etapas; layouts com QR Code; mais telas; sincronismo.

## Critério de aceite (no equipamento real)
Parear a tela, publicar, reiniciar o player, desconectar a internet, deixar a campanha
expirar e recuperar a conexão. Só vale a combinação de TV, player e rede efetivamente testada.
