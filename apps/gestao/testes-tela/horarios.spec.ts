import { expect, test, type Page } from "@playwright/test";
import { entrar, janelaNoCentro, janelaSemEstouro, semEstouroDeLargura } from "./ajudas";

// Horários de venda (E07 parte 2): faixa Agora, semana da loja, canais, datas especiais e pausas.
// Roda contra o banco de tela real. A ordem importa (mode serial): a data especial usa a segunda
// ainda fechada da semana padrão; depois a semana abre o dia inteiro, para a faixa "Agora" dar
// "Vendendo agora" a qualquer hora em que o teste rodar.

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

/** "AAAA-MM-DD" no fuso da unidade, daqui a `dias` dias. */
function dataDaqui(dias: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
/** A próxima segunda (de 1 a 7 dias daqui). */
function proximaSegunda(): string {
  for (let i = 1; i <= 7; i++) {
    const d = dataDaqui(i);
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === 1) return d;
  }
  throw new Error("sem segunda");
}
const curta = (data: string) => {
  const [, m, d] = data.split("-");
  const siglas = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return `${siglas[new Date(`${data}T12:00:00Z`).getUTCDay()]}, ${d}/${m}`;
};

async function abrir(page: Page) {
  await page.goto("/cadastros/horarios");
  await expect(page.getByRole("heading", { name: "Horários de venda", level: 1 })).toBeVisible();
  await expect(page.getByTestId("semana-da-loja")).toBeVisible();
}
const diaDaSemana = (page: Page, nome: string) => page.getByTestId("semana-da-loja").getByRole("group", { name: nome, exact: true });
const diaDoCanal = (page: Page, nome: string) => page.getByTestId("canais").getByRole("group", { name: nome, exact: true });

test("datas especiais: loja inteira fechada, delivery com horário, aviso do dia fechado e cancelar", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrir(page);
  await expect(page.getByTestId("faixa-agora")).toContainText("Loja");
  await expect(page.getByTestId("faixa-agora")).toContainText("Delivery");
  await expect(page.getByTestId("datas-especiais")).toContainText("Nenhuma data especial marcada.");

  // Loja inteira fechada num feriado.
  const feriado = dataDaqui(10);
  await page.getByRole("button", { name: "Nova data especial" }).click();
  let janela = page.getByRole("dialog", { name: "Nova data especial" });
  await janelaNoCentro(page, janela);
  await janela.getByLabel("Data").fill(feriado);
  await expect(janela.getByRole("radio", { name: "Loja inteira" })).toBeChecked();
  await expect(janela.getByRole("radio", { name: "Fechado" })).toBeChecked();
  // Sem motivo, a tela pede antes de mandar.
  await janela.getByRole("button", { name: "Salvar data especial" }).click();
  await expect(janela.getByRole("alert")).toContainText("Escreva o motivo");
  await janela.getByLabel("Motivo", { exact: true }).fill("Feriado de teste");
  await janela.getByRole("button", { name: "Salvar data especial" }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Data especial de ${curta(feriado)} salva.`);
  const item = page.getByTestId(`data-${feriado}-loja-inteira`);
  await expect(item).toContainText("Loja inteira");
  await expect(item).toContainText("Fechado");
  await expect(item).toContainText("Feriado de teste");

  // Só o delivery, com horário diferente.
  const evento = dataDaqui(11);
  await page.getByRole("button", { name: "Nova data especial" }).click();
  janela = page.getByRole("dialog", { name: "Nova data especial" });
  await janela.getByLabel("Data").fill(evento);
  await janela.getByRole("radio", { name: "Só o delivery" }).check();
  await janela.getByRole("radio", { name: "Horário diferente" }).check();
  await janela.getByLabel("Início").fill("18");
  await janela.getByLabel("Fim").fill("22h");
  await janela.getByLabel("Motivo", { exact: true }).fill("Evento de teste");
  await janela.getByRole("button", { name: "Salvar data especial" }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId(`data-${evento}-delivery-canal`)).toContainText("18h às 22h");
  await expect(page.getByTestId(`data-${evento}-delivery-canal`)).toContainText("Delivery");

  // Abrir a loja numa segunda (fechada na semana): a tela avisa sobre o delivery e as categorias.
  await page.getByRole("button", { name: "Nova data especial" }).click();
  janela = page.getByRole("dialog", { name: "Nova data especial" });
  await janela.getByLabel("Data").fill(proximaSegunda());
  await janela.getByRole("radio", { name: "Horário diferente" }).check();
  await expect(janela.getByTestId("aviso-dia-fechado")).toContainText("O delivery e as categorias seguem a semana deste dia");
  await janela.getByRole("radio", { name: "Só o delivery" }).check();
  await expect(janela.getByTestId("aviso-dia-fechado")).toHaveCount(0);
  await janelaSemEstouro(page);
  // Mexeu: Fechar pergunta antes de descartar.
  await janela.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(janela).toBeHidden();

  // Cancelar pede confirmação; "Não" mantém; "Sim, cancelar" tira da lista (nada se apaga no banco).
  await item.getByRole("button", { name: `Cancelar a data de ${curta(feriado)}` }).click();
  await item.getByRole("button", { name: "Não" }).click();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: `Cancelar a data de ${curta(feriado)}` }).click();
  await expect(item.getByRole("alertdialog")).toContainText("O dia volta ao horário da semana.");
  await item.getByRole("button", { name: "Sim, cancelar" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText(`Data especial de ${curta(feriado)} cancelada.`);
  await expect(item).toHaveCount(0);
  await expect(page.getByTestId(`data-${evento}-delivery-canal`)).toBeVisible();
});

test("gerente salva a semana: confere a ordem, copia para os outros dias e a faixa Agora acompanha", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrir(page);
  const salvar = page.getByRole("button", { name: "Salvar semana" });
  await expect(salvar).toBeDisabled();
  // A segunda vem fechada (semana padrão).
  const segunda = diaDaSemana(page, "Segunda");
  await expect(segunda.getByRole("checkbox", { name: "Aberta" })).not.toBeChecked();
  await expect(segunda).toContainText("Loja fechada neste dia.");

  // Ordem errada: avisa no dia e não manda.
  const terca = diaDaSemana(page, "Terça");
  await terca.getByLabel("Último pedido da cozinha (terça)").fill("09:00");
  await terca.getByLabel("Abre (terça)").click();
  await expect(terca.getByRole("alert")).toHaveText("O último pedido precisa ser depois de abrir.");
  await expect(salvar).toBeEnabled();
  await salvar.click();
  await expect(page.getByTestId("semana-da-loja").getByRole("alert").last()).toContainText("Corrija os dias marcados");

  // Abre a segunda, escreve o dia inteiro na terça (com o jeito curto de digitar) e copia.
  await segunda.getByRole("checkbox", { name: "Aberta" }).check();
  await terca.getByLabel("Abre (terça)").fill("0");
  await terca.getByLabel("Último pedido da cozinha (terça)").fill("24");
  await terca.getByLabel("Fecha (terça)").fill("24h");
  await terca.getByLabel("Fecha (terça)").blur();
  await expect(terca.getByLabel("Abre (terça)")).toHaveValue("00:00");
  await expect(terca.getByLabel("Fecha (terça)")).toHaveValue("24:00");
  await terca.getByRole("button", { name: "Copiar o horário de terça para os outros dias abertos" }).click();
  for (const dia of ["Segunda", "Quarta", "Domingo"]) await expect(diaDaSemana(page, dia).getByLabel(`Último pedido da cozinha (${dia.toLowerCase()})`)).toHaveValue("24:00");
  await salvar.click();
  await expect(page.getByTestId("aviso-rapido")).toContainText("Semana da loja salva.");
  await expect(salvar).toBeDisabled();
  await expect(page.getByTestId("agora-loja")).toContainText("Vendendo agora");

  // Gravou de verdade.
  await page.reload();
  await expect(diaDaSemana(page, "Segunda").getByRole("checkbox", { name: "Aberta" })).toBeChecked();
  await expect(diaDaSemana(page, "Sábado").getByLabel("Abre (sábado)")).toHaveValue("00:00");
  // A grade do canal mostra o que vale de fato (a loja inteira, agora o dia todo).
  await expect(diaDoCanal(page, "Segunda").getByTestId("vale")).toContainText("0h às 24h");
});

test("delivery com horário próprio: escolhas por dia, o que vale de fato e salvar", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrir(page);
  await page.getByTestId("canais").getByRole("tab", { name: "Delivery" }).click();
  await expect(page.getByTestId("canais").getByRole("tab", { name: "Delivery" })).toHaveAttribute("aria-selected", "true");
  const sexta = diaDoCanal(page, "Sexta");
  await expect(sexta.getByRole("radio", { name: "Igual à loja" })).toBeChecked();
  await sexta.getByRole("radio", { name: "Horário próprio" }).check();
  await sexta.getByLabel("Início (sexta)").fill("18");
  await sexta.getByLabel("Fim (sexta)").fill("23");
  await sexta.getByLabel("Fim (sexta)").blur();
  await expect(sexta.getByTestId("vale")).toContainText("18h às 23h");
  const quarta = diaDoCanal(page, "Quarta");
  await quarta.getByRole("radio", { name: "Fechado" }).check();
  await expect(quarta.getByTestId("vale")).toContainText("Não vende");
  // Início depois do fim: a tela avisa.
  const quinta = diaDoCanal(page, "Quinta");
  await quinta.getByRole("radio", { name: "Horário próprio" }).check();
  await quinta.getByLabel("Início (quinta)").fill("20:00");
  await quinta.getByLabel("Fim (quinta)").fill("19:00");
  await expect(quinta.getByRole("alert")).toHaveText("O início precisa ser antes do fim.");
  await quinta.getByRole("radio", { name: "Igual à loja" }).check();
  await page.getByRole("button", { name: "Salvar horário do delivery" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText("Horário do delivery salvo.");

  await page.reload();
  await page.getByTestId("canais").getByRole("tab", { name: "Delivery" }).click();
  await expect(diaDoCanal(page, "Sexta").getByRole("radio", { name: "Horário próprio" })).toBeChecked();
  await expect(diaDoCanal(page, "Sexta").getByLabel("Início (sexta)")).toHaveValue("18:00");
  await expect(diaDoCanal(page, "Quarta").getByRole("radio", { name: "Fechado" })).toBeChecked();
  await expect(diaDoCanal(page, "Quinta").getByRole("radio", { name: "Igual à loja" })).toBeChecked();
  // A loja não mudou.
  await page.getByTestId("canais").getByRole("tab", { name: "Loja" }).click();
  await expect(diaDoCanal(page, "Sexta").getByRole("radio", { name: "Igual à loja" })).toBeChecked();
});

test("pausar e retomar: a loja sai de venda na hora e volta", async ({ page }) => {
  await entrar(page, "gerente.geral");
  await abrir(page);
  await expect(page.getByTestId("pausas")).toContainText("Nada pausado agora.");
  await page.getByRole("button", { name: "Pausar agora" }).click();
  const janela = page.getByRole("dialog", { name: "Pausar agora" });
  await janelaNoCentro(page, janela);
  await janela.getByRole("radio", { name: "Só a loja" }).check();
  await janela.getByRole("radio", { name: "30 min" }).check();
  // Motivo é obrigatório; a sugestão preenche.
  await janela.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(janela.getByRole("alert")).toHaveText("Escreva o motivo da pausa.");
  await janela.getByRole("group", { name: "Sugestões de motivo" }).getByRole("button", { name: "Cozinha cheia" }).click();
  await expect(janela.getByLabel("Motivo", { exact: true })).toHaveValue("Cozinha cheia");
  await janela.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByTestId("aviso-rapido")).toContainText("Loja: pausado.");
  const pausa = page.getByTestId("pausas").getByRole("listitem");
  await expect(pausa).toHaveCount(1);
  await expect(pausa).toContainText("Loja");
  await expect(pausa).toContainText(/Até \d{1,2}h(\d{2})?/);
  await expect(pausa).toContainText("Pausado por");
  await expect(pausa).toContainText("Cozinha cheia");
  await expect(page.getByTestId("agora-loja")).toContainText(/Pausado até \d{1,2}h/);

  // Até retomar, para o delivery: sem prazo.
  await page.getByRole("button", { name: "Pausar agora" }).click();
  const outra = page.getByRole("dialog", { name: "Pausar agora" });
  await outra.getByRole("radio", { name: "Até eu retomar" }).check();
  await outra.getByLabel("Motivo", { exact: true }).fill("Sem motoboy");
  await outra.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(page.getByTestId("pausas").getByRole("listitem")).toHaveCount(2);
  await expect(page.getByTestId("pausas")).toContainText("Até alguém retomar");

  await page.getByRole("button", { name: "Retomar Loja" }).click();
  await expect(page.getByTestId("aviso-rapido")).toContainText("Loja: venda retomada.");
  await expect(page.getByTestId("agora-loja")).toContainText("Vendendo agora");
  await page.getByRole("button", { name: "Retomar Delivery" }).click();
  await expect(page.getByTestId("pausas")).toContainText("Nada pausado agora.");
});

test("supervisor vê tudo só para ler", async ({ page }) => {
  await entrar(page, "supervisor");
  await abrir(page);
  await expect(page.getByTestId("so-ler")).toHaveText("Só o gerente geral, o dono e o administrador mudam horários.");
  await expect(page.getByTestId("faixa-agora")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar semana" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Copiar o horário/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova data especial" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pausar agora" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Cancelar a data/ })).toHaveCount(0);
  await expect(diaDaSemana(page, "Terça").getByLabel("Abre (terça)")).toBeDisabled();
  await expect(diaDaSemana(page, "Terça").getByRole("checkbox", { name: "Aberta" })).toBeDisabled();
  await expect(diaDoCanal(page, "Sexta").getByRole("radio", { name: "Horário próprio" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Salvar horário/ })).toHaveCount(0);
  // A data especial do delivery criada pelo gerente aparece para ele.
  await expect(page.getByTestId("datas-especiais")).toContainText("Evento de teste");

  // O servidor recusa mesmo se alguém mandar direto.
  const r = await page.request.post("/api/horarios/pausas", { data: { canal: "loja", motivo: "Teste de permissão" } });
  expect(r.status()).toBe(403);
});

test("celular (390 px): os dias viram cartões e nada estoura", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, "gerente.geral");
  await abrir(page);
  await semEstouroDeLargura(page);
  // Num cartão de dia, as horas ficam abaixo do nome do dia (empilhado).
  const terca = diaDaSemana(page, "Terça");
  const nome = await terca.getByText("Terça", { exact: true }).boundingBox();
  const abre = await terca.getByLabel("Abre (terça)").boundingBox();
  expect(abre!.y).toBeGreaterThan(nome!.y + nome!.height - 1);
  await page.getByTestId("canais").getByRole("tab", { name: "Delivery" }).click();
  await semEstouroDeLargura(page);
  await page.getByRole("button", { name: "Pausar agora" }).click();
  await janelaSemEstouro(page);
  await page.getByRole("dialog", { name: "Pausar agora" }).getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Nova data especial" }).click();
  await page.getByRole("dialog", { name: "Nova data especial" }).getByRole("radio", { name: "Horário diferente" }).check();
  await janelaSemEstouro(page);
});

// Capturas para o responsável conferir (só quando pedidas: CAPTURAS_HORARIOS=<pasta>).
test.describe("capturas", () => {
  test.skip(!process.env.CAPTURAS_HORARIOS, "só com CAPTURAS_HORARIOS");
  const pasta = process.env.CAPTURAS_HORARIOS ?? "";
  for (const largura of [1280, 390]) {
    test(`capturas ${largura}`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: largura === 390 ? 844 : 900 });
      await entrar(page, "gerente.geral");
      await abrir(page);
      await page.screenshot({ path: `${pasta}/horarios-${largura}.png`, fullPage: true });
      await page.getByRole("button", { name: "Pausar agora" }).click();
      await page.screenshot({ path: `${pasta}/pausa-${largura}.png` });
      await page.getByRole("dialog", { name: "Pausar agora" }).getByRole("button", { name: "Cancelar" }).click();
      await page.goto("/cadastros/categorias");
      await page.getByRole("button", { name: "Horário de Almoço", exact: true }).click();
      await page.screenshot({ path: `${pasta}/categorias-${largura}.png`, fullPage: true });
    });
  }
});
