/**
 * Reduz a foto no navegador antes de enviar (decisão 0022): abre o arquivo (o Safari do iPhone
 * também abre HEIC), endireita pela orientação da câmera, diminui para no máximo 1600 px no lado
 * maior e exporta JPEG. Assim o envio fica leve e o HEIC chega como JPEG. Quem decide de verdade é
 * o servidor (`packages/dominio/src/fotos.ts`): ele confere o formato e refaz a foto em WebP.
 * Só funciona no navegador (usa canvas).
 */
import { TP } from "./textos";

/** Igual a `FOTO_LADO_MINIMO` de `packages/dominio/src/fotos.ts` (o servidor confere de novo). */
export const FOTO_LADO_MINIMO = 200;
/** Lado maior da foto que vai para o servidor (ele reduz de novo para 1200 px). */
export const LADO_MAXIMO_NO_ENVIO = 1600;
const QUALIDADE_JPEG = 0.88;

export type FotoReduzida = { base64: string; blob: Blob; largura: number; altura: number };

/** Erro com a mensagem pronta para a tela. */
export class ErroDaFoto extends Error {}

type Imagem = { desenho: CanvasImageSource; largura: number; altura: number; liberar: () => void };

async function abrirComBitmap(arquivo: Blob): Promise<Imagem | null> {
  if (typeof createImageBitmap !== "function") return null;
  for (const opcoes of [{ imageOrientation: "from-image" } as ImageBitmapOptions, undefined]) {
    try {
      const b = opcoes ? await createImageBitmap(arquivo, opcoes) : await createImageBitmap(arquivo);
      return { desenho: b, largura: b.width, altura: b.height, liberar: () => b.close() };
    } catch {
      // Tenta sem a opção (navegador antigo) e depois pelo <img>.
    }
  }
  return null;
}

/** Pelo <img>: o navegador já endireita pela orientação da câmera (image-orientation: from-image). */
function abrirComImagem(arquivo: Blob): Promise<Imagem | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => resolver({ desenho: img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolver(null);
    };
    img.src = url;
  });
}

function paraBase64(blob: Blob): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result).replace(/^data:[^,]*,/, ""));
    leitor.onerror = () => rejeitar(new ErroDaFoto(TP.foto.naoAbriu));
    leitor.readAsDataURL(blob);
  });
}

export async function reduzirFoto(arquivo: Blob): Promise<FotoReduzida> {
  const imagem = (await abrirComBitmap(arquivo)) ?? (await abrirComImagem(arquivo));
  if (!imagem || !imagem.largura || !imagem.altura) throw new ErroDaFoto(TP.foto.naoAbriu);
  try {
    const escala = Math.min(1, LADO_MAXIMO_NO_ENVIO / Math.max(imagem.largura, imagem.altura));
    const largura = Math.round(imagem.largura * escala);
    const altura = Math.round(imagem.altura * escala);
    // Confere já reduzida: é ela que o servidor vai medir.
    if (Math.min(largura, altura) < FOTO_LADO_MINIMO) throw new ErroDaFoto(TP.foto.pequena(FOTO_LADO_MINIMO));
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ErroDaFoto(TP.foto.naoAbriu);
    // JPEG não tem transparência: fundo branco (o servidor faz o mesmo).
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, largura, altura);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagem.desenho, 0, 0, largura, altura);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALIDADE_JPEG));
    if (!blob) throw new ErroDaFoto(TP.foto.naoAbriu);
    return { base64: await paraBase64(blob), blob, largura, altura };
  } finally {
    imagem.liberar();
  }
}
