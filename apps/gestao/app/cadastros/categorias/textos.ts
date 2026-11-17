/**
 * Textos da tela "Categorias" (português simples, sem " · "). Os do horário de cada categoria
 * vêm de ../horarios/textos.ts (mesma grade de 7 dias).
 */
export const TC = {
  pagina: {
    titulo: "Categorias",
    intro: "As seções do cardápio: Cafeteria, Almoço, Porções... Cada categoria pode ter um horário próprio na loja e no delivery, dentro do horário do canal.",
    nova: "Nova categoria",
    carregando: "Carregando as categorias...",
    nenhuma: "Nenhuma categoria cadastrada.",
    desativadas: "Desativadas",
    desativadasExplicacao: "Não aparecem no cardápio. Nada foi apagado: dá para reativar.",
    soLerHorario: "Só o gerente geral, o dono e o administrador mudam horários.",
  },
  cartao: {
    ordem: (n: number) => `Ordem ${n}`,
    semDescricao: "Sem descrição.",
    situacao: (canal: string, frase: string) => `${canal}: ${frase}`,
    desativada: "Desativada",
    editar: (nome: string) => `Editar ${nome}`,
    desativar: (nome: string) => `Desativar ${nome}`,
    reativar: (nome: string) => `Reativar ${nome}`,
    horario: "Horário da categoria",
    horarioNome: (nome: string) => `Horário de ${nome}`,
  },
  janela: {
    nova: "Nova categoria",
    editar: (nome: string) => `Editar ${nome}`,
    nome: "Nome",
    nomeAjuda: "Como aparece no cardápio e nas listas. De 2 a 40 letras.",
    nomeExemplo: "Sobremesas.",
    descricao: "Descrição (opcional)",
    descricaoAjuda: "Uma frase curta sobre o que entra nesta categoria.",
    descricaoExemplo: "Doces, tortas e sorvetes de massa da casa.",
    ordem: "Ordem no cardápio",
    ordemAjuda: "Número menor aparece primeiro. Deixe espaço entre elas (10, 20, 30) para encaixar outra depois.",
    ordemExemplo: "70 (depois de Bebidas, que é 60).",
    criar: "Criar categoria",
    salvar: "Salvar alteração",
    cancelar: "Cancelar",
    faltaNome: "Escreva o nome (pelo menos 2 letras).",
    ordemInvalida: "Ordem: um número inteiro de 0 a 9999.",
  },
  avisos: {
    criada: (nome: string) => `Categoria ${nome} criada.`,
    salva: (nome: string) => `Categoria ${nome} salva.`,
    desativada: (nome: string) => `Categoria ${nome} desativada.`,
    reativada: (nome: string) => `Categoria ${nome} reativada.`,
    desfeito: (nome: string) => `Pronto: ${nome} voltou.`,
  },
};
