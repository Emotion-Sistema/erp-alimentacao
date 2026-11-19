import { expect, test, type Page } from "@playwright/test";
import { avisoNaTela, entrar, janelaNoCentro, janelaSemEstouro, loginDoCargo, nomesDoMenu, semEstouroDeLargura, sql } from "./ajudas";

// Base do Clube E-MOTION na gestão (RC-21 seção 2, decisão 0024): o gerente geral muda o percentual
// e vê a prévia; marca só uma categoria; cria e desativa um prêmio; liga um presente com produto
// grátis; agenda uma campanha numa terça às 15h da semana que vem, edita e cancela com motivo;
// segunda-feira (casa fechada) é recusada com a mensagem do servidor; atendente e supervisor não veem
// o item e recebem o bloqueio; celular sem rolagem de lado. Só dados fictícios (a semente).

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

const SUFIXO = Math.random().toString(36).slice(2, 7);
const PREMIO = `Café do Clube ${SUFIXO}`;
const CAMPANHA = `Terça em dobro ${SUFIXO}`;
const CAMPANHA_NOVA = `Terça de pontos ${SUFIXO}`;

type Painel = {
  regras: {
    ligado: boolean;
    descontoPb: number;
    todasAsCategorias: boolean;
    categorias: number[];
    tetoDescontoCentavos: number | null;
    horarios: { dia: number; modo: string; inicio: string | null; fim: string | null }[];
  };
  premios: { id: number; nome: string; pontos: number; produtoId: number | null; ativo: boolean }[];
  presentes: { tipo: string; ligado: boolean; beneficio: string; valor: number | null; produtoId: number | null }[];
  campanhas: { id: number; titulo: string; texto: string; enviarEm: string; situacao: string; motivoCancelamento: string | null }[];
  categorias: { id: number; nome: string; ativo: boolean }[];
  produtos: { id: number; nome: string; ativo: boolean }[];
};

async function painel(page: Page): Promise<Painel> {
  const r = await page.request.get("/api/clube");
  expect(r.ok()).toBe(true);
  return (await r.json()) as Painel;
}

/** Dia (AAAA-MM-DD) da semana que vem, no relógio da loja: 1 = segunda, 2 = terça. */
function diaDaSemanaQueVem(diaDaSemana: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number) as [number, number, number];
  const base = new Date(Date.UTC(a, m - 1, d));
  const isoHoje = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
  base.setUTCDate(base.getUTCDate() + (8 - isoHoje) + (diaDaSemana - 1));
  return base.toISOString().slice(0, 10);
}
const brasileiro = (iso: string) => iso.split("-").reverse().join("/");

async function abrirAba(page: Page, nome: string) {
  await page.getByRole("tab", { name: nome }).click();
  await expect(page.getByRole("tab", { name: nome })).toHaveAttribute("aria-selected", "true");
}

test.beforeAll(() => {
  // Semana padrão da casa (segunda fechada; terça das 10h às 23h30) e nenhuma data especial.
  sql(`UPDATE horario_unidade SET aberta = false, abre = NULL, ultimo_pedido = NULL, fecha = NULL WHERE dia = 1`);
  sql(`UPDATE horario_unidade SET aberta = true, abre = '10:00', ultimo_pedido = '23:00', fecha = '23:30' WHERE dia = 2`);
  sql(`UPDATE horario_unidade_data SET ativo = false WHERE ativo`);
});

test("gerente geral muda o percentual e vê a prévia", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/gestao");
  expect(await nomesDoMenu(page)).toContain("Clube E-MOTION");
  await page.goto("/clube");
  await expect(page.getByRole("heading", { name: "Clube E-MOTION", level: 1 })).toBeVisible();
  await expect(page.getByTestId("faixa-do-clube")).toHaveText(
    "O Clube começa a funcionar para os clientes junto com o aplicativo do cliente (delivery próprio). Aqui a equipe já deixa as regras prontas.",
  );
  await expect(page.getByTestId("selo-do-clube")).toHaveText("Desligado");
  await expect(page.getByTestId("so-ler")).toHaveCount(0);

  const frase = page.getByTestId("frase-da-previa");
  // Nasce com 10% em todas as categorias, todo o horário de venda.
  await expect(frase).toHaveText("Num pedido de R$ 50,00 agora: desconto de R$ 5,00 (quando o Clube for ligado)");
  await page.getByLabel("Desconto (%)").fill("12,5");
  await expect(frase).toHaveText("Num pedido de R$ 50,00 agora: desconto de R$ 6,25 (quando o Clube for ligado)");
  await page.getByLabel("Pedido de exemplo (R$)").fill("80,00");
  await expect(frase).toHaveText("Num pedido de R$ 80,00 agora: desconto de R$ 10,00 (quando o Clube for ligado)");
  await page.getByLabel("Teto do desconto por pedido (R$)").fill("8,00");
  await expect(frase).toHaveText("Num pedido de R$ 80,00 agora: desconto de R$ 8,00 (limitado pelo teto) (quando o Clube for ligado)");
  await page.getByLabel("Clube ligado").check();
  await expect(frase).toHaveText("Num pedido de R$ 80,00 agora: desconto de R$ 8,00 (limitado pelo teto)");

  // Percentual acima de 50%: a tela explica e nada é gravado.
  await page.getByLabel("Desconto (%)").fill("60");
  await page.getByRole("button", { name: "Salvar desconto" }).click();
  await expect(avisoNaTela(page)).toHaveText("Desconto: escreva um número de 0 a 50, por exemplo 10 ou 7,5.");
  expect((await painel(page)).regras.descontoPb).toBe(1000);

  await page.getByLabel("Desconto (%)").fill("12,5");
  await page.getByRole("button", { name: "Salvar desconto" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText("Desconto do aplicativo salvo.");
  await expect(page.getByTestId("selo-do-clube")).toHaveText("Ligado");
  const r = (await painel(page)).regras;
  expect(r).toMatchObject({ ligado: true, descontoPb: 1250, tetoDescontoCentavos: 800, todasAsCategorias: true });
  // Recarregada, a tela mostra o que foi gravado.
  await page.reload();
  await expect(page.getByLabel("Desconto (%)")).toHaveValue("12,5");
  await expect(page.getByLabel("Teto do desconto por pedido (R$)")).toHaveValue("8,00");
});

test("marca só uma categoria e muda o horário de um dia", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/clube");
  const cafeteria = (await painel(page)).categorias.find((c) => c.nome === "Cafeteria" && c.ativo)!;
  expect(cafeteria).toBeTruthy();
  await page.getByLabel("Só nas categorias escolhidas").check();
  await expect(page.getByLabel("Cafeteria")).toBeVisible();
  // Nenhuma marcada: a tela explica antes de mandar.
  await page.getByRole("button", { name: "Salvar desconto" }).click();
  await expect(avisoNaTela(page)).toHaveText('Marque pelo menos uma categoria, ou escolha "Vale em todas as categorias".');
  await page.getByLabel("Cafeteria").check();

  const terca = page.getByTestId("desconto-dia-2");
  await terca.getByLabel("Só das ... às ...").check();
  await terca.getByRole("textbox", { name: "Das (terça)" }).fill("14");
  await terca.getByRole("textbox", { name: "Das (terça)" }).blur();
  await expect(terca.getByRole("textbox", { name: "Das (terça)" })).toHaveValue("14:00");
  await terca.getByRole("textbox", { name: "Às (terça)" }).fill("17:00");
  await page.getByTestId("desconto-dia-6").getByLabel("Sem desconto").check();
  await page.getByRole("button", { name: "Salvar desconto" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText("Desconto do aplicativo salvo.");

  const r = (await painel(page)).regras;
  expect(r.todasAsCategorias).toBe(false);
  expect(r.categorias).toEqual([cafeteria.id]);
  expect(r.horarios.find((h) => h.dia === 2)).toEqual({ dia: 2, modo: "janela", inicio: "14:00", fim: "17:00" });
  expect(r.horarios.find((h) => h.dia === 6)).toMatchObject({ modo: "sem_desconto" });
  await page.reload();
  await expect(page.getByLabel("Cafeteria")).toBeChecked();
  await expect(page.getByLabel("Almoço")).not.toBeChecked();
  await expect(page.getByTestId("sem-categoria-ativa")).toHaveCount(0);

  // A única categoria marcada sai de uso no cadastro: a tela avisa que o desconto não vale.
  sql(`UPDATE categoria SET ativo = false WHERE id = ${cafeteria.id}`);
  try {
    await page.reload();
    await expect(page.getByTestId("sem-categoria-ativa")).toHaveText(
      "O Clube está ligado, mas nenhuma categoria marcada está ativa. Sem categoria, o desconto não vale.",
    );
  } finally {
    sql(`UPDATE categoria SET ativo = true WHERE id = ${cafeteria.id}`);
  }
  await page.reload();
  await expect(page.getByTestId("sem-categoria-ativa")).toHaveCount(0);
});

test("cria e desativa um prêmio", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/clube");
  await abrirAba(page, "Pontos e prêmios");
  await expect(page.getByTestId("frase-dos-pontos")).toHaveText("R$ 25,90 pago = 25 pontos");
  await page.getByLabel("Pontos por real pago").fill("2");
  await expect(page.getByTestId("frase-dos-pontos")).toHaveText("R$ 25,90 pago = 50 pontos");

  await page.getByRole("button", { name: "Adicionar prêmio" }).click();
  const janela = page.getByRole("dialog", { name: "Novo prêmio" });
  await janelaNoCentro(page, janela);
  await janela.getByLabel("Nome do prêmio").fill(PREMIO);
  await janela.getByRole("button", { name: "Criar prêmio" }).click();
  await expect(avisoNaTela(page)).toHaveText("Pontos para trocar: um número inteiro de 1 a 100.000.");
  await janela.getByLabel("Pontos para trocar").fill("100");
  await janela.getByLabel("Descrição (opcional)").fill("Um café expresso por conta da casa.");
  await janela.getByLabel("Produto do prêmio (opcional)").selectOption({ label: "Café expresso" });
  await janela.getByRole("button", { name: "Criar prêmio" }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Prêmio ${PREMIO} criado.`);
  const cartao = page.getByTestId(`premio-${PREMIO}`);
  await expect(cartao.getByTestId("pontos-do-premio")).toHaveText("100 pontos");
  await expect(cartao).toContainText("Produto: Café expresso");
  const p = (await painel(page)).premios.find((x) => x.nome === PREMIO)!;
  const cafe = (await painel(page)).produtos.find((x) => x.nome === "Café expresso")!;
  expect(p).toMatchObject({ pontos: 100, produtoId: cafe.id, ativo: true });

  await page.getByRole("button", { name: `Desativar ${PREMIO}` }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Prêmio ${PREMIO} desativado.`);
  await expect(cartao).toHaveClass(/hor-cat--inativa/);
  await expect(cartao).toContainText("Desativado");
  await expect(page.getByRole("button", { name: `Reativar ${PREMIO}` })).toBeVisible();
  expect((await painel(page)).premios.find((x) => x.id === p.id)!.ativo).toBe(false);
  // O desativado fica no fim da lista e continua lá (nada se apaga).
  const nomes = await page.getByTestId("premios").locator(".hor-cat__nome").allTextContents();
  expect(nomes.at(-1)).toBe(PREMIO);
  // Os pontos digitados e não salvos ficam na tela; salva agora.
  await page.getByRole("button", { name: "Salvar pontos" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText("Pontos por real salvos.");
});

test("liga um presente com produto grátis", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/clube");
  await abrirAba(page, "Presentes");
  const cartao = page.getByTestId("presente-aniversario");
  await expect(cartao.getByTestId("situacao-do-presente")).toHaveText("Desligado");
  await expect(cartao.getByTestId("frase-do-presente")).toHaveText("O membro ganha: 15% de desconto");
  await cartao.getByLabel("Presente ligado").check();
  await cartao.getByLabel("O que o membro ganha").selectOption({ label: "Um produto grátis" });
  await cartao.getByRole("button", { name: "Salvar Aniversário" }).click();
  await expect(avisoNaTela(page)).toHaveText("Escolha o produto do presente.");
  await cartao.getByLabel("Produto grátis").selectOption({ label: "Café expresso" });
  await expect(cartao.getByTestId("frase-do-presente")).toHaveText("O membro ganha: Café expresso grátis");
  await cartao.getByLabel("Mensagem (opcional)").fill("Feliz aniversário! Um café por nossa conta.");
  await expect(cartao.getByText("43 de 140 letras")).toBeVisible();
  await cartao.getByRole("button", { name: "Salvar Aniversário" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText('Presente "Aniversário" salvo.');
  await expect(page.getByTestId("presente-aniversario").getByTestId("situacao-do-presente")).toHaveText("Ligado");

  const dados = await painel(page);
  const cafe = dados.produtos.find((x) => x.nome === "Café expresso")!;
  expect(dados.presentes.find((x) => x.tipo === "aniversario")).toMatchObject({ ligado: true, beneficio: "produto", valor: null, produtoId: cafe.id });
  // Os outros dois não mudaram.
  expect(dados.presentes.find((x) => x.tipo === "boas_vindas")).toMatchObject({ ligado: false, beneficio: "desconto_percentual", valor: 1000 });
});

test("agenda uma campanha na terça às 15h, edita e cancela com motivo; segunda é recusada", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await page.goto("/clube");
  await abrirAba(page, "Campanhas");
  await expect(page.getByTestId("aviso-das-campanhas")).toHaveText(
    "Campanhas só saem por notificação do aplicativo, para quem aceitou receber ofertas, e só com a casa aberta. Nada por WhatsApp, SMS ou e-mail.",
  );
  const terca = diaDaSemanaQueVem(2);
  const segunda = diaDaSemanaQueVem(1);

  await page.getByRole("button", { name: "Agendar campanha" }).click();
  const janela = page.getByRole("dialog", { name: "Agendar campanha" });
  await janelaNoCentro(page, janela);
  // Uma loja só: nada para escolher.
  await expect(janela.getByLabel("Loja")).toHaveCount(0);
  await janela.getByLabel("Título").fill(CAMPANHA);
  await janela.getByLabel("Texto").fill("Cada real pago vale o dobro de pontos.");
  await expect(janela.getByTestId("contador-do-texto")).toHaveText("38 de 180 letras");
  const previa = janela.getByTestId("previa-da-notificacao");
  await expect(previa.locator(".clube__notificacao-titulo")).toHaveText(CAMPANHA);
  await expect(previa.locator(".clube__notificacao-texto")).toHaveText("Cada real pago vale o dobro de pontos.");
  await janela.getByLabel("Para quem").selectOption({ label: "Aniversariantes do mês" });

  // Segunda: a casa está fechada; a mensagem é a do servidor.
  await janela.getByLabel("Dia e hora do envio").fill(`${segunda}T15:00`);
  await janela.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(avisoNaTela(page)).toHaveText("Esse horário está fora do horário da casa. Campanha só sai com a casa aberta.");
  expect((await painel(page)).campanhas.find((c) => c.titulo === CAMPANHA)).toBeUndefined();

  await janela.getByLabel("Dia e hora do envio").fill(`${terca}T15:00`);
  await janela.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Campanha "${CAMPANHA}" agendada.`);
  const cartao = page.getByTestId(`campanha-${CAMPANHA}`);
  await expect(cartao.getByTestId("situacao-da-campanha")).toHaveText("Agendada");
  await expect(cartao.getByTestId("quando-da-campanha")).toHaveText(`Terça, ${brasileiro(terca)} às 15:00`);
  await expect(cartao).toContainText("Criada por");
  await expect(cartao).toContainText("Aniversariantes do mês");
  const c = (await painel(page)).campanhas.find((x) => x.titulo === CAMPANHA)!;
  expect(c).toMatchObject({ enviarEm: `${terca}T15:00`, situacao: "agendada" });

  // Editar: título e hora.
  await page.getByRole("button", { name: `Editar ${CAMPANHA}` }).click();
  const edicao = page.getByRole("dialog", { name: `Editar ${CAMPANHA}` });
  await expect(edicao.getByLabel("Dia e hora do envio")).toHaveValue(`${terca}T15:00`);
  await edicao.getByLabel("Título").fill(CAMPANHA_NOVA);
  await edicao.getByLabel("Dia e hora do envio").fill(`${terca}T16:30`);
  await edicao.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(edicao).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Campanha "${CAMPANHA_NOVA}" salva.`);
  const editada = page.getByTestId(`campanha-${CAMPANHA_NOVA}`);
  await expect(editada.getByTestId("quando-da-campanha")).toHaveText(`Terça, ${brasileiro(terca)} às 16:30`);
  expect((await painel(page)).campanhas.find((x) => x.id === c.id)).toMatchObject({ titulo: CAMPANHA_NOVA, enviarEm: `${terca}T16:30` });

  // Cancelar pede o motivo.
  await page.getByRole("button", { name: `Cancelar ${CAMPANHA_NOVA}` }).click();
  const confirmar = editada.getByTestId("cancelar-campanha");
  await confirmar.getByRole("button", { name: "Cancelar campanha" }).click();
  await expect(avisoNaTela(page)).toHaveText("Escreva o motivo do cancelamento (pelo menos 2 letras).");
  await confirmar.getByLabel("Motivo do cancelamento").fill("A promoção mudou de data.");
  await confirmar.getByRole("button", { name: "Cancelar campanha" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Campanha "${CAMPANHA_NOVA}" cancelada.`);
  await expect(editada.getByTestId("situacao-da-campanha")).toHaveText("Cancelada");
  await expect(editada.getByTestId("motivo-do-cancelamento")).toHaveText("Motivo do cancelamento: A promoção mudou de data.");
  await expect(page.getByRole("button", { name: `Editar ${CAMPANHA_NOVA}` })).toHaveCount(0);
  expect((await painel(page)).campanhas.find((x) => x.id === c.id)).toMatchObject({ situacao: "cancelada", motivoCancelamento: "A promoção mudou de data." });

  // Limite por semana: fica nas regras.
  await page.getByLabel("Campanhas por semana (no máximo)").fill("3");
  await page.getByRole("button", { name: "Salvar limite" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText("Limite de campanhas salvo.");
  expect(((await painel(page)).regras as unknown as { campanhasPorSemana: number }).campanhasPorSemana).toBe(3);
});

for (const cargo of ["atendente", "supervisor"] as const) {
  test(`${cargo} não vê o item e recebe o bloqueio`, async ({ page }) => {
    await entrar(page, loginDoCargo(cargo));
    if (cargo === "supervisor") {
      await page.goto("/gestao");
      expect(await nomesDoMenu(page)).not.toContain("Clube E-MOTION");
    }
    await page.goto("/clube");
    await expect(page.getByRole("heading", { name: "Seu cargo não permite esta tela" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Clube E-MOTION", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("faixa-do-clube")).toHaveCount(0);
    expect((await page.request.get("/api/clube")).status()).toBe(403);
    expect((await page.request.post("/api/clube/regras", { data: { descontoPb: 100 } })).status()).toBe(403);
  });
}

test.describe("celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("todas as abas e a janela da campanha sem rolagem de lado", async ({ page }) => {
    await entrar(page, "gerente.geral");
    await page.goto("/clube");
    await expect(page.getByTestId("aba-desconto")).toBeVisible();
    await semEstouroDeLargura(page);
    for (const aba of ["Pontos e prêmios", "Presentes", "Campanhas"]) {
      await abrirAba(page, aba);
      await semEstouroDeLargura(page);
    }
    await page.getByRole("button", { name: "Agendar campanha" }).click();
    const janela = page.getByRole("dialog", { name: "Agendar campanha" });
    await expect(janela).toBeVisible();
    await janelaSemEstouro(page);
    await semEstouroDeLargura(page);
  });
});
