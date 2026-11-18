import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak, CondPageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont("DV", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
from reportlab.lib.fonts import addMapping
addMapping("DV",0,0,"DV"); addMapping("DV",1,0,"DVB"); addMapping("DV",0,1,"DV"); addMapping("DV",1,1,"DVB")

ESC = colors.HexColor("#1f2a37")
CINZA = colors.HexColor("#6b7280")
CLARO = colors.HexColor("#fdf0e6")
LINHA = colors.HexColor("#d1d5db")
DEST = colors.HexColor("#E77019")
LOGO = "/home/user/erp-alimentacao/cerebro/empresa/fichas-tecnicas/logo-provisoria/logo-emotion-branco.jpg"
SIMB = "/home/user/erp-alimentacao/cerebro/empresa/fichas-tecnicas/logo-provisoria/logo-emotion-simbolo-branco.jpg"

base = ParagraphStyle("b", fontName="DV", fontSize=9, leading=12.2, textColor=ESC)
peq = ParagraphStyle("p", parent=base, fontSize=8, leading=10.4)
peqb = ParagraphStyle("pb", parent=peq, fontName="DVB")
tit = ParagraphStyle("t", parent=base, fontName="DVB", fontSize=17, leading=21, spaceAfter=2)
sub = ParagraphStyle("s", parent=base, textColor=CINZA, fontSize=9, spaceAfter=10)
h = ParagraphStyle("h", parent=base, fontName="DVB", fontSize=11.5, leading=15, spaceBefore=10, spaceAfter=5, textColor=DEST)
item = ParagraphStyle("i", parent=base, leftIndent=12, bulletIndent=2, spaceAfter=2.5)

def P(t, s=base): return Paragraph(t, s)

def tabela(linhas, larguras, cab=True):
    dados = [[P(c, peqb if (cab and i == 0) else peq) for c in l] for i, l in enumerate(linhas)]
    t = Table(dados, colWidths=larguras, repeatRows=1 if cab else 0)
    est = [("GRID", (0, 0), (-1, -1), 0.4, LINHA),
           ("VALIGN", (0, 0), (-1, -1), "TOP"),
           ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
           ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]
    if cab:
        est.append(("BACKGROUND", (0, 0), (-1, 0), CLARO))
    t.setStyle(TableStyle(est))
    return t

def lista(itens):
    return [P(x, item) for x in itens]

def rodape(c, d):
    c.saveState()
    c.setStrokeColor(DEST); c.setLineWidth(0.8); c.line(18 * mm, 14.5 * mm, A4[0] - 18 * mm, 14.5 * mm)
    c.drawImage(SIMB, 18 * mm, 7.2 * mm, width=10.5 * mm, height=10.5 * mm * 555 / 900)
    c.setFont("DV", 7.5); c.setFillColor(CINZA)
    c.drawString(31 * mm, 10 * mm, "E-MOTION · Fichas técnicas: análise e ajustes · 18/11/2026 · Wilians Duque, programador do sistema")
    c.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Página {d.page}")
    c.restoreState()

doc = SimpleDocTemplate(sys.argv[1], pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                        topMargin=16 * mm, bottomMargin=17 * mm,
                        title="Fichas técnicas: análise e ajustes", author="E-MOTION")
W = A4[0] - 36 * mm
s = []

from reportlab.platypus import Image as RLImage
_lw = 42 * mm
_logo = RLImage(LOGO, width=_lw, height=_lw * 1389 / 1600)
_cab = Table([[[P("Fichas técnicas: análise e ajustes", tit),
                P("Leitura das 59 fichas e cruzamento com o cardápio atual. O que está bom, o que está errado, o que falta e as perguntas que preciso que sejam respondidas.", sub)], _logo]],
             colWidths=[W - _lw - 6 * mm, _lw + 6 * mm])
_cab.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                          ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                          ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
s += [_cab]

s.append(tabela([
    ["Fichas", "Completas", "Com pendência", "Fichas fora do cardápio", "Produtos do cardápio sem ficha"],
    ["59", "4 (11, 13, 24, 31)", "55", "15", "cerca de 100"]],
    [W * .12, W * .2, W * .17, W * .22, W * .29]))

s.append(P("1. O que já está bom", h))
s += lista([
    "• Formato padronizado: ingredientes, etapas, equipamentos e observações em todas as fichas.",
    "• Coquetéis com doses em ml; bebidas simples (vitamina, suco de laranja) completas.",
    "• <b>Cheese Tudo (22)</b> pesado item a item: é o modelo para os outros hambúrgueres.",
    "• Perdas medidas no bacon (52,6%) e na batata frita (44%).",
])

s.append(CondPageBreak(55 * mm)); s.append(P("2. Erros que se repetem", h))
s.append(tabela([
    ["Problema", "Fichas"],
    ["Medida caseira ou “a gosto” no lugar do peso (colher, pitada, folha, “1 molho”, “ponta de faca”, “quanto baste”)", "2, 3, 4, 5, 6, 7, 9, 10, 12, 19, 20, 21, 23, 30, 38, 49, 50, 53"],
    ["Tempo total ausente ou só de uma etapa", "1, 9, 12, 14, 19 a 21, 23, 25 a 27, 39, 40, 44 a 50, 52 a 55, 58, 59"],
    ["Rendimento ausente", "10, 12, 19, 20, 21, 50"],
    ["Porção sem peso", "3, 4, 5, 6, 8, 10, 52, 53"],
    ["Peso final é só a soma dos crus (não foi pesado pronto)", "22, 47, 48"],
    ["Óleo de fritura pelo volume da fritadeira ou sem registro", "16, 17, 18, 20, 23, 49, 52"],
    ["Gelo, decoração e guarnição sem peso", "27, 28, 29, 30, 32 a 38"],
    ["Ingrediente citado no preparo e ausente da lista", "2 (amido), 3 (pimentões), 12 (sal), 33 (limão, hortelã), 35 (gengibre, pimenta-da-jamaica), 44 (sal)"],
    ["Opcional sem dose", "31 (gelo, açúcar), 36 (sal da borda), 37 (clara), 39 e 40 (caldas), 58 (calda de licor)"],
    ["Pesagem de 1 unidade no lugar do lote", "42, 43"],
    ["Mesmo item com nomes diferentes", "frango x peito de frango; bacon fatiado x em cubos; óleo x óleo de algodão; muçarela ralada x fatiada"],
    ["Ficha diferente do cardápio", "22 (presunto x peito de peru); 19, 21, 22 (sem a batata que acompanha); 28 a 31 (250 ml x 300 ml)"],
], [W * .55, W * .45]))

s.append(CondPageBreak(55 * mm)); s.append(P("3. Inconsistências pontuais", h))
s.append(tabela([
    ["Ficha", "O que não fecha", "Pergunta"],
    ["22 Cheese Tudo", "Presunto na ficha; peito de peru no cardápio", "23"],
    ["19, 21, 22 Hambúrgueres", "Cardápio inclui 150 g de batata frita; a ficha não", "24"],
    ["28 a 31 Sucos", "Fichas rendem 250 ml; cardápio vende 300 ml", "25"],
    ["11 x 22 Bacon", "Fatia pronta: 11,5 g pelo lote; 14 g no Cheese Tudo", "10"],
    ["17 Batata com queijo", "225 g + 75 g = 300 g; ficha diz 265 g", "11"],
    ["18 Batata, queijo e bacon", "Soma 330 g; ficha diz 300 g", "11"],
    ["5 x 54 Bechamel", "Duas receitas diferentes para o mesmo molho", "12"],
    ["8 Carne cozida", "Tempero de alho: 50 g ou 150 g por kg (900 g)", "13"],
    ["15 Maionese caseira", "Vinagre: 5 ml ou 1 colher de sopa (15 ml)", "14"],
    ["48 Cigarrete", "Soma 140 g; anotado 160 g", "15"],
    ["51 Broa", "Cinco quantidades “300” sem unidade", "16"],
    ["50 Massa assada", "“1.100 kg” de farinha; fermento 10 g ou 30 g", "17"],
    ["Bola de sorvete", "50 g, 60 g ou 80 g, conforme a ficha", "18"],
    ["43 Pão de queijo", "“2 de cada sabor” sem dizer quantos sabores", "19"],
    ["45 Creme Triplo Cheese", "Entram 420 g e saem 350 g; não tem modo de preparo", "—"],
    ["25 Affogato · 26 Cappuccino Avelã", "Soma não bate com o peso anotado (80 x 69,5 g; 157 x 175 g)", "—"],
    ["29 Limonada suíça", "370 ml de líquido para 250 ml servidos", "—"],
    ["1 Arroz", "“5 kg = 80 pratos”, mas a conta dá 83", "—"],
], [W * .26, W * .62, W * .12]))


s.append(CondPageBreak(55 * mm)); s.append(P("4. O que falta nas fichas pendentes", h))
s.append(tabela([
    ["Grupo", "Falta"],
    ["Almoço", "Pesar temperos e medidas caseiras (2, 3, 4, 5, 6, 7, 9, 10); peso da porção (3, 6, 8, 52, 53); tempo (1, 44, 52, 53, 54); nhoque e molho ao sugo (54); montagem da parmegiana (52)."],
    ["Grill", "Óleo gasto (16 a 18, 20, 23); pesos dos hambúrgueres 19 e 21 (usar os da 22); goiabada (14); rendimento do torresmo (20) e da Batata do Magela (12); gemas e tempero do bolinho (23)."],
    ["Cafeteria e bar", "Gelo em todos os sucos e drinks; Nutella, chantilly, caldas e Ovomaltine (39, 40, 56, 57); cappuccino com avelã (27); tempo (25 a 27, 39, 40, 55, 58); hortelã e água com gás (30, 38)."],
    ["Salgados", "Peso da massa por unidade (46); peso pronto (47, 48); medidas da massa de coxinha e da assada (49, 50); recheio e empanamento; peso dos pães de queijo (41 a 43, 59)."],
], [W * .18, W * .82]))

s.append(CondPageBreak(55 * mm)); s.append(P("5. Fichas que faltam criar (estão no cardápio)", h))
s.append(tabela([
    ["Grupo", "Produtos sem ficha"],
    ["Almoço", "Frango com quiabo, costelinha, sobrecoxa assada, churrasco misto, carne assada; arroz ao alho, com brócolis, piamontese e temperado; angu, tutu, couve, salpicão, vinagrete, maionese, saladas, legumes na manteiga, feijão; as 10 proteínas dos executivos."],
    ["Hambúrgueres", "Cheddar Burguer, Cheese Bacon, Cheese Egg, os 4 de frango e os 11 especiais. Preparos: geleia de bacon, cebola caramelizada, molho gorgonzola, molho de mostarda e mel, costela desfiada, frango grelhado e empanado, bife smash e de 150 g, “cama de bacon”."],
    ["Espetos e porções", "Espetos de frango, coração e alcatra; os 3 medalhões; canjiquinha e vaca atolada; porções de contrafilé e picanha; bolinho de feijoada; frango com fritas; tilápia; mandioca frita e linguiça do trio mineiro."],
    ["Cafeteria", "Café com leite, pastel gaúcho, hambúrguer assado, misto quente (simples e duplo), cookies, recheio da coxinha (frango e catupiry), calda quente e licor da torta."],
    ["Bebidas e bar", "Sucos especiais e jarras; as 14 caipis; Expresso Martini, Negroni, Medusa, Aperol Spritz, gin e tônica, Gin Tropical, Piña Colada, Sex on the Beach, coquetel não alcoólico e coquetel clássico (se não for um dos que já têm ficha). Refrigerantes, cervejas, águas e doses são revenda: não precisam de receita."],
], [W * .18, W * .82]))

s.append(CondPageBreak(55 * mm)); s.append(P("6. Fichas que não aparecem no cardápio", h))
s.append(P("3 antepasto, 10 molho para salada, 12 Batata do Magela, 17 batata com queijo, 25 affogato, 26 e 27 cappuccinos 60 Sabores, 30 abacaxi com hortelã, 32 Cosmopolitan, 34 Aviation, 35 Christmas Punch, 37 Whiskey Sour, 42 pão de queijo 3 queijos, 51 broa, 59 mini pães de queijo. Ver pergunta 28."))

s.append(CondPageBreak(55 * mm)); s.append(KeepTogether([P("7. Ordem de correção", h)] + lista([
    "<b>1.</b> Preparos da casa usados em outras fichas: tempero (4), maionese (15), bechamel (5), farofa (13), massas (49, 50).",
    "<b>2.</b> Hambúrgueres e batatas (16 a 22): dependem dos preparos acima e se repetem em muitos produtos.",
    "<b>3.</b> Refeições do dia e executivos.",
    "<b>4.</b> Cafeteria e sobremesas.",
    "<b>5.</b> Bar.",
    "<b>6.</b> Fichas novas, na mesma ordem.",
]) + [Spacer(1, 6), P("Ficha corrigida volta para a pasta <b>Prontas</b> no Drive. ", peq)]))


s.append(CondPageBreak(55 * mm)); s.append(P("8. Perguntas pendentes", h))
s.append(P("Responder no espaço abaixo de cada pergunta.", peq))
s.append(Spacer(1, 4))
PERG = [
 ("Ingredientes e compras", [
  "Fruta, alface e bife de hambúrguer: podem ser controlados sempre em gramas? Qual o peso médio de 1 unidade de cada fruta usada?",
  "Açaí, leite condensado, chantilly, creme de leite e molho de tomate: controlar em g ou em ml?",
  "São o mesmo item ou itens diferentes: frango e peito de frango; bacon fatiado e em cubos; muçarela ralada e fatiada; batata pequena e batata; licor de laranja (Margarita) e Cointreau; óleo e óleo de algodão?",
  "“Tempero da casa” (6, 52), “tempero de alho” (8), “tempero de alho e sal” (44), “pasta de alho” (12) e “tempero” (9, 23) são a ficha 4 (Tempero) ou produtos comprados?",
  "A maionese dos hambúrgueres é a caseira da ficha 15? (O cardápio diz “maionese caseira”.)",
  "Os sorvetes das fichas (Rafaello, Kinder, chocolate com avelã, creme) vêm da 60 Sabores? Se sim, como entram no estoque da casa?",
  "Gelo e água filtrada devem ser controlados no estoque?",
  "Comprados prontos ou feitos na casa: brownie, bife de hambúrguer (“artesanal” no cardápio), nhoque, molho ao sugo, torta (inteira? quantas fatias)?",
  "Embalagens de compra: lata de milho (g), caixa de creme de leite (200 g ou 200 ml), molho de tomate (ml), tablete de caldo (g)?",
 ]),
 ("Números que não fecham", [
  "Cheese Tudo (22): as 2 fatias de bacon (28 g) são peso cru ou pronto?",
  "Batata com queijo (17): vale 265 g ou 300 g? Com bacon (18): 300 g ou 330 g?",
  "Bechamel: vale a ficha 5 ou a receita da ficha 54? Ou são dois molhos?",
  "Carne cozida (8): tempero de alho 50 g no total ou 150 g por kg?",
  "Maionese caseira (15): vinagre 5 ml ou 1 colher de sopa?",
  "Cigarrete (48): 140 g ou 160 g? Falta algum ingrediente?",
  "Broa (51): os cinco “300” (fubá, açúcar, leite, farinha, óleo) são g ou ml?",
  "Massa para salgado assado (50): farinha 1.100 g? Fermento 10 g ou 30 g?",
  "Bola de sorvete: 50 g, 60 g ou 80 g? Uma medida só ou depende do prato?",
  "Pão de queijo (43): quantos sabores entram na porção de “2 de cada”?",
 ]),
 ("Organização", [
  "Quais produtos vendem mais? (Para priorizar as correções.)",
  "Existe o “levantamento geral” dos produtos sem ficha citado na auditoria? Onde está?",
  "“Massa comum dos salgados” (46, 47, 48) é a massa da ficha 50?",
 ]),
 ("Cardápio x fichas", [
  "Cheese Tudo: vale presunto (ficha) ou peito de peru (cardápio)?",
  "Os 150 g de batata frita que acompanham os hambúrgueres são crus (congelados)? Podem entrar nas fichas 19, 21 e 22?",
  "Sucos: 250 ml (fichas) ou 300 ml (cardápio)?",
  "O café coado do cardápio é o drip (55)? O cappuccino da casa é o tradicional (56)?",
  "O pão de queijo do cardápio é o da ficha 43 ou o 3 queijos (42)?",
  "Fichas fora do cardápio (3, 10, 12, 17, 25 a 27, 30, 32, 34, 35, 37, 42, 51, 59): manter no cardápio, uso interno ou arquivar? “Coquetel clássico” é uma delas?",
  "Adicional de feijão: R$ 2,00 (refeições do dia) e R$ 4,00 (executivos). Os dois estão certos?",
  "Doses de Cachaça Prata da Casa e Campari: quantos ml?",
 ]),
]
pq = ParagraphStyle("pq", parent=base, fontSize=8.8, leading=11.5)
n = 0
for gi, (grupo, itens) in enumerate(PERG):
    s.append(CondPageBreak(40 * mm))
    s.append(P(grupo, ParagraphStyle("g", parent=base, fontName="DVB", fontSize=9.5, spaceBefore=6, spaceAfter=3)))
    for q in itens:
        n += 1
        linhas = Table([[""], [""]], colWidths=[W], rowHeights=[15, 15])
        linhas.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, LINHA)]))
        s.append(KeepTogether([P(f"<b>{n}.</b> {q}", pq), linhas, Spacer(1, 5)]))


# ---------- Anexo: as fichas hoje, em duas colunas ----------
import re
RESUMO = "/home/user/erp-alimentacao/cerebro/empresa/fichas-tecnicas/resumo-das-fichas.md"
grupos, atual = [], None
for linha in open(RESUMO, encoding="utf-8"):
    if linha.startswith("## ") and "Contagem" not in linha:
        atual = (linha[3:].strip(), []); grupos.append(atual); continue
    if atual and linha.startswith("| ") and not linha.startswith("| Nº") and not linha.startswith("|---"):
        c = [x.strip() for x in linha.strip().strip("|").split("|")]
        if len(c) == 5: num, prod, ing, rend, obs = c
        else: num, prod, ing, rend, _, obs = c
        atual[1].append((num, prod, ing, rend, obs))

def limpa(t):
    t = t.replace("**", "").replace(". Está na planilha CSV junto com as prontas", "")
    t = t.replace("✅", "").replace("⚠️", "<font color='#b45309'><b>Falta:</b></font>").replace("❗", "<font color='#b91c1c'><b>Não fecha:</b></font>")
    t = t.replace("≈", "aprox. ").replace("→", "→")
    return t.strip()

fic = ParagraphStyle("fic", parent=base, fontSize=7.4, leading=9.3)
def bloco(f):
    num, prod, ing, rend, obs = f
    partes = [f"<b>{num}. {limpa(prod)}</b>", limpa(ing), f"<i>Rende · porção · tempo:</i> {limpa(rend)}"]
    o = limpa(obs)
    if o: partes.append(o)
    return Paragraph("<br/>".join(partes), fic)

s.append(PageBreak())
s.append(P("Anexo: as 59 fichas como estão hoje", h))
s.append(P("Resumo de cada ficha, como recebida. Rende · porção · tempo, nesta ordem.", peq))
s.append(Spacer(1, 4))
for ni, (nome, fichas) in enumerate(grupos):
    s.append(CondPageBreak(60 * mm))
    nome = re.sub(r"\s*\(\d+\)$", "", nome)
    linhas = [[P(f"{nome} ({len(fichas)})", ParagraphStyle("gx", parent=base, fontName="DVB", fontSize=9.5)), ""]]
    for i in range(0, len(fichas), 2):
        par = fichas[i:i+2]
        linhas.append([bloco(par[0]), bloco(par[1]) if len(par) > 1 else ""])
    t = Table(linhas, colWidths=[W / 2, W / 2], repeatRows=1)
    t.setStyle(TableStyle([("GRID", (0, 1), (-1, -1), 0.4, LINHA), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("SPAN", (0, 0), (1, 0)), ("TOPPADDING", (0, 0), (-1, 0), 8),
                           ("TOPPADDING", (0, 1), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                           ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
    s.append(t)

doc.build(s, onFirstPage=rodape, onLaterPages=rodape)
