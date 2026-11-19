/** Textos da tela "Adicionais" (português simples, sem " · "). Decisão 0021. */
import { textoDosCentavos } from "@erp/dominio/produtos";

/** A regra do grupo em linguagem simples: "Opcional, até 3", "Obrigatório: escolha 1", "Escolha de 2 a 4". */
export function regraDoGrupo(minimo: number, maximo: number): string {
  if (minimo === 0) return `Opcional, até ${maximo}`;
  if (minimo === maximo) return `Obrigatório: escolha ${minimo}`;
  return `Escolha de ${minimo} a ${maximo}`;
}

/** Preço de um adicional: "grátis" quando 0. */
export const precoDoAdicional = (centavos: number) => (centavos === 0 ? "grátis" : textoDosCentavos(centavos));

export const TA = {
  pagina: {
    titulo: "Adicionais",
    intro:
      "Grupos de escolhas que o cliente faz num produto, como o ponto da carne ou um bacon a mais. Um grupo pode ser usado em vários produtos; quem liga o grupo ao produto é a janela do produto.",
    novo: "Novo grupo",
    carregando: "Carregando os grupos...",
    nenhum: "Nenhum grupo de adicionais cadastrado.",
    ativos: "Em uso",
    foraDeUso: "Fora de uso",
    foraDeUsoExplicacao: "Não aparecem para o cliente. Nada foi apagado: dá para reativar.",
    irParaProdutos: "Ir para Produtos",
  },
  cartao: {
    desativado: "Desativado",
    usadoEm: (n: number) => (n === 0 ? "Não está em nenhum produto ativo" : n === 1 ? "Usado em 1 produto" : `Usado em ${n} produtos`),
    vezes: (n: number) => `até ${n} vezes`,
    delivery: (texto: string) => `delivery ${texto}`,
    semItens: "Nenhum item neste grupo.",
    itens: (nome: string) => `Itens de ${nome}`,
    editar: (nome: string) => `Editar ${nome}`,
    desativar: (nome: string) => `Desativar ${nome}`,
    reativar: (nome: string) => `Reativar ${nome}`,
  },
  janela: {
    novo: "Novo grupo de adicionais",
    editar: (nome: string) => `Editar ${nome}`,
    nome: "Nome do grupo",
    nomeAjuda: "Como o cliente vê a pergunta. De 2 a 40 letras.",
    nomeExemplo: "Ponto da carne; Molhos; Turbine seu lanche.",
    obrigatoria: "Escolha obrigatória?",
    obrigatoriaAjuda: "Marque se o cliente precisa escolher para poder pedir (ex.: o ponto da carne). Sem marcar, é opcional.",
    obrigatoriaExemplo: "Marcado para Ponto da carne; desmarcado para Turbine seu lanche.",
    minimo: "Mínimo de escolhas",
    minimoAjuda: "Quantas escolhas, no mínimo, o cliente precisa fazer. De 1 até o máximo.",
    minimoExemplo: "1 (escolher um ponto da carne).",
    maximo: "Máximo de escolhas",
    maximoAjuda: (max: number) => `Quantas escolhas, no máximo, cabem neste grupo (somando as vezes de cada item). De 1 a ${max}.`,
    maximoExemplo: "3 (até três adicionais no lanche).",
    itens: "Itens do grupo",
    itensAjuda: "Cada item tem nome, preço (0 = grátis) e quantas vezes pode entrar no mesmo pedido. A ordem aqui é a que o cliente vê.",
    itensExemplo: "Bacon, R$ 4,00, até 2 vezes; Ao ponto, 0 (grátis), 1 vez.",
    item: "Item",
    itemSemNome: (n: number) => `item ${n}`,
    precoItem: "Preço (R$)",
    precoDelivery: "Preço no delivery (R$)",
    igualLoja: "igual à loja",
    vezes: "Vezes por item",
    complemento: (n: number) => `do item ${n}`,
    deliveryDiferente: "Algum item tem preço diferente no delivery",
    adicionarItem: "Adicionar item",
    limiteItens: (max: number) => `Este grupo já tem ${max} itens (o máximo).`,
    nenhumItem: "Nenhum item ainda. Toque em Adicionar item.",
    criar: "Criar grupo",
    salvar: "Salvar alteração",
    cancelar: "Cancelar",
    faltaNome: "Escreva o nome do grupo (pelo menos 2 letras).",
    maximoInvalido: (max: number) => `Máximo de escolhas: um número inteiro de 1 a ${max}.`,
    minimoInvalido: "Mínimo de escolhas: um número inteiro de 1 até o máximo.",
    faltaItem: "Escolha obrigatória precisa de pelo menos um item.",
    itemSemNomeErro: (n: number) => `Escreva o nome do item ${n}.`,
    itemPrecoInvalido: (nome: string) => `${nome}: preço inválido. Escreva em reais, por exemplo 4,00 (ou 0 para grátis).`,
    itemDeliveryInvalido: (nome: string) => `${nome}: preço no delivery inválido. Deixe vazio para ser igual à loja.`,
    itemVezesInvalido: (nome: string, max: number) => `${nome}: vezes por item de 1 a ${max}.`,
  },
  avisos: {
    criado: (nome: string) => `Grupo ${nome} criado.`,
    salvo: (nome: string) => `Grupo ${nome} salvo.`,
    desativado: (nome: string) => `Grupo ${nome} desativado.`,
    reativado: (nome: string) => `Grupo ${nome} reativado.`,
    desfeito: (nome: string) => `Pronto: ${nome} voltou.`,
  },
};
