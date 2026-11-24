/**
 * Foto do produto (passo 3 do plano de 19/11/2026; migração 0016; decisão 0022).
 * O servidor nunca guarda o arquivo como chegou: confere pelos primeiros bytes que é JPEG, PNG ou
 * WebP, abre com limite de pixels (contra "bomba" de imagem), endireita pela orientação da câmera,
 * reduz para no máximo 1200 px e grava um WebP novo, sem os dados escondidos (localização, modelo
 * do aparelho). Quem envia e tira: `cadastros.gerenciar`. Quem vê: `cadastros.ver`.
 * Nada se apaga: a foto anterior fica inativa; tudo na auditoria (sem o conteúdo).
 */
import { createHash } from "node:crypto";
import sharp, { type Metadata, type OutputInfo } from "sharp";
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { exigir, type Ator } from "./sessao";

/** Maior arquivo aceito, antes de refazer (a tela já reduz antes de enviar). */
export const FOTO_BYTES_MAXIMO = 8 * 1024 * 1024;
/** Lado maior da foto gravada. */
export const FOTO_LADO_MAXIMO = 1200;
/** Lado menor aceito na foto enviada (abaixo disso fica borrada no cardápio). */
export const FOTO_LADO_MINIMO = 200;
/** Limite de pixels ao abrir (contra imagem pequena no arquivo e gigante aberta). */
const PIXELS_MAXIMO = 40_000_000;
/** Proporção máxima entre os lados (uma tira fina viraria 1200 x 6 e ficaria inútil no cardápio). */
export const FOTO_PROPORCAO_MAXIMA = 4;
/** Maior foto gravada (o banco também confere). */
export const FOTO_GRAVADA_MAXIMO = 1024 * 1024;
/** Qualidades tentadas em ordem até a foto caber em 1 MB (foto com muito detalhe fino). */
export const QUALIDADES = [82, 70, 55, 40] as const;

// Não segurar arquivos de 8 MB no cache da biblioteca; no máximo 2 fotos sendo refeitas ao mesmo
// tempo (cada uma pode usar ~120 MB de memória), as demais esperam a vez.
sharp.cache(false);
const VAGAS = 2;
/** Quantos podem esperar a vez (cada um segura o arquivo na memória); o resto é recusado. */
const ESPERA_MAXIMA = 10;
let ocupadas = 0;
const fila: (() => void)[] = [];
async function naVez<T>(trabalho: () => Promise<T>): Promise<T> {
  if (ocupadas >= VAGAS) {
    if (fila.length >= ESPERA_MAXIMA)
      throw new ErroDeRegra("conflito", "Muitas fotos sendo enviadas agora. Tente de novo em instantes.");
    await new Promise<void>((r) => fila.push(r));
  }
  else ocupadas++;
  try {
    return await trabalho();
  } finally {
    const proximo = fila.shift();
    if (proximo) proximo();
    else ocupadas--;
  }
}

const MAIOR_ID = 2_147_483_647;
const id = (msg: string) => z.number({ error: msg }).int(msg).positive(msg).max(MAIOR_ID, msg);

const esquemaEnvio = z.object(
  {
    produtoId: id("Produto não encontrado."),
    /** O arquivo em base64 (sem o prefixo data:). */
    arquivo: z.string({ error: "Envie o arquivo da foto." }).min(1, "Envie o arquivo da foto."),
  },
  { error: "Dados da foto em formato inválido." },
);
const esquemaRemover = z.object({ produtoId: id("Produto não encontrado.") }, { error: "Dados da foto em formato inválido." });

export type FotoDoProduto = { id: number; produtoId: number; largura: number; altura: number; bytes: number; sha256: string };

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

const RECUSA = "Envie uma foto em JPG, PNG ou WebP.";

/** Base64 estrito: só os caracteres do alfabeto, com o tamanho certo. */
export function decodificarFoto(base64: string): Buffer {
  const limpo = base64.replace(/\s+/g, "");
  if (limpo.length > Math.ceil(FOTO_BYTES_MAXIMO / 3) * 4) throw new ErroDeRegra("dados_invalidos", "Foto grande demais: o máximo é 8 MB.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(limpo) || limpo.length % 4 !== 0) throw new ErroDeRegra("dados_invalidos", "Arquivo da foto inválido.");
  return Buffer.from(limpo, "base64");
}

/** O formato pelos primeiros bytes (não pelo nome nem pelo que o navegador diz). */
export function formatoPelosBytes(b: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "webp";
  return null;
}

/** Refaz a imagem: confere, endireita, reduz e grava WebP novo sem metadados. */
export function refazerFoto(
  original: Buffer,
  /** Só para teste: as qualidades tentadas (padrão: QUALIDADES). */
  qualidades: readonly number[] = QUALIDADES,
  /** Limites de outro uso (ex.: foto da nota de compra, comprida e com letra miúda). */
  limites: Partial<LimitesDaFoto> = {},
): Promise<{ conteudo: Buffer; largura: number; altura: number }> {
  return naVez(() => refazer(original, qualidades, { ...LIMITES_DO_CARDAPIO, ...limites }));
}

export type LimitesDaFoto = { ladoMaximo: number; ladoMinimo: number; proporcaoMaxima: number; gravadaMaxima: number; detalheDemais: string };
const LIMITES_DO_CARDAPIO: LimitesDaFoto = {
  ladoMaximo: FOTO_LADO_MAXIMO,
  ladoMinimo: FOTO_LADO_MINIMO,
  proporcaoMaxima: FOTO_PROPORCAO_MAXIMA,
  gravadaMaxima: FOTO_GRAVADA_MAXIMO,
  detalheDemais: "Foto com detalhe demais para o cardápio. Tente outra foto.",
};

async function refazer(original: Buffer, qualidades: readonly number[], lim: LimitesDaFoto): Promise<{ conteudo: Buffer; largura: number; altura: number }> {
  if (!original.length) throw new ErroDeRegra("dados_invalidos", "Envie o arquivo da foto.");
  if (original.length > FOTO_BYTES_MAXIMO) throw new ErroDeRegra("dados_invalidos", "Foto grande demais: o máximo é 8 MB.");
  const formato = formatoPelosBytes(original);
  if (!formato) throw new ErroDeRegra("dados_invalidos", RECUSA);
  const abrir = () => sharp(original, { limitInputPixels: PIXELS_MAXIMO, failOn: "error", animated: false, pages: 1 });
  let info: Metadata;
  try {
    info = await abrir().metadata();
  } catch {
    throw new ErroDeRegra("dados_invalidos", "Não foi possível abrir a foto. Tente outro arquivo.");
  }
  if (info.format !== formato) throw new ErroDeRegra("dados_invalidos", RECUSA);
  const w = info.width ?? 0;
  const h = info.height ?? 0;
  if (!w || !h || w * h > PIXELS_MAXIMO) throw new ErroDeRegra("dados_invalidos", "Foto grande demais em pixels.");
  if (Math.min(w, h) < lim.ladoMinimo)
    throw new ErroDeRegra("dados_invalidos", `Foto pequena demais: o lado menor precisa de pelo menos ${lim.ladoMinimo} pixels.`);
  if (Math.max(w, h) > lim.proporcaoMaxima * Math.min(w, h))
    throw new ErroDeRegra("dados_invalidos", `Foto comprida demais: um lado pode ter no máximo ${lim.proporcaoMaxima} vezes o outro. Recorte a foto.`);
  for (const qualidade of qualidades) {
    let r: { data: Buffer; info: OutputInfo };
    try {
      r = await abrir()
        .rotate() // orientação da câmera (EXIF)
        .resize({ width: lim.ladoMaximo, height: lim.ladoMaximo, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" }) // transparência vira fundo branco
        .webp({ quality: qualidade, effort: 4 }) // sem keepMetadata: a saída não leva EXIF, GPS nem ICC
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new ErroDeRegra("dados_invalidos", "Não foi possível abrir a foto. Tente outro arquivo.");
    }
    if (r.data.length <= lim.gravadaMaxima) return { conteudo: r.data, largura: r.info.width, altura: r.info.height };
  }
  throw new ErroDeRegra("dados_invalidos", lim.detalheDemais);
}

/** Envia (ou troca) a foto do produto. A anterior fica inativa. */
export async function salvarFotoDoProduto(db: Banco, ator: Ator | null, dados: unknown): Promise<FotoDoProduto> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "produto_foto" });
  const d = validar(esquemaEnvio, dados);
  // Refaz fora da transação (trabalho pesado não segura trava do banco).
  const foto = await refazerFoto(decodificarFoto(d.arquivo));
  const sha256 = createHash("sha256").update(foto.conteudo).digest("hex");
  return db.transaction().execute(async (trx) => {
    const p = await trx.selectFrom("produto").select("id").where("id", "=", d.produtoId).forNoKeyUpdate().executeTakeFirst();
    if (!p) throw new ErroDeRegra("nao_encontrado", "Produto não encontrado.");
    const anterior = await trx
      .updateTable("produto_foto")
      .set({ ativa: false, atualizado_em: sql`now()` })
      .where("produto_id", "=", p.id)
      .where("ativa", "=", true)
      .returning(["id", "sha256"])
      .executeTakeFirst();
    const nova = await trx
      .insertInto("produto_foto")
      .values({ produto_id: p.id, conteudo: foto.conteudo, largura: foto.largura, altura: foto.altura, sha256, enviada_por: quem.usuarioId })
      .returning("id")
      .executeTakeFirstOrThrow();
    const r: FotoDoProduto = { id: nova.id, produtoId: p.id, largura: foto.largura, altura: foto.altura, bytes: foto.conteudo.length, sha256 };
    await auditar(trx, {
      usuarioId: quem.usuarioId,
      acao: "cadastros.gerenciar",
      resultado: "permitido",
      alvoTipo: "produto",
      alvoId: p.id,
      detalhes: { operacao: anterior ? "trocar_foto" : "enviar_foto", anterior: anterior ?? null, depois: r },
      ip: quem.ip,
    });
    return r;
  });
}

/** Tira a foto do produto (fica inativa, no histórico). Sem foto: não faz nada. */
export async function removerFotoDoProduto(db: Banco, ator: Ator | null, dados: unknown): Promise<{ removida: boolean }> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "produto_foto" });
  const d = validar(esquemaRemover, dados);
  return db.transaction().execute(async (trx) => {
    const p = await trx.selectFrom("produto").select("id").where("id", "=", d.produtoId).forNoKeyUpdate().executeTakeFirst();
    if (!p) throw new ErroDeRegra("nao_encontrado", "Produto não encontrado.");
    const anterior = await trx
      .updateTable("produto_foto")
      .set({ ativa: false, atualizado_em: sql`now()` })
      .where("produto_id", "=", p.id)
      .where("ativa", "=", true)
      .returning(["id", "sha256"])
      .executeTakeFirst();
    if (!anterior) return { removida: false };
    await auditar(trx, {
      usuarioId: quem.usuarioId,
      acao: "cadastros.gerenciar",
      resultado: "permitido",
      alvoTipo: "produto",
      alvoId: p.id,
      detalhes: { operacao: "tirar_foto", anterior },
      ip: quem.ip,
    });
    return { removida: true };
  });
}

/** O arquivo de uma foto (ativa ou do histórico), para a equipe ver. */
export async function arquivoDaFoto(db: Banco, ator: Ator | null, idDaFoto: unknown): Promise<{ conteudo: Buffer; tipo: "image/webp"; sha256: string }> {
  // Permissão primeiro; depois o id (só dígitos: nada de "0x1", " 1" ou "1e3").
  await exigir(db, ator, "cadastros.ver", { tipo: "produto_foto" });
  const texto = typeof idDaFoto === "number" ? String(idDaFoto) : idDaFoto;
  const fotoId = typeof texto === "string" && /^[1-9][0-9]{0,9}$/.test(texto) ? Number(texto) : 0;
  if (!fotoId || fotoId > MAIOR_ID) throw new ErroDeRegra("nao_encontrado", "Foto não encontrada.");
  const f = await db.selectFrom("produto_foto").select(["conteudo", "tipo", "sha256"]).where("id", "=", fotoId).executeTakeFirst();
  if (!f) throw new ErroDeRegra("nao_encontrado", "Foto não encontrada.");
  return f;
}

/** Foto ativa de cada produto pedido (id da foto), para a lista de produtos. */
export async function fotosAtivas(db: Banco, produtoIds: number[]): Promise<Map<number, number>> {
  if (!produtoIds.length) return new Map();
  const linhas = await db.selectFrom("produto_foto").select(["id", "produto_id"]).where("produto_id", "in", produtoIds).where("ativa", "=", true).execute();
  return new Map(linhas.map((l) => [l.produto_id, l.id]));
}
