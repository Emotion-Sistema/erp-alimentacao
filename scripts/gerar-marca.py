"""Gera os arquivos da marca usados pelos apps (logo, símbolo, ícones, favicon) a partir da logo
provisória em cerebro/empresa/fichas-tecnicas/logo-provisoria/ e das cores aprovadas
(cerebro/empresa/paleta-da-marca/tema-aprovado.css). Rode: python3 scripts/gerar-marca.py
Saída: apps/{gestao,loja,site}/public/marca/. Refaça quando a logo definitiva chegar."""
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / "cerebro/empresa/fichas-tecnicas/logo-provisoria"
CREME = (0xFD, 0xF8, 0xF0, 255)  # --cor-fundo (Espuma de Leite)
CAFE = (0x35, 0x1E, 0x17, 255)  # --cor-faixa-escura (Café Torrado)


def abrir(nome: str) -> Image.Image:
    return Image.open(ORIGEM / nome).convert("RGBA")


def recortar(im: Image.Image) -> Image.Image:
    return im.crop(im.getbbox())


def altura(im: Image.Image, h: int) -> Image.Image:
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def largura(im: Image.Image, w: int) -> Image.Image:
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def icone(simbolo: Image.Image, lado: int, fundo, margem: float) -> Image.Image:
    """Símbolo centrado num quadrado; margem = fração livre em cada lado (maskable pede >= 10%)."""
    tela = Image.new("RGBA", (lado, lado), fundo)
    caixa = int(lado * (1 - 2 * margem))
    s = simbolo.copy()
    s.thumbnail((caixa, caixa), Image.LANCZOS)
    tela.alpha_composite(s, ((lado - s.width) // 2, (lado - s.height) // 2))
    return tela


def main() -> None:
    horizontal = recortar(abrir("logo-horizontal-transparente.png"))
    horizontal_escura = recortar(abrir("logo-horizontal-para-fundo-escuro-transparente.png"))
    completa = recortar(abrir("logo-completa-transparente.png"))
    completa_escura = recortar(abrir("logo-completa-para-fundo-escuro-transparente.png"))
    simbolo = recortar(abrir("simbolo-transparente.png"))

    arquivos = {
        # Cabeçalho: mostrado com 40 a 48 px de altura; 3x para telas densas.
        "logo-horizontal.webp": altura(horizontal, 144),
        "logo-horizontal-fundo-escuro.webp": altura(horizontal_escura, 144),
        # Entrada e capa: até 320 px de largura; 2x.
        "logo-completa.webp": largura(completa, 640),
        "logo-completa-fundo-escuro.webp": largura(completa_escura, 640),
        "simbolo.webp": largura(simbolo, 256),
        "icone-192.png": icone(simbolo, 192, CREME, 0.12),
        "icone-512.png": icone(simbolo, 512, CREME, 0.12),
        "icone-maskable-512.png": icone(simbolo, 512, CREME, 0.2),
        "icone-escuro-512.png": icone(simbolo, 512, CAFE, 0.12),
        "apple-touch-icon.png": icone(simbolo, 180, CREME, 0.12).convert("RGB"),
    }
    for app in ("gestao", "loja", "site"):
        destino = RAIZ / "apps" / app / "public" / "marca"
        destino.mkdir(parents=True, exist_ok=True)
        for nome, im in arquivos.items():
            if nome.endswith(".webp"):
                im.save(destino / nome, quality=90, method=6)  # logo: WebP com transparência, bem mais leve
            else:
                im.save(destino / nome, optimize=True)
        icone(simbolo, 64, CREME, 0.04).save(destino / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
        print(app, "ok")


if __name__ == "__main__":
    main()
