/**
 * Correções feitas no painel (ideia nº 13 do cliente): a pessoa corrige uma célula na tela da
 * importação, sem abrir a planilha. A tela manda o arquivo de novo + a lista de correções; o
 * servidor aplica as correções sobre a tabela lida e só DEPOIS confere tudo, como se a planilha
 * tivesse vindo assim. Vale para as duas importações (cadastros e fichas), ao conferir e ao gravar.
 * Nada aqui confia na tela: linha, coluna e valor são conferidos aqui. Roda só no servidor.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { ErroDeRegra } from "./erros";
import { LIMITE_DE_COLUNAS, LIMITE_DE_CORRECOES, letraDaColuna, type CorrecaoDeCelula } from "./importar-comum";
import { limparCelula, type TabelaLida } from "./planilha-ler";

export const TAMANHO_MAXIMO_DA_CORRECAO = 500;

export const esquemaCorrecoes = z
  .array(
    z.object(
      {
        linha: z.number({ error: "Correção sem o número da linha." }).int().min(1, "Número de linha inválido na correção.").max(1_048_576, "Número de linha inválido na correção."),
        coluna: z
          .number({ error: "Correção sem a coluna." })
          .int()
          .min(0, "Coluna inválida na correção.")
          .max(LIMITE_DE_COLUNAS - 1, "Coluna inválida na correção."),
        valor: z
          .string({ error: "Correção sem o valor." })
          .max(TAMANHO_MAXIMO_DA_CORRECAO, `Correção longa demais (máximo ${TAMANHO_MAXIMO_DA_CORRECAO} letras).`)
          .refine((v) => !/\p{Cc}/u.test(v), "Correção com caractere inválido."),
      },
      { error: "Correção em formato inválido." },
    ),
    { error: "Correções em formato inválido." },
  )
  .max(LIMITE_DE_CORRECOES, `Correções demais de uma vez (máximo ${LIMITE_DE_CORRECOES.toLocaleString("pt-BR")}). Grave uma parte e importe o resto depois.`)
  .default([]);

/** A mesma célula corrigida duas vezes: vale a última. Ordem estável (linha, coluna). */
export function correcoesQueValem(correcoes: readonly CorrecaoDeCelula[]): CorrecaoDeCelula[] {
  const porCelula = new Map<string, CorrecaoDeCelula>();
  for (const c of correcoes) {
    const k = `${c.linha}:${c.coluna}`;
    porCelula.delete(k);
    porCelula.set(k, { linha: c.linha, coluna: c.coluna, valor: limparCelula(c.valor) });
  }
  return [...porCelula.values()].sort((a, b) => a.linha - b.linha || a.coluna - b.coluna);
}

/**
 * Aplica as correções numa CÓPIA da tabela. Linha que não existe (ou que estava vazia) e o
 * cabeçalho são recusados com explicação; coluna além da última da planilha também.
 */
export function aplicarCorrecoes(tabela: TabelaLida, correcoes: readonly CorrecaoDeCelula[]): TabelaLida {
  if (!correcoes.length) return tabela;
  const linhas = tabela.linhas.map((l) => ({ numero: l.numero, celulas: [...l.celulas] }));
  const cabecalho = linhas[0];
  const largura = Math.max(...linhas.map((l) => l.celulas.length));
  const porNumero = new Map(linhas.map((l) => [l.numero, l]));
  for (const c of correcoesQueValem(correcoes)) {
    if (cabecalho && c.linha === cabecalho.numero)
      throw new ErroDeRegra("dados_invalidos", `A linha ${c.linha} é o cabeçalho (o nome das colunas): ela não se corrige por aqui. Troque a coluna no passo das colunas ou corrija na planilha.`);
    const l = porNumero.get(c.linha);
    if (!l) throw new ErroDeRegra("dados_invalidos", `Correção na linha ${c.linha}: essa linha não existe na planilha (ou está vazia). Desfaça essa correção e confira de novo.`);
    if (c.coluna >= largura) throw new ErroDeRegra("dados_invalidos", `Correção na linha ${c.linha}: a coluna ${letraDaColuna(c.coluna)} não existe nesta planilha.`);
    while (l.celulas.length <= c.coluna) l.celulas.push("");
    l.celulas[c.coluna] = c.valor;
  }
  return { ...tabela, linhas };
}

/** Resumo estável das correções, para a assinatura da importação (idempotência). */
export function assinaturaDasCorrecoes(correcoes: readonly CorrecaoDeCelula[]): string {
  const valem = correcoesQueValem(correcoes);
  if (!valem.length) return "";
  return createHash("sha256").update(JSON.stringify(valem.map((c) => [c.linha, c.coluna, c.valor]))).digest("hex");
}
