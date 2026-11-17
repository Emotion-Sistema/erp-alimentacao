/**
 * Catálogo pronto de ingredientes comuns de cafeteria e lanchonete (ideia nº 4, 15/11/2026).
 * Só SUGESTÃO para cadastrar rápido: nada aqui vira cadastro sem a pessoa marcar e confirmar,
 * e tudo pode ser ajustado antes de gravar. Embalagens são as de costume no atacado; a casa
 * confere. O teste `cadastro-rapido.teste.ts` grava cada item num banco de teste: se uma embalagem
 * ferir a regra de conversão (decisão 0015), o CI quebra.
 *
 * Formato da embalagem: [nome, quantidade na unidade do estoque]. Nome com tamanho
 * ("saco 25 kg") tem de valer exatamente o tamanho (25000 g).
 */
import type { AreaEstoque, UnidadeBase } from "./cadastros";

export type ItemDoCatalogo = {
  nome: string;
  unidadeBase: UnidadeBase;
  area: AreaEstoque;
  /** Outros nomes pelos quais a pessoa procura ("mussarela", "muçarela"). */
  sinonimos?: readonly string[];
  embalagens: readonly (readonly [string, string])[];
  /** Categoria de compra (corredor), para a lista de compras da frente lista-de-compras. */
  grupo: GrupoDoCatalogo;
};

export const GRUPOS_DO_CATALOGO = [
  "Hortifrúti",
  "Carnes e frios",
  "Laticínios e ovos",
  "Mercearia",
  "Padaria",
  "Molhos e temperos",
  "Bebidas",
  "Cafeteria",
  "Congelados",
  "Descartáveis e embalagens",
] as const;
export type GrupoDoCatalogo = (typeof GRUPOS_DO_CATALOGO)[number];

const g = "g" as const;
const ml = "ml" as const;
const un = "un" as const;

const i = (
  grupo: GrupoDoCatalogo,
  nome: string,
  unidadeBase: UnidadeBase,
  area: AreaEstoque,
  embalagens: (readonly [string, string])[],
  sinonimos?: string[],
): ItemDoCatalogo => ({ grupo, nome, unidadeBase, area, embalagens, ...(sinonimos ? { sinonimos } : {}) });

export const CATALOGO_INGREDIENTES: readonly ItemDoCatalogo[] = [
  // Hortifrúti
  i("Hortifrúti", "Tomate", g, "cozinha", [["caixa 20 kg", "20000"], ["unidade", "120"]]),
  i("Hortifrúti", "Cebola", g, "cozinha", [["saco 20 kg", "20000"], ["unidade", "150"]]),
  i("Hortifrúti", "Alho", g, "cozinha", [["pacote 1 kg", "1000"], ["cabeça", "40"]]),
  i("Hortifrúti", "Alface", un, "cozinha", [["caixa 12 un", "12"]], ["alface americana", "alface crespa"]),
  i("Hortifrúti", "Batata", g, "cozinha", [["saco 25 kg", "25000"]], ["batata inglesa"]),
  i("Hortifrúti", "Cenoura", g, "cozinha", [["caixa 20 kg", "20000"]]),
  i("Hortifrúti", "Pimentão", g, "cozinha", [["caixa 10 kg", "10000"], ["unidade", "150"]]),
  i("Hortifrúti", "Limão", un, "cozinha", [["saco 3 kg", "40"]], ["limão taiti"]),
  i("Hortifrúti", "Laranja", un, "cafeteria", [["saco 3 kg", "15"]]),
  i("Hortifrúti", "Banana", un, "cafeteria", [["cacho", "18"]]),
  i("Hortifrúti", "Morango", g, "cafeteria", [["bandeja 250 g", "250"]]),
  i("Hortifrúti", "Abacaxi", un, "cafeteria", []),
  i("Hortifrúti", "Mamão", un, "cafeteria", []),
  i("Hortifrúti", "Salsinha", g, "cozinha", [["maço", "100"]], ["salsa", "cheiro-verde"]),
  i("Hortifrúti", "Cebolinha", g, "cozinha", [["maço", "100"]]),
  i("Hortifrúti", "Rúcula", g, "cozinha", [["maço", "150"]]),
  i("Hortifrúti", "Pepino", g, "cozinha", [["caixa 15 kg", "15000"]]),
  i("Hortifrúti", "Repolho", g, "cozinha", [["unidade", "1500"]]),
  i("Hortifrúti", "Mandioca", g, "cozinha", [["saco 20 kg", "20000"]], ["aipim", "macaxeira"]),
  // Carnes e frios
  i("Carnes e frios", "Carne moída", g, "cozinha", [["pacote 1 kg", "1000"]], ["patinho moído"]),
  i("Carnes e frios", "Hambúrguer bovino", un, "cozinha", [["caixa 36 un", "36"]], ["blend", "burger"]),
  i("Carnes e frios", "Peito de frango", g, "cozinha", [["pacote 1 kg", "1000"], ["caixa 20 kg", "20000"]], ["filé de frango"]),
  i("Carnes e frios", "Coxa e sobrecoxa", g, "cozinha", [["caixa 20 kg", "20000"]]),
  i("Carnes e frios", "Contrafilé", g, "cozinha", [["peça", "4000"]]),
  i("Carnes e frios", "Alcatra", g, "cozinha", [["peça", "5000"]]),
  i("Carnes e frios", "Picanha", g, "cozinha", [["peça", "1200"]]),
  i("Carnes e frios", "Fraldinha", g, "cozinha", [["peça", "1500"]]),
  i("Carnes e frios", "Costela bovina", g, "cozinha", [["caixa 20 kg", "20000"]]),
  i("Carnes e frios", "Lombo suíno", g, "cozinha", [["peça", "2000"]]),
  i("Carnes e frios", "Linguiça toscana", g, "cozinha", [["pacote 5 kg", "5000"]], ["linguiça"]),
  i("Carnes e frios", "Calabresa", g, "cozinha", [["pacote 2,5 kg", "2500"]], ["linguiça calabresa"]),
  i("Carnes e frios", "Bacon", g, "cozinha", [["pacote 1 kg", "1000"]]),
  i("Carnes e frios", "Presunto", g, "cozinha", [["peça", "3500"]]),
  i("Carnes e frios", "Peito de peru", g, "cozinha", [["peça", "2000"]]),
  i("Carnes e frios", "Salsicha", un, "cozinha", [["pacote 3 kg", "60"]]),
  i("Carnes e frios", "Filé de tilápia", g, "cozinha", [["caixa 5 kg", "5000"]], ["peixe"]),
  i("Carnes e frios", "Camarão", g, "cozinha", [["pacote 1 kg", "1000"]]),
  // Laticínios e ovos
  i("Laticínios e ovos", "Ovo", un, "cozinha", [["caixa 30 un", "30"], ["bandeja 30 un", "30"]], ["ovos"]),
  i("Laticínios e ovos", "Leite integral", ml, "cafeteria", [["caixa 1 l", "1000"], ["fardo 12 l", "12000"]], ["leite"]),
  i("Laticínios e ovos", "Leite desnatado", ml, "cafeteria", [["caixa 1 l", "1000"], ["fardo 12 l", "12000"]]),
  i("Laticínios e ovos", "Leite sem lactose", ml, "cafeteria", [["caixa 1 l", "1000"], ["fardo 12 l", "12000"]]),
  i("Laticínios e ovos", "Queijo muçarela", g, "cozinha", [["peça 4 kg", "4000"], ["pacote 1 kg", "1000"]], ["mussarela", "muçarela", "mozzarella"]),
  i("Laticínios e ovos", "Queijo prato", g, "cozinha", [["peça 3 kg", "3000"]]),
  i("Laticínios e ovos", "Queijo cheddar", g, "cozinha", [["pacote 1,01 kg", "1010"]], ["cheddar"]),
  i("Laticínios e ovos", "Queijo parmesão", g, "cozinha", [["pacote 1 kg", "1000"]], ["parmesão ralado"]),
  i("Laticínios e ovos", "Queijo minas", g, "cozinha", [["peça", "500"]], ["queijo branco", "minas frescal"]),
  i("Laticínios e ovos", "Requeijão cremoso", g, "cozinha", [["bisnaga 1,5 kg", "1500"], ["copo 200 g", "200"]], ["requeijão", "catupiry"]),
  i("Laticínios e ovos", "Cream cheese", g, "cozinha", [["pote 1,2 kg", "1200"]]),
  i("Laticínios e ovos", "Manteiga", g, "cozinha", [["pote 500 g", "500"], ["tablete 200 g", "200"]]),
  i("Laticínios e ovos", "Margarina", g, "cozinha", [["pote 500 g", "500"], ["balde 3 kg", "3000"]]),
  i("Laticínios e ovos", "Creme de leite", g, "cozinha", [["caixa 200 g", "200"], ["caixa 1,01 kg", "1010"]]),
  i("Laticínios e ovos", "Leite condensado", g, "cafeteria", [["caixa 395 g", "395"], ["lata 395 g", "395"], ["bag 2,5 kg", "2500"]]),
  i("Laticínios e ovos", "Chantilly", ml, "cafeteria", [["caixa 1 l", "1000"]]),
  i("Laticínios e ovos", "Iogurte natural", g, "cafeteria", [["pote 170 g", "170"]]),
  // Mercearia
  i("Mercearia", "Arroz", g, "cozinha", [["pacote 5 kg", "5000"], ["fardo 30 kg", "30000"]], ["arroz branco", "arroz agulhinha"]),
  i("Mercearia", "Feijão carioca", g, "cozinha", [["pacote 1 kg", "1000"], ["fardo 10 kg", "10000"]], ["feijão"]),
  i("Mercearia", "Feijão preto", g, "cozinha", [["pacote 1 kg", "1000"], ["fardo 10 kg", "10000"]]),
  i("Mercearia", "Macarrão espaguete", g, "cozinha", [["pacote 500 g", "500"]], ["espaguete", "massa"]),
  i("Mercearia", "Macarrão penne", g, "cozinha", [["pacote 500 g", "500"]], ["penne"]),
  i("Mercearia", "Farinha de trigo", g, "cozinha", [["pacote 1 kg", "1000"], ["saco 25 kg", "25000"]], ["trigo"]),
  i("Mercearia", "Farinha de rosca", g, "cozinha", [["pacote 500 g", "500"]], ["farinha panko", "panko"]),
  i("Mercearia", "Farinha de mandioca", g, "cozinha", [["pacote 1 kg", "1000"]], ["farofa"]),
  i("Mercearia", "Fubá", g, "cozinha", [["pacote 1 kg", "1000"]]),
  i("Mercearia", "Amido de milho", g, "cozinha", [["caixa 500 g", "500"]], ["maisena"]),
  i("Mercearia", "Açúcar refinado", g, "cafeteria", [["pacote 1 kg", "1000"], ["fardo 10 kg", "10000"]], ["açúcar"]),
  i("Mercearia", "Açúcar cristal", g, "cafeteria", [["pacote 5 kg", "5000"]]),
  i("Mercearia", "Açúcar em sachê", un, "cafeteria", [["caixa 400 un", "400"]], ["sachê de açúcar"]),
  i("Mercearia", "Adoçante em sachê", un, "cafeteria", [["caixa 400 un", "400"]]),
  i("Mercearia", "Sal refinado", g, "cozinha", [["pacote 1 kg", "1000"]], ["sal"]),
  i("Mercearia", "Óleo de soja", ml, "cozinha", [["garrafa 900 ml", "900"], ["caixa 20 garrafas", "18000"], ["galão 18 l", "18000"]], ["óleo"]),
  i("Mercearia", "Azeite de oliva", ml, "cozinha", [["garrafa 500 ml", "500"]], ["azeite"]),
  i("Mercearia", "Vinagre", ml, "cozinha", [["garrafa 750 ml", "750"]]),
  i("Mercearia", "Milho verde em conserva", g, "cozinha", [["lata 170 g", "170"], ["lata 2 kg", "2000"]], ["milho"]),
  i("Mercearia", "Ervilha em conserva", g, "cozinha", [["lata 170 g", "170"]], ["ervilha"]),
  i("Mercearia", "Azeitona", g, "cozinha", [["balde 2 kg", "2000"]]),
  i("Mercearia", "Palmito", g, "cozinha", [["vidro 300 g", "300"]]),
  i("Mercearia", "Batata palha", g, "cozinha", [["pacote 1 kg", "1000"]]),
  i("Mercearia", "Chocolate em pó", g, "cafeteria", [["pacote 1 kg", "1000"]], ["cacau em pó"]),
  i("Mercearia", "Achocolatado", g, "cafeteria", [["pacote 1 kg", "1000"]]),
  i("Mercearia", "Granola", g, "cafeteria", [["pacote 1 kg", "1000"]]),
  i("Mercearia", "Aveia", g, "cafeteria", [["pacote 500 g", "500"]]),
  i("Mercearia", "Mel", g, "cafeteria", [["pote 1 kg", "1000"]]),
  i("Mercearia", "Fermento biológico", g, "cozinha", [["pacote 500 g", "500"]]),
  i("Mercearia", "Fermento químico", g, "cozinha", [["lata 250 g", "250"]], ["fermento em pó"]),
  // Padaria
  i("Padaria", "Pão de hambúrguer", un, "cozinha", [["pacote 6 un", "6"], ["caixa 36 un", "36"]], ["pão brioche"]),
  i("Padaria", "Pão francês", un, "cozinha", [], ["pão de sal", "pãozinho"]),
  i("Padaria", "Pão de forma", g, "cozinha", [["pacote 500 g", "500"]]),
  i("Padaria", "Pão de queijo congelado", un, "cafeteria", [["pacote 1 kg", "40"]]),
  i("Padaria", "Croissant", un, "cafeteria", []),
  i("Padaria", "Tortilha (wrap)", un, "cozinha", [["pacote 10 un", "10"]], ["wrap", "rap10"]),
  // Molhos e temperos
  i("Molhos e temperos", "Maionese", g, "cozinha", [["balde 3 kg", "3000"], ["sachê", "8"]]),
  i("Molhos e temperos", "Ketchup", g, "cozinha", [["galão 3,2 kg", "3200"], ["sachê", "7"]], ["catchup"]),
  i("Molhos e temperos", "Mostarda", g, "cozinha", [["galão 3 kg", "3000"], ["sachê", "7"]]),
  i("Molhos e temperos", "Molho barbecue", g, "cozinha", [["galão 3 kg", "3000"]], ["barbecue", "bbq"]),
  i("Molhos e temperos", "Molho de tomate", g, "cozinha", [["sachê 340 g", "340"], ["bag 2 kg", "2000"]], ["extrato de tomate"]),
  i("Molhos e temperos", "Molho shoyu", ml, "cozinha", [["garrafa 1 l", "1000"]], ["shoyu"]),
  i("Molhos e temperos", "Molho inglês", ml, "cozinha", [["garrafa 150 ml", "150"]]),
  i("Molhos e temperos", "Pimenta-do-reino", g, "cozinha", [["pacote 500 g", "500"]]),
  i("Molhos e temperos", "Orégano", g, "cozinha", [["pacote 500 g", "500"]]),
  i("Molhos e temperos", "Páprica", g, "cozinha", [["pacote 500 g", "500"]], ["páprica defumada"]),
  i("Molhos e temperos", "Colorau", g, "cozinha", [["pacote 500 g", "500"]], ["urucum"]),
  i("Molhos e temperos", "Caldo de carne", g, "cozinha", [["pote 1,01 kg", "1010"]]),
  i("Molhos e temperos", "Caldo de galinha", g, "cozinha", [["pote 1,01 kg", "1010"]]),
  // Bebidas
  i("Bebidas", "Refrigerante lata", un, "bebidas_salao", [["fardo 12 un", "12"]], ["refri", "coca", "guaraná"]),
  i("Bebidas", "Refrigerante 2 l", un, "bebidas_salao", [["fardo 6 un", "6"]]),
  i("Bebidas", "Refrigerante 600 ml", un, "bebidas_salao", [["fardo 12 un", "12"]]),
  i("Bebidas", "Água mineral sem gás", un, "bebidas_salao", [["fardo 12 un", "12"]], ["água"]),
  i("Bebidas", "Água mineral com gás", un, "bebidas_salao", [["fardo 12 un", "12"]]),
  i("Bebidas", "Suco em lata", un, "bebidas_salao", [["fardo 6 un", "6"]]),
  i("Bebidas", "Suco integral", ml, "cafeteria", [["garrafa 1,5 l", "1500"]], ["suco de uva"]),
  i("Bebidas", "Polpa de fruta", g, "cafeteria", [["pacote 1 kg", "1000"], ["unidade", "100"]], ["polpa"]),
  i("Bebidas", "Cerveja lata", un, "bebidas_salao", [["fardo 12 un", "12"]], ["cerveja"]),
  i("Bebidas", "Cerveja long neck", un, "bebidas_salao", [["fardo 24 un", "24"]]),
  i("Bebidas", "Energético", un, "bebidas_salao", [["fardo 6 un", "6"]]),
  i("Bebidas", "Chá gelado", un, "bebidas_salao", [["fardo 6 un", "6"]]),
  // Cafeteria
  i("Cafeteria", "Café em grãos", g, "cafeteria", [["pacote 1 kg", "1000"], ["pacote 500 g", "500"]], ["café"]),
  i("Cafeteria", "Café moído", g, "cafeteria", [["pacote 500 g", "500"]]),
  i("Cafeteria", "Cápsula de café", un, "cafeteria", [["caixa 10 un", "10"]]),
  i("Cafeteria", "Chá em sachê", un, "cafeteria", [["caixa 15 un", "15"]], ["chá"]),
  i("Cafeteria", "Calda de chocolate", g, "cafeteria", [["bisnaga 1,3 kg", "1300"]], ["cobertura de chocolate"]),
  i("Cafeteria", "Calda de caramelo", g, "cafeteria", [["bisnaga 1,3 kg", "1300"]], ["caramelo"]),
  i("Cafeteria", "Xarope de baunilha", ml, "cafeteria", [["garrafa 700 ml", "700"]], ["xarope"]),
  i("Cafeteria", "Canela em pó", g, "cafeteria", [["pacote 500 g", "500"]], ["canela"]),
  i("Cafeteria", "Açaí", ml, "cafeteria", [["balde 10 l", "10000"]], ["polpa de açaí"]),
  // Congelados
  i("Congelados", "Batata pré-frita congelada", g, "cozinha", [["pacote 2 kg", "2000"], ["caixa 10 kg", "10000"]], ["batata frita", "batata palito"]),
  i("Congelados", "Nuggets de frango", g, "cozinha", [["pacote 1 kg", "1000"]], ["nuggets"]),
  i("Congelados", "Anéis de cebola", g, "cozinha", [["pacote 1 kg", "1000"]], ["onion rings"]),
  i("Congelados", "Coxinha congelada", un, "cozinha", [["pacote 50 un", "50"]], ["coxinha", "salgado congelado"]),
  i("Congelados", "Pastel congelado", un, "cozinha", [["pacote 20 un", "20"]], ["pastel"]),
  i("Congelados", "Massa de pastel", g, "cozinha", [["pacote 1 kg", "1000"]]),
  i("Congelados", "Polenta congelada", g, "cozinha", [["pacote 1 kg", "1000"]]),
  i("Congelados", "Mandioca congelada", g, "cozinha", [["pacote 1 kg", "1000"]], ["aipim congelado"]),
  // Descartáveis e embalagens
  i("Descartáveis e embalagens", "Copo descartável 300 ml", un, "cafeteria", [["pacote 100 un", "100"], ["caixa 2500 un", "2500"]], ["copo"]),
  i("Descartáveis e embalagens", "Copo de café 180 ml", un, "cafeteria", [["pacote 50 un", "50"]], ["copo de papel"]),
  i("Descartáveis e embalagens", "Tampa de copo", un, "cafeteria", [["pacote 100 un", "100"]]),
  i("Descartáveis e embalagens", "Canudo", un, "bebidas_salao", [["pacote 100 un", "100"]]),
  i("Descartáveis e embalagens", "Guardanapo", un, "bebidas_salao", [["pacote 50 un", "50"], ["fardo 2000 un", "2000"]]),
  i("Descartáveis e embalagens", "Embalagem de hambúrguer", un, "cozinha", [["pacote 100 un", "100"]], ["caixa de hambúrguer"]),
  i("Descartáveis e embalagens", "Marmitex de alumínio", un, "cozinha", [["caixa 100 un", "100"]], ["marmita", "quentinha"]),
  i("Descartáveis e embalagens", "Pote descartável com tampa", un, "cozinha", [["pacote 25 un", "25"]], ["pote"]),
  i("Descartáveis e embalagens", "Sacola para delivery", un, "cozinha", [["pacote 100 un", "100"]], ["sacola"]),
  i("Descartáveis e embalagens", "Talher descartável", un, "cozinha", [["pacote 50 un", "50"]], ["garfo descartável", "kit talher"]),
  i("Descartáveis e embalagens", "Papel-manteiga", un, "cozinha", [["pacote 500 un", "500"]], ["papel acoplado"]),
];

/** Texto para comparar: minúsculas, sem acento, espaços juntados. */
/**
 * Itens com a unidade em dúvida: o catálogo e as fichas técnicas não batem (perguntas 1 e 2 em
 * `cerebro/empresa/fichas-tecnicas/perguntas.md`; resposta do responsável prevista para 22/11/2026).
 * Saem do cadastro rápido com asterisco e não podem ser marcados; no cadastro comum, aviso.
 * Quando a resposta chegar: corrigir a unidade de cada um aqui e esvaziar esta lista.
 */
export const NOMES_A_CONFIRMAR: readonly string[] = [
  "Laranja",
  "Banana",
  "Abacaxi",
  "Limão",
  "Alface",
  "Hambúrguer bovino",
  "Açaí",
  "Leite condensado",
  "Chantilly",
  "Creme de leite",
  "Molho de tomate",
];
export const AVISO_A_CONFIRMAR = "Unidade a confirmar com o responsável (resposta das fichas técnicas prevista para 22/11). Não cadastre ainda.";

/** O item (ou o nome digitado, inclusive apelido) está entre os de unidade a confirmar? */
export function aConfirmar(item: string | ItemDoCatalogo): boolean {
  const chaves = new Set(
    CATALOGO_INGREDIENTES.filter((c) => NOMES_A_CONFIRMAR.includes(c.nome)).flatMap((c) => [c.nome, ...(c.sinonimos ?? [])].map(chaveDeBusca)),
  );
  return chaves.has(chaveDeBusca(typeof item === "string" ? item : item.nome));
}

export function chaveDeBusca(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Itens do catálogo cujo nome ou sinônimo contém o texto (o começo do nome vem antes). */
export function buscarNoCatalogo(texto: string, limite = 8): ItemDoCatalogo[] {
  const t = chaveDeBusca(texto);
  if (t.length < 2) return [];
  const pontos = (item: ItemDoCatalogo) => {
    const nomes = [item.nome, ...(item.sinonimos ?? [])].map(chaveDeBusca);
    if (nomes.some((n) => n === t)) return 3;
    if (nomes.some((n) => n.startsWith(t))) return 2;
    if (nomes.some((n) => n.includes(t))) return 1;
    return 0;
  };
  return CATALOGO_INGREDIENTES.map((item) => ({ item, p: pontos(item) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.item.nome.localeCompare(b.item.nome, "pt-BR"))
    .slice(0, limite)
    .map((x) => x.item);
}
