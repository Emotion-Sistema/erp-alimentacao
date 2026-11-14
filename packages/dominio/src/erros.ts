/** Erros de regra com código estável, traduzidos em resposta HTTP pela borda. */
export type CodigoDeErro =
  | "nao_autenticado"
  | "sem_permissao"
  | "dados_invalidos"
  | "conflito"
  | "nao_encontrado"
  | "bloqueado" // muitas tentativas erradas
  | "segundo_fator" // falta confirmar o código do aplicativo autenticador
  | "confirmar_codigo"; // ação sensível na estação: digite o código pessoal de novo

export class ErroDeRegra extends Error {
  constructor(
    readonly codigo: CodigoDeErro,
    mensagem: string,
  ) {
    super(mensagem);
  }
}
