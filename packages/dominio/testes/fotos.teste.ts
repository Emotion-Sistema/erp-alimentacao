/**
 * Foto do produto (migração 0016; decisão 0022). Contra PostgreSQL real; imagens geradas no teste.
 */
import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  arquivoDaFoto,
  ErroDeRegra,
  formatoPelosBytes,
  FOTO_GRAVADA_MAXIMO,
  QUALIDADES,
  listarProdutos,
  refazerFoto,
  removerFotoDoProduto,
  salvarCategoria,
  salvarFotoDoProduto,
  salvarProduto,
  type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let atendente: Ator;
let cat: number;
const sufixo = randomUUID().slice(0, 8).replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"[parseInt(c, 16)]!);
let n = 0;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  atendente = await atorDoCargo(db, "atendente");
  cat = (await salvarCategoria(db, gerente, { nome: `Fotos ${sufixo}` })).id;
});
afterAll(() => db.destroy());

async function erroDe(p: Promise<unknown>): Promise<ErroDeRegra> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDeRegra) return e;
    throw e;
  }
  throw new Error("era esperado um erro e a ação foi aceita");
}

const produto = async () => (await salvarProduto(db, gerente, { nome: `Foto ${sufixo} ${n++}`, categoriaId: cat, precoCentavos: 1000 })).id;
const imagem = (w: number, h: number, formato: "jpeg" | "png" | "webp" | "gif" = "jpeg") =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 180, g: 90, b: 30 } } })
    .toFormat(formato)
    .toBuffer();
const b64 = (b: Buffer) => b.toString("base64");

describe("refazer a foto", () => {
  it("JPEG da câmera: endireita pela orientação, reduz a 1200 px e grava WebP sem EXIF nem GPS", async () => {
    // 2400x1600 com orientação 6 (girar 90°) e dados de localização.
    const original = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#c05020" } })
      .withExif({ IFD0: { Make: "Celular de teste", Model: "X" }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "21/1 45/1 0/1" } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const r = await refazerFoto(original);
    expect(formatoPelosBytes(r.conteudo)).toBe("webp");
    expect([r.largura, r.altura]).toEqual([800, 1200]); // girou: retrato
    const m = await sharp(r.conteudo).metadata();
    expect(m.format).toBe("webp");
    expect(m.exif).toBeUndefined();
    expect(m.orientation ?? 1).toBe(1);
    expect(r.conteudo.includes(Buffer.from("Celular de teste"))).toBe(false);
  });

  it("PNG transparente vira fundo branco; foto menor que 1200 não aumenta", async () => {
    const png = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const r = await refazerFoto(png);
    expect([r.largura, r.altura]).toEqual([400, 300]);
    const { data } = await sharp(r.conteudo).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
    expect((await sharp(r.conteudo).metadata()).hasAlpha).toBe(false);
  });

  it("recusa o que não é JPG, PNG ou WebP pelos bytes, pequena demais, muitos pixels e arquivo quebrado", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500"/></svg>');
    expect((await erroDe(refazerFoto(svg))).message).toContain("JPG, PNG ou WebP");
    expect((await erroDe(refazerFoto(await imagem(500, 500, "gif")))).message).toContain("JPG, PNG ou WebP");
    expect((await erroDe(refazerFoto(Buffer.from("isto não é uma imagem")))).message).toContain("JPG, PNG ou WebP");
    expect((await erroDe(refazerFoto(Buffer.alloc(0)))).message).toContain("Envie");
    expect((await erroDe(refazerFoto(await imagem(150, 900)))).message).toContain("pequena demais");
    // Começo de PNG com o resto quebrado.
    const png = await imagem(500, 500, "png");
    expect((await erroDe(refazerFoto(Buffer.concat([png.subarray(0, 40), Buffer.alloc(200, 7)])))).message).toContain("Não foi possível abrir");
    // Pequena no arquivo e enorme aberta (8000 x 6000 = 48 milhões de pixels).
    const grande = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(grande.length).toBeLessThan(2_000_000);
    expect((await erroDe(refazerFoto(grande))).message).toMatch(/pixels|Não foi possível abrir/);
  });
});

describe("ajustes da revisão", () => {
  it("foto com muito detalhe fino: passa de 1 MB na qualidade 82, é refeita até caber; sem tentativas menores, recusa clara", async () => {
    // Ruído de verdade: cada canal de cada pixel 0 ou 255 ao acaso.
    const bruto = randomBytes(1200 * 1200 * 3).map((b) => (b & 1 ? 255 : 0));
    const ruido = await sharp(Buffer.from(bruto), { raw: { width: 1200, height: 1200, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
    // Confere que o teste continua tendo sentido: na primeira qualidade passa de 1 MB.
    const primeira = await sharp(ruido).webp({ quality: QUALIDADES[0] }).toBuffer();
    expect(primeira.length).toBeGreaterThan(FOTO_GRAVADA_MAXIMO);
    const r = await refazerFoto(ruido);
    expect(r.conteudo.length).toBeLessThanOrEqual(FOTO_GRAVADA_MAXIMO);
    expect((await erroDe(refazerFoto(ruido, [QUALIDADES[0]]))).message).toContain("detalhe demais");
    const p = await produto();
    const f = await salvarFotoDoProduto(db, gerente, { produtoId: p, arquivo: b64(ruido) });
    expect(f.bytes).toBeLessThanOrEqual(FOTO_GRAVADA_MAXIMO);
  });
  it("recusa foto comprida demais (mais de 4 por 1), TIFF e AVIF", async () => {
    expect((await erroDe(refazerFoto(await imagem(200, 900)))).message).toContain("comprida");
    expect((await erroDe(refazerFoto(await imagem(2000, 300, "png")))).message).toContain("comprida");
    expect((await refazerFoto(await imagem(800, 200))).largura).toBe(800);
    const tiff = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#fff" } }).tiff().toBuffer();
    expect((await erroDe(refazerFoto(tiff))).message).toContain("JPG, PNG ou WebP");
    const avif = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#fff" } }).avif().toBuffer();
    expect((await erroDe(refazerFoto(avif))).message).toContain("JPG, PNG ou WebP");
  });
  it("id da foto só com dígitos, conferido depois da permissão", async () => {
    for (const id of ["0x1", " 1", "1e3", "abc", "-1", "", "99999999999"]) expect((await erroDe(arquivoDaFoto(db, gerente, id))).codigo).toBe("nao_encontrado");
    expect((await erroDe(arquivoDaFoto(db, null, "abc"))).codigo).toBe("nao_autenticado");
  });
});

describe("foto do produto", () => {
  it("envia, troca (a anterior fica inativa), tira e audita; quem vê e quem não envia", async () => {
    const p = await produto();
    const f1 = await salvarFotoDoProduto(db, gerente, { produtoId: p, arquivo: b64(await imagem(1600, 1200)) });
    expect([f1.largura, f1.altura]).toEqual([1200, 900]);
    const arq = await arquivoDaFoto(db, cozinheira, f1.id);
    expect(arq.tipo).toBe("image/webp");
    expect(formatoPelosBytes(arq.conteudo)).toBe("webp");
    expect(arq.sha256).toBe(f1.sha256);
    expect((await listarProdutos(db, gerente)).find((x) => x.id === p)!.fotoId).toBe(f1.id);
    const f2 = await salvarFotoDoProduto(db, gerente, { produtoId: p, arquivo: b64(await imagem(600, 600, "webp")) });
    const linhas = await db.selectFrom("produto_foto").select(["id", "ativa"]).where("produto_id", "=", p).orderBy("id").execute();
    expect(linhas).toEqual([
      { id: f1.id, ativa: false },
      { id: f2.id, ativa: true },
    ]);
    // A do histórico continua visível para a equipe.
    expect((await arquivoDaFoto(db, gerente, f1.id)).sha256).toBe(f1.sha256);
    expect(await removerFotoDoProduto(db, gerente, { produtoId: p })).toEqual({ removida: true });
    expect((await listarProdutos(db, gerente)).find((x) => x.id === p)!.fotoId).toBeNull();
    expect(await removerFotoDoProduto(db, gerente, { produtoId: p })).toEqual({ removida: false });
    const aud = await db.selectFrom("auditoria").select("detalhes").where("alvo_tipo", "=", "produto").where("alvo_id", "=", String(p)).orderBy("id").execute();
    const ops = aud.map((a) => (a.detalhes as { operacao: string }).operacao);
    expect(ops).toEqual(["criar", "enviar_foto", "trocar_foto", "tirar_foto"]);
    expect(JSON.stringify(aud)).not.toContain(b64(arq.conteudo).slice(0, 40));
    expect((await erroDe(salvarFotoDoProduto(db, cozinheira, { produtoId: p, arquivo: "x" }))).codigo).toBe("sem_permissao");
    // Quem lança pedido vê a foto (Novo pedido, 25/11/2026); o caixa não lança nem cadastra.
    expect((await arquivoDaFoto(db, atendente, f1.id)).sha256).toBe(f1.sha256);
    expect((await erroDe(arquivoDaFoto(db, await atorDoCargo(db, "caixa"), f1.id))).codigo).toBe("sem_permissao");
    expect((await erroDe(arquivoDaFoto(db, null, f1.id))).codigo).toBe("nao_autenticado");
  });

  it("recusa produto inexistente, base64 inválido e arquivo acima de 8 MB, sem gravar nada", async () => {
    const p = await produto();
    const foto = b64(await imagem(400, 400));
    expect((await erroDe(salvarFotoDoProduto(db, gerente, { produtoId: 2_147_483_647, arquivo: foto }))).codigo).toBe("nao_encontrado");
    expect((await erroDe(salvarFotoDoProduto(db, gerente, { produtoId: p, arquivo: "@@@@" }))).message).toContain("inválido");
    expect((await erroDe(salvarFotoDoProduto(db, gerente, { produtoId: p, arquivo: "A".repeat(12 * 1024 * 1024) }))).message).toContain("8 MB");
    expect((await erroDe(salvarFotoDoProduto(db, gerente, { produtoId: "1", arquivo: foto }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(arquivoDaFoto(db, gerente, 2_147_483_647))).codigo).toBe("nao_encontrado");
    expect(await db.selectFrom("produto_foto").select("id").where("produto_id", "=", p).execute()).toEqual([]);
  });

  it("concorrência: dois envios presos juntos na gravação deixam uma foto ativa só, sem erro", async () => {
    // Outra conexão segura a tabela de fotos; os dois envios chegam à gravação e ficam esperando.
    // Com a trava do produto, um espera o outro; sem ela, os dois inserem juntos e o banco recusa.
    const p = await produto();
    const foto = b64(await imagem(400, 400));
    const outra = bancoDeTeste();
    try {
      let soltar!: () => void;
      const solto = new Promise<void>((r) => (soltar = r));
      let travou!: () => void;
      const travado = new Promise<void>((r) => (travou = r));
      const segura = outra.transaction().execute(async (trx) => {
        await sql`LOCK TABLE produto_foto IN SHARE ROW EXCLUSIVE MODE`.execute(trx);
        travou();
        await solto;
      });
      await travado;
      const envios = [1, 2].map(() => salvarFotoDoProduto(db, gerente, { produtoId: p, arquivo: foto }));
      envios.forEach((e) => e.catch(() => undefined));
      // Espera os dois ficarem presos em alguma trava.
      for (let k = 0; k < 100; k++) {
        const r = await sql<{ n: number }>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`.execute(db);
        if (r.rows[0]!.n >= 2) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const presos = await sql<{ n: number }>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`.execute(db);
      expect(presos.rows[0]!.n).toBeGreaterThanOrEqual(2);
      soltar();
      await segura;
      const r = await Promise.allSettled(envios);
      expect(r.map((x) => x.status)).toEqual(["fulfilled", "fulfilled"]);
    } finally {
      await outra.destroy();
    }
    const ativas = await db.selectFrom("produto_foto").select("id").where("produto_id", "=", p).where("ativa", "=", true).execute();
    expect(ativas).toHaveLength(1);
  });

  it("o banco recusa foto ativa repetida e tipo diferente de WebP", async () => {
    const p = await produto();
    await salvarFotoDoProduto(db, gerente, { produtoId: p, arquivo: b64(await imagem(400, 400)) });
    const base = { produto_id: p, conteudo: Buffer.from([1]), largura: 1, altura: 1, sha256: "a".repeat(64), enviada_por: gerente.usuarioId };
    await expect(db.insertInto("produto_foto").values(base).execute()).rejects.toMatchObject({ code: "23505" });
    await expect(db.insertInto("produto_foto").values({ ...base, ativa: false, tipo: "image/png" as never }).execute()).rejects.toMatchObject({ code: "23514" });
  });
});
