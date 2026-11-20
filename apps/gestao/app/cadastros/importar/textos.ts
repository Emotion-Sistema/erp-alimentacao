/** Textos da tela "Importar planilha" (português simples, sem " · "). Decisão 0020. */
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

export const TI = {
  pagina: {
    titulo: "Importar planilha",
    intro:
      "Cadastre vários ingredientes ou produtos de uma vez a partir de uma planilha (.xlsx ou .csv) ou de uma página .html com tabela. Primeiro o sistema confere linha por linha e mostra o que está certo e o que precisa corrigir. Nada é gravado até você apertar Gravar.",
    voltar: { ingredientes: "Voltar para Ingredientes", produtos: "Voltar para Produtos" },
  },
  passo1: {
    titulo: "1. O que vai importar",
    tipo: "O que vai importar",
    tipoAjuda: "Uma planilha é de um tipo só: ingredientes do estoque ou produtos do cardápio.",
    tipoExemplo: "Produtos, para uma lista com nome, categoria e preço de cada item do cardápio.",
    opcao: { ingredientes: "Ingredientes", produtos: "Produtos" },
    modelo: "Não tem planilha pronta? Baixe o modelo com as colunas certas e duas linhas de exemplo:",
    modeloXlsx: "Baixar modelo (.xlsx)",
    modeloCsv: "Baixar modelo (.csv)",
    colunas: "Colunas que o sistema entende",
    obrigatoria: "obrigatória",
    opcional: "opcional",
  },
  passo2: {
    titulo: "2. Escolha o arquivo",
    arquivo: "Arquivo da planilha",
    arquivoAjuda: "Planilha .xlsx (Excel), .csv ou página .html com tabela. Até 2 MB e 2.000 linhas. A primeira linha é o cabeçalho (o nome de cada coluna).",
    arquivoExemplo: "cardapio.xlsx, com Nome, Categoria e Preço na primeira linha e um produto em cada linha de baixo.",
    escolhido: (nome: string) => `Arquivo: ${nome}`,
    conferindo: "Conferindo a planilha...",
    grande: "Arquivo grande demais: o máximo é 2 MB. Divida a planilha em partes.",
    semLeitura: "Não deu para ler o arquivo neste aparelho. Tente de novo.",
  },
  passo3: {
    titulo: "3. Confira as colunas",
    intro: (linha: number) => `O cabeçalho está na linha ${linha}. Veja qual coluna da planilha o sistema usou para cada campo e troque se estiver errado.`,
    naoUsar: "Não usar",
    opcaoColuna: (letra: string, texto: string) => `Coluna ${letra}: ${texto || "(sem título)"}`,
    obrigatorio: (rotulo: string) => `${rotulo} (obrigatório)`,
    faltam: (campos: string[]) => `Escolha a coluna de: ${campos.join(", ")}. Sem ela, todas as linhas ficam com erro.`,
  },
  passo4: {
    titulo: "4. Resultado da conferência",
    filtro: "Mostrar",
    filtroAjuda: "Escolha quais linhas ver. O número entre parênteses é quantas há.",
    filtroExemplo: "Com erro, para ver só o que precisa corrigir.",
    filtros: { todas: "Todas", ok: "Prontas", erro: "Com erro", ja_existe: "Já cadastradas", pulada: "Puladas" },
    linhas: "Linhas da planilha",
    linhasAjuda: "Cada linha mostra o que foi entendido. Nas linhas com erro, aperte Corrigir aqui para arrumar ali mesmo, ou marque Pular para importar sem ela.",
    linhasExemplo: "Linha 5 com erro na Coluna B (Categoria): aperte Corrigir aqui, escolha a categoria certa e confira de novo; ou marque Pular a linha 5.",
    linha: (n: number) => `Linha ${n}`,
    pular: (n: number) => `Pular a linha ${n}`,
    nenhuma: "Nenhuma linha neste filtro.",
    mostrarMais: (n: number) => `Mostrar mais ${n}`,
    relatorio: "Baixar relatório de erros (.csv)",
    jaExiste: "Já está cadastrado: esta linha será pulada.",
  },
  passo5: {
    titulo: "5. Gravar",
    explicacao: "Grava tudo de uma vez: ou entra tudo, ou nada. Antes de gravar, o sistema confere tudo de novo.",
    gravar: (n: number, tipo: { um: string; varios: string }) => `Gravar ${plural(n, tipo.um, tipo.varios)}`,
    gravando: "Gravando...",
    corrija: (n: number) => `Para gravar, corrija ${plural(n, "linha com erro", "linhas com erro")} (em Corrigir aqui, ou na planilha e escolha o arquivo de novo) ou marque Pular nelas.`,
    nadaPronto: "Nenhuma linha pronta para gravar.",
    pronto: (r: { criados: number; jaExistiam: number; puladas: number }, tipo: { um: string; varios: string }) =>
      [
        `Pronto: ${plural(r.criados, `${tipo.um} cadastrado`, `${tipo.varios} cadastrados`)}.`,
        r.jaExistiam ? `${plural(r.jaExistiam, "já estava cadastrado e foi pulado", "já estavam cadastrados e foram pulados")}.` : "",
        r.puladas ? `${plural(r.puladas, "linha pulada", "linhas puladas")} por você.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    repetida: "Esta planilha já tinha sido gravada: nada foi importado de novo.",
    ver: { ingredientes: "Ver os ingredientes", produtos: "Ver os produtos" },
    outra: "Importar outro arquivo",
  },
  tipoTrocado: {
    trocar: (rotulo: string) => `Trocar para ${rotulo}`,
  },
};

/** Textos de "Corrigir no painel" (ideia nº 13), usados nas duas importações (cadastros e fichas). */
export const TC = {
  corrigirAqui: "Corrigir aqui",
  naLinha: (n: number) => `a linha ${n}`,
  titulo: (n: number) => `Corrigir a linha ${n}`,
  intro: "Troque o que estiver errado e aperte Aplicar e conferir de novo. O arquivo no seu aparelho não muda; o sistema confere tudo de novo com a correção.",
  comProblema: (rotulo: string) => `${rotulo} (com problema)`,
  vazio: "(vazio)",
  comoEsta: (v: string) => `Como está: ${v.slice(0, 40)}`,
  aplicar: "Aplicar e conferir de novo",
  cancelar: "Cancelar",
  nadaMudou: "Mude algum campo para poder aplicar.",
  feitas: (n: number) => `${plural(n, "correção feita", "correções feitas")} no painel`,
  descricao: (linha: number, rotulo: string, antes: string, depois: string) => `Linha ${linha}, ${rotulo}: "${antes || "(vazio)"}" virou "${depois || "(vazio)"}"`,
  desfazer: "Desfazer",
  desfazerQual: (linha: number, rotulo: string) => `a correção da linha ${linha}, ${rotulo}`,
  baixar: "Baixar a planilha corrigida (.csv)",
  baixarAviso:
    "O arquivo sai igual ao que o sistema leu, já corrigido, para guardar ou importar de novo. Se abrir no Excel, confira as células que começam com = + - ou @: o Excel pode tratá-las como fórmula.",
  cortada: "Este texto é longo e aparece cortado aqui. Se você mudar este campo, o que estiver escrito substitui o texto inteiro da célula.",
  semUso: "Esta coluna não é usada nesta importação; pode deixar como está.",
  semUsoExemplo: "Deixe como está.",
  colunaSemNome: (letra: string) => `Coluna ${letra}`,
};
