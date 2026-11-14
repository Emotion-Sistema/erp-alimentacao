/** Erros de regra com código estável, traduzidos em resposta HTTP pela borda. */
export class ErroDeRegra extends Error {
  constructor(
    readonly codigo: "nao_autenticado" | "sem_permissao" | "dados_invalidos" | "conflito" | "nao_encontrado",
    mensagem: string,
  ) {
    super(mensagem);
  }
}
