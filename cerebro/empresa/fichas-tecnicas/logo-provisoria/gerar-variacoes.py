"""Gera as variações da logo provisória E-MOTION a partir de logo-completo.png (fundo já transparente)."""
import sys, os
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
full = Image.open(src).convert("RGBA")
PAD = 40
Y_SIMB_FIM = PAD + 2435      # fim do símbolo (xícara, fogo, raio)
Y_NOME_INI = PAD + 2557      # começo do "E-MOTION"
Y_SUB_INI = PAD + 3281       # começo do "COFFEE · GRILL · EXPRESS"

CREME = (251, 246, 238)      # fundo claro quente
CAFE = (26, 20, 18)          # fundo escuro (café)
QUASE_PRETO = (19, 17, 17)
BRANCO_CREME = (253, 249, 242)

def corta(im):
    return im.crop(im.getbbox())

def larg(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)

def sobre(im, cor):
    bg = Image.new("RGB", im.size, cor); bg.paste(im, mask=im.split()[3]); return bg

def mono(im, cor):
    a = im.split()[3]
    sol = Image.new("RGBA", im.size, cor + (255,)); sol.putalpha(a); return sol

def texto_claro(im, y_ini):
    """Troca o preto do 'E-MOTION' (e os contornos escuros abaixo de y_ini) por creme, para fundo escuro."""
    a = np.asarray(im).copy()
    reg = a[y_ini:]
    rgb = reg[..., :3].astype(int)
    escuro = (rgb.max(axis=2) < 90) & (reg[..., 3] > 0)
    reg[escuro, 0], reg[escuro, 1], reg[escuro, 2] = BRANCO_CREME
    a[y_ini:] = reg
    return Image.fromarray(a, "RGBA")

def margem(im, frac, cor=None):
    w, h = im.size; m = int(max(w, h) * frac)
    bg = Image.new("RGBA", (w + 2 * m, h + 2 * m), (cor + (255,)) if cor else (0, 0, 0, 0))
    bg.alpha_composite(im, (m, m)); return bg

def quadrado(im, lado, cor, ocupacao=0.78):
    alvo = int(lado * ocupacao)
    esc = alvo / max(im.size)
    r = im.resize((round(im.width * esc), round(im.height * esc)), Image.LANCZOS)
    bg = Image.new("RGBA", (lado, lado), cor + (255,))
    bg.alpha_composite(r, ((lado - r.width) // 2, (lado - r.height) // 2)); return bg

def salva(im, nome, jpg_fundo=None):
    p = os.path.join(out, nome)
    if nome.endswith(".jpg"):
        (sobre(im, jpg_fundo) if im.mode == "RGBA" else im).save(p, quality=92, optimize=True, progressive=True)
    else:
        im.save(p, optimize=True)
    print(nome, im.size)

completa = corta(full)
simbolo = corta(full.crop((0, 0, full.width, Y_SIMB_FIM + 20)))
nome = corta(full.crop((0, Y_NOME_INI - 20, full.width, full.height)))

# 1. Completa (vertical)
for w, suf in ((3200, "-hd"), (1600, "")):
    c = larg(completa, w)
    salva(c, f"logo-completa{suf}-transparente.png")
    salva(margem(c, .06, CREME), f"logo-completa{suf}-fundo-creme.jpg")
    salva(margem(c, .06, (255, 255, 255)), f"logo-completa{suf}-fundo-branco.jpg")
    escura = texto_claro(full, Y_NOME_INI - 20)
    ce = larg(corta(escura), w)
    salva(ce, f"logo-completa{suf}-para-fundo-escuro-transparente.png")
    salva(margem(ce, .06, CAFE), f"logo-completa{suf}-fundo-cafe.jpg")

# 2. Só o símbolo
for w, suf in ((2000, "-hd"), (900, "")):
    s = larg(simbolo, w)
    salva(s, f"simbolo{suf}-transparente.png")
    salva(margem(s, .08, CREME), f"simbolo{suf}-fundo-creme.jpg")
    salva(margem(s, .08, CAFE), f"simbolo{suf}-fundo-cafe.jpg")

# 3. Horizontal (símbolo à esquerda, nome à direita)
def horizontal(nome_img, fundo=None):
    h_alvo = 600
    s = larg(simbolo, round(simbolo.width * h_alvo / simbolo.height))
    n = larg(nome_img, round(nome_img.width * (h_alvo * .62) / nome_img.height))
    gap = 70
    W, H = s.width + gap + n.width, h_alvo
    bg = Image.new("RGBA", (W, H), (fundo + (255,)) if fundo else (0, 0, 0, 0))
    bg.alpha_composite(s, (0, 0)); bg.alpha_composite(n, (s.width + gap, (H - n.height) // 2))
    return bg
hz = horizontal(nome)
salva(hz, "logo-horizontal-transparente.png")
salva(margem(hz, .05, CREME), "logo-horizontal-fundo-creme.jpg")
nome_claro = corta(texto_claro(nome, 0))
hze = horizontal(nome_claro)
salva(hze, "logo-horizontal-para-fundo-escuro-transparente.png")
salva(margem(hze, .05, CAFE), "logo-horizontal-fundo-cafe.jpg")

# 4. Uma cor só (carimbo, gravação, etiqueta, nota)
for cor, n_ in ((QUASE_PRETO, "preta"), (BRANCO_CREME, "branca")):
    salva(larg(mono(completa, cor), 1600), f"logo-completa-uma-cor-{n_}-transparente.png")
    salva(larg(mono(simbolo, cor), 900), f"simbolo-uma-cor-{n_}-transparente.png")

# 5. Ícones quadrados (perfil de rede social, aplicativo, aba do navegador)
for lado in (1024, 512, 192):
    salva(quadrado(simbolo, lado, CREME), f"icone-{lado}-fundo-creme.png")
    salva(quadrado(simbolo, lado, CAFE), f"icone-{lado}-fundo-cafe.png")
salva(quadrado(simbolo, 1080, CREME, .9).convert("RGB"), "perfil-rede-social-1080-creme.jpg")
fav = quadrado(simbolo, 256, CREME, .92)
fav.save(os.path.join(out, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]); print("favicon.ico")
