import { crc32, deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { avisoNaTela, entrar, janelaSemEstouro, semEstouroDeLargura } from "./ajudas";

// Foto do produto (decisão 0022): escolher, trocar e tirar a foto de um produto que já existe;
// produto novo com a foto escolhida antes de salvar (e a foto falhando depois de criar);
// arquivo que não é foto; quem só vê; celular. As imagens são geradas aqui (nunca foto real).

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const SUFIXO = Math.random().toString(36).slice(2, 7);
const EXISTENTE = `Foto tela ${SUFIXO}`;
const NOVO = `Foto nova ${SUFIXO}`;
const NOVO_FALHA = `Foto falha ${SUFIXO}`;

/** PNG de uma cor só, montado à mão (sem foto de verdade). */
function png(largura: number, altura: number, cor: [number, number, number]): Buffer {
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.from(tipo, "ascii");
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
    return Buffer.concat([tam, t, dados, crc]);
  };
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(largura, 0);
  cab.writeUInt32BE(altura, 4);
  cab[8] = 8; // 8 bits
  cab[9] = 2; // RGB
  const linha = Buffer.alloc(1 + largura * 3);
  for (let x = 0; x < largura; x++) linha.set(cor, 1 + x * 3);
  const bruto = Buffer.concat(Array.from({ length: altura }, () => linha));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco("IHDR", cab), bloco("IDAT", deflateSync(bruto)), bloco("IEND", Buffer.alloc(0))]);
}

const FOTO_A = { name: "foto-a.png", mimeType: "image/png", buffer: png(800, 600, [200, 120, 40]) };
const FOTO_B = { name: "foto-b.png", mimeType: "image/png", buffer: png(640, 640, [40, 120, 200]) };
const PEQUENA = { name: "pequena.png", mimeType: "image/png", buffer: png(150, 150, [90, 90, 90]) };
const NAO_E_FOTO = { name: "texto.jpg", mimeType: "image/jpeg", buffer: Buffer.from("isto é um texto, não uma foto\n".repeat(20)) };

type ProdutoDaApi = { id: number; nome: string; fotoId: number | null };

async function produtoPeloNome(page: Page, nome: string): Promise<ProdutoDaApi | undefined> {
  const r = await page.request.get("/api/cadastros/produtos");
  expect(r.ok()).toBe(true);
  return ((await r.json()) as ProdutoDaApi[]).find((p) => p.nome === nome);
}
const fotoIdDe = async (page: Page, nome: string) => (await produtoPeloNome(page, nome))?.fotoId ?? null;

async function abrirEdicao(page: Page, nome: string) {
  await page.getByRole("button", { name: `Editar ${nome}` }).click();
  const janela = page.getByRole("dialog", { name: `Editar ${nome}` });
  await expect(janela).toBeVisible();
  return janela;
}

test("produto que já existe: escolher, trocar e tirar a foto", async ({ page }) => {
  await entrar(page, "gerente.geral");
  // O produto de teste é criado pela API (a criação pela tela já tem o teste dela).
  const cats = (await (await page.request.get("/api/cadastros/categorias")).json()) as { id: number; nome: string }[];
  const bebidas = cats.find((c) => c.nome === "Bebidas")!;
  const criado = await page.request.post("/api/cadastros/produtos", { data: { nome: EXISTENTE, categoriaId: bebidas.id, precoCentavos: 650, tipoProducaoId: null } });
  expect(criado.ok()).toBe(true);

  await page.goto("/cadastros/produtos");
  const cartao = page.getByTestId("categoria-Bebidas").getByTestId(`produto-${EXISTENTE}`);
  await expect(cartao).toBeVisible();
  // Sem foto, o cartão não tem miniatura.
  await expect(cartao.getByTestId("miniatura-do-produto")).toHaveCount(0);

  const janela = await abrirEdicao(page, EXISTENTE);
  await expect(janela.getByTestId("quadro-da-foto")).toHaveText("Sem foto");
  await expect(janela.getByText("Foto quadrada ou deitada, bem iluminada. O sistema ajusta o tamanho sozinho.")).toBeVisible();
  await expect(janela.getByRole("button", { name: "Tirar foto do produto" })).toHaveCount(0);
  const seletor = janela.getByTestId("arquivo-da-foto");
  await expect(seletor).toHaveAttribute("accept", "image/jpeg,image/png,image/webp,image/heic,image/heif");
  expect(await seletor.getAttribute("capture")).toBeNull();

  // (e) Arquivo que não é foto: a tela explica e nada vai para o servidor.
  await seletor.setInputFiles(NAO_E_FOTO);
  await expect(avisoNaTela(page)).toHaveText("Não foi possível abrir esta foto. Tente outra (JPG ou PNG).");
  await expect(janela.getByTestId("quadro-da-foto")).toHaveText("Sem foto");
  // Foto pequena demais: recusada na tela, com a mesma frase do servidor.
  await seletor.setInputFiles(PEQUENA);
  await expect(avisoNaTela(page)).toHaveText("Foto pequena demais: o lado menor precisa de pelo menos 200 pixels.");
  expect(await fotoIdDe(page, EXISTENTE)).toBeNull();

  // (a) Escolher a foto: vai na hora.
  await seletor.setInputFiles(FOTO_A);
  const foto = janela.getByTestId("foto-do-produto");
  await expect(foto).toHaveAttribute("src", /^\/api\/cadastros\/produtos\/foto\/\d+$/);
  await expect(foto).toHaveAttribute("alt", `Foto de ${EXISTENTE}`);
  await expect(avisoNaTela(page)).toHaveCount(0);
  await expect.poll(() => fotoIdDe(page, EXISTENTE)).not.toBeNull();
  const primeira = (await fotoIdDe(page, EXISTENTE))!;
  await expect(foto).toHaveAttribute("src", `/api/cadastros/produtos/foto/${primeira}`);
  const imagem = await page.request.get(`/api/cadastros/produtos/foto/${primeira}`);
  expect(imagem.status()).toBe(200);
  expect(imagem.headers()["content-type"]).toBe("image/webp");
  // A imagem carregou de verdade no quadro.
  await expect.poll(() => foto.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(800);
  // O cartão atrás da janela já mostra a miniatura.
  await expect(cartao.getByTestId("miniatura-do-produto")).toHaveAttribute("src", `/api/cadastros/produtos/foto/${primeira}`);

  // (b) Trocar a foto muda o fotoId.
  await seletor.setInputFiles(FOTO_B);
  await expect.poll(() => fotoIdDe(page, EXISTENTE)).not.toBe(primeira);
  const segunda = (await fotoIdDe(page, EXISTENTE))!;
  expect(segunda).not.toBeNull();
  await expect(foto).toHaveAttribute("src", `/api/cadastros/produtos/foto/${segunda}`);

  // (c) Tirar a foto (com confirmação): volta a "Sem foto".
  await janela.getByRole("button", { name: "Tirar foto do produto" }).click();
  await janela.getByRole("button", { name: "Não" }).click();
  expect(await fotoIdDe(page, EXISTENTE)).toBe(segunda);
  await janela.getByRole("button", { name: "Tirar foto do produto" }).click();
  await expect(janela.getByRole("alertdialog")).toContainText("Tirar a foto deste produto?");
  await janela.getByRole("button", { name: "Sim, tirar" }).click();
  await expect(janela.getByTestId("quadro-da-foto")).toHaveText("Sem foto");
  await expect.poll(() => fotoIdDe(page, EXISTENTE)).toBeNull();
  await expect(cartao.getByTestId("miniatura-do-produto")).toHaveCount(0);

  // Mexer só na foto não conta como "algo digitado": fecha sem perguntar.
  await janela.getByRole("button", { name: "Fechar" }).click();
  await expect(janela).toBeHidden();

  // Põe a foto de novo para os próximos testes (quem só vê e celular).
  const outra = await abrirEdicao(page, EXISTENTE);
  await outra.getByTestId("arquivo-da-foto").setInputFiles(FOTO_A);
  await expect.poll(() => fotoIdDe(page, EXISTENTE)).not.toBeNull();
});

test("produto novo: a foto escolhida antes vai depois de criar", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  await page.getByRole("button", { name: "Novo produto" }).click();
  const janela = page.getByRole("dialog", { name: "Novo produto" });
  await janela.getByLabel("Nome").fill(NOVO);
  await janela.getByLabel("Categoria", { exact: true }).selectOption({ label: "Bebidas" });
  await janela.getByLabel("Preço (R$)").fill("8,00");
  await janela.getByLabel("Passa pela produção?").selectOption({ label: "Não passa pela produção (ex.: bebida da geladeira)" });
  await janela.getByTestId("arquivo-da-foto").setInputFiles(FOTO_A);
  // Prévia local (ainda não foi para o servidor).
  await expect(janela.getByTestId("foto-do-produto")).toHaveAttribute("src", /^blob:/);
  await expect(janela.getByText("A foto vai junto quando você criar o produto.")).toBeVisible();
  expect(await produtoPeloNome(page, NOVO)).toBeUndefined();
  await janela.getByRole("button", { name: "Criar produto" }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Produto ${NOVO} criado.`);
  await expect.poll(() => fotoIdDe(page, NOVO)).not.toBeNull();
  await expect(page.getByTestId(`produto-${NOVO}`).getByTestId("miniatura-do-produto")).toBeVisible();
});

test("produto novo: se a foto falhar, o produto fica criado e dá para tentar de novo", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  // A primeira tentativa de enviar a foto falha (servidor fora do ar, simulado só neste teste).
  let falhou = false;
  await page.route("**/api/cadastros/produtos/foto", async (rota) => {
    if (falhou) return rota.continue();
    falhou = true;
    await rota.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ mensagem: "Servidor ocupado. Tente de novo." }) });
  });
  await page.getByRole("button", { name: "Novo produto" }).click();
  const janela = page.getByRole("dialog", { name: "Novo produto" });
  await janela.getByLabel("Nome").fill(NOVO_FALHA);
  await janela.getByLabel("Categoria", { exact: true }).selectOption({ label: "Bebidas" });
  await janela.getByLabel("Preço (R$)").fill("9,00");
  await janela.getByLabel("Passa pela produção?").selectOption({ label: "Não passa pela produção (ex.: bebida da geladeira)" });
  await janela.getByTestId("arquivo-da-foto").setInputFiles(FOTO_B);
  await janela.getByRole("button", { name: "Criar produto" }).click();
  await expect(avisoNaTela(page)).toHaveText("O produto foi criado, mas a foto não foi enviada. Servidor ocupado. Tente de novo.");
  await expect(janela).toBeVisible();
  await expect.poll(async () => (await produtoPeloNome(page, NOVO_FALHA))?.id).toBeDefined();
  expect(await fotoIdDe(page, NOVO_FALHA)).toBeNull();
  await janela.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(janela).toBeHidden();
  await expect.poll(() => fotoIdDe(page, NOVO_FALHA)).not.toBeNull();
  // Um produto só (salvar de novo não criou outro).
  const todos = (await (await page.request.get("/api/cadastros/produtos")).json()) as ProdutoDaApi[];
  expect(todos.filter((p) => p.nome === NOVO_FALHA)).toHaveLength(1);
});

test("quem só vê: a miniatura aparece e não há botões; o servidor recusa o envio", async ({ page }) => {
  await entrar(page, "supervisor");
  await page.goto("/cadastros/produtos");
  const cartao = page.getByTestId("categoria-Bebidas").getByTestId(`produto-${EXISTENTE}`);
  await expect(cartao.getByTestId("miniatura-do-produto")).toBeVisible();
  await expect(cartao.getByTestId("miniatura-do-produto")).toHaveAttribute("alt", "");
  // A miniatura carregou de verdade (não ficou um quadrado vazio).
  await cartao.getByTestId("miniatura-do-produto").scrollIntoViewIfNeeded();
  await expect.poll(() => cartao.getByTestId("miniatura-do-produto").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Escolher foto" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tirar foto do produto" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Editar ${EXISTENTE}` })).toHaveCount(0);
  // Ver a foto pode (cadastros.ver).
  const id = (await fotoIdDe(page, EXISTENTE))!;
  expect((await page.request.get(`/api/cadastros/produtos/foto/${id}`)).status()).toBe(200);
  // Mandar direto para a API: 403, e nada muda.
  const produto = (await produtoPeloNome(page, EXISTENTE))!;
  const r = await page.request.post("/api/cadastros/produtos/foto", { data: { produtoId: produto.id, arquivo: FOTO_B.buffer.toString("base64") } });
  expect(r.status()).toBe(403);
  const tirar = await page.request.post("/api/cadastros/produtos/foto/tirar", { data: { produtoId: produto.id } });
  expect(tirar.status()).toBe(403);
  expect(await fotoIdDe(page, EXISTENTE)).toBe(id);
});

test("celular (390 px): foto na janela e no cartão sem estouro, botões grandes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, "gerente.geral");
  await page.goto("/cadastros/produtos");
  const cartao = page.getByTestId("categoria-Bebidas").getByTestId(`produto-${EXISTENTE}`);
  await expect(cartao.getByTestId("miniatura-do-produto")).toBeVisible();
  await semEstouroDeLargura(page);
  const janela = await abrirEdicao(page, EXISTENTE);
  await expect(janela.getByTestId("foto-do-produto")).toBeVisible();
  for (const nome of ["Escolher foto", "Tirar foto do produto"]) {
    const caixa = (await janela.getByRole("button", { name: nome }).boundingBox())!;
    expect(caixa.height, `altura de "${nome}"`).toBeGreaterThanOrEqual(44);
  }
  await janelaSemEstouro(page);
  await semEstouroDeLargura(page);
});
