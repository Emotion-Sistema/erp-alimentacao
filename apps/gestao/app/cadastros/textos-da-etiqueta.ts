/** Textos do código da etiqueta do lote (ideia nº 16), no cadastro do ingrediente e no preparo da casa. */
export const TEXTOS_DA_ETIQUETA = {
  titulo: "Etiqueta do lote",
  intro: "Cada lote que entra ganha uma etiqueta com este código e um número, para escrever no pacote.",
  codigo: "Código da etiqueta",
  codigoAjuda: "Gerado pelo nome. Vai em cada lote: BAC-001, BAC-002...",
  codigoExemplo: "BAC para o bacalhau. Pode trocar por outro, como BCL.",
  usa: "Usa etiqueta",
  usaAjuda: "Desligue para o que não precisa de etiqueta, como sal, açúcar e descartáveis.",
  usaExemplo: "Desligado no sal: a compra de sal entra sem código para escrever no pacote.",
  /** Mesma frase do servidor (o servidor é quem decide). */
  formato: "Use de 2 a 5 letras sem acento (pode ter número depois da primeira letra), como BAC.",
  semCodigo: "Sem código ainda.",
  naoUsa: "Não usa etiqueta",
  salvar: "Salvar etiqueta",
  salvando: "Salvando...",
  salvo: "Etiqueta salva.",
  ingredienteSemEtiqueta: (msg: string) => `Ingrediente salvo, mas a etiqueta não: ${msg}`,
  /** Na lista, ao lado do nome (só para leitor de tela). */
  codigoNaLista: "código da etiqueta",
};
