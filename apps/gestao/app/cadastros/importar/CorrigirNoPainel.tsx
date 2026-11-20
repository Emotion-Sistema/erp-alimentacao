"use client";

/**
 * Corrigir no painel (ideia nº 13 do cliente): peças usadas pelas DUAS importações (cadastros e
 * fichas). A tela só junta a lista de correções e mostra os campos; quem aplica e confere tudo de
 * novo é o servidor (a tela reenvia o arquivo + todas as correções a cada "Aplicar e conferir de
 * novo" e ao gravar). Componente cliente: nunca importa `@erp/dominio` raiz.
 */
import { useState } from "react";
import { Botao } from "@erp/interface";
import { linhasParaCsv, type CorrecaoDeCelula } from "@erp/dominio/importar";
import { AreaDeTexto, Campo, Selecao } from "../../Campo";
import { TC } from "./textos";

/** Uma correção como a tela guarda: o que vai ao servidor + o valor original e o nome da coluna (só para mostrar). */
export type CorrecaoFeita = CorrecaoDeCelula & { antes: string; rotulo: string };

/** Uma coluna da planilha, como campo para corrigir. */
export type ColunaParaCorrigir = { indice: number; rotulo: string; explicacao: string; exemplo: string; opcoes?: readonly string[] };

/**
 * Junta as correções novas à lista: a mesma célula fica com o valor novo (e o "antes" de origem);
 * voltar ao valor original desfaz a correção daquela célula.
 */
export function juntarCorrecoes(lista: readonly CorrecaoFeita[], novas: readonly CorrecaoFeita[]): CorrecaoFeita[] {
  const saida = [...lista];
  for (const n of novas) {
    const i = saida.findIndex((c) => c.linha === n.linha && c.coluna === n.coluna);
    const antes = i >= 0 ? saida[i]!.antes : n.antes;
    if (i >= 0) saida.splice(i, 1);
    if (n.valor !== antes) saida.push({ ...n, antes });
  }
  return saida;
}

/** Só o que o servidor precisa (linha, coluna, valor). */
export const paraEnviar = (lista: readonly CorrecaoFeita[]): CorrecaoDeCelula[] => lista.map(({ linha, coluna, valor }) => ({ linha, coluna, valor }));

/**
 * Baixa um .csv montado aqui na tela (a planilha já corrigida, devolvida pelo servidor). Sem o
 * apóstrofo contra fórmula: o arquivo é para importar de novo; o aviso fica ao lado do botão.
 */
export function baixarCsv(nome: string, tabela: readonly (readonly string[])[]) {
  const url = URL.createObjectURL(new Blob([linhasParaCsv(tabela, { protegerFormulas: false })], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "cardapio.xlsx" -> "cardapio-corrigida.csv". */
export const nomeDaCorrigida = (arquivo: string) => `${arquivo.replace(/\.[^.]+$/, "") || "planilha"}-corrigida.csv`;

/** Botão "Corrigir aqui" de uma linha (o número da linha vai para quem usa leitor de tela). */
export function BotaoCorrigir({ numero, aberto, disabled, onClick }: { numero: number; aberto: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Botao variante="secundario" className="imp-corrigir__abrir" aria-expanded={aberto} disabled={disabled} onClick={onClick} data-testid={`corrigir-${numero}`}>
      {TC.corrigirAqui}
      <span className="ajuda__so-leitor"> {TC.naLinha(numero)}</span>
    </Botao>
  );
}

/** Os campos de UMA linha da planilha: um por coluna, com o nome do cabeçalho; a coluna com problema fica destacada. */
export function CorrigirLinha({
  numero,
  colunas,
  celulas,
  comProblema,
  truncadas = new Set<number>(),
  ocupado,
  aoAplicar,
  aoCancelar,
}: {
  numero: number;
  colunas: readonly ColunaParaCorrigir[];
  celulas: readonly string[];
  comProblema: ReadonlySet<number>;
  /** Colunas cujo texto veio cortado (longo demais): corrigir substitui o texto inteiro, e a tela avisa. */
  truncadas?: ReadonlySet<number>;
  ocupado: boolean;
  aoAplicar: (novas: CorrecaoFeita[]) => void;
  aoCancelar: () => void;
}) {
  const [rascunho, setRascunho] = useState<string[]>(() => colunas.map((c) => celulas[c.indice] ?? ""));
  // As colunas com problema primeiro: é o que a pessoa veio corrigir.
  const ordem = [...colunas.keys()].sort((a, b) => Number(comProblema.has(colunas[b]!.indice)) - Number(comProblema.has(colunas[a]!.indice)));
  const mudancas = colunas.flatMap((c, i) => (rascunho[i] !== (celulas[c.indice] ?? "") ? [{ linha: numero, coluna: c.indice, valor: rascunho[i]!, antes: celulas[c.indice] ?? "", rotulo: c.rotulo }] : []));
  const mudar = (i: number, v: string) => setRascunho((r) => r.map((x, k) => (k === i ? v : x)));

  return (
    <form
      className="imp-corrigir"
      data-testid={`corrigindo-${numero}`}
      aria-label={TC.titulo(numero)}
      onSubmit={(e) => {
        e.preventDefault();
        if (mudancas.length) aoAplicar(mudancas);
      }}
    >
      <p className="imp-corrigir__titulo">{TC.titulo(numero)}</p>
      <p className="imp-corrigir__intro">{TC.intro}</p>
      <div className="imp-corrigir__campos">
        {ordem.map((i) => {
          const c = colunas[i]!;
          const problema = comProblema.has(c.indice);
          const rotulo = problema ? TC.comProblema(c.rotulo) : c.rotulo;
          const valor = rascunho[i] ?? "";
          const cortada = truncadas.has(c.indice);
          // Célula com quebra de linha: campo de várias linhas, que mantém as quebras.
          const variasLinhas = (celulas[c.indice] ?? "").includes("\n");
          return (
            <div key={c.indice} className={`imp-corrigir__campo${problema ? " imp-corrigir__campo--problema" : ""}`} data-coluna={c.indice}>
              {cortada && (
                <p className="imp-corrigir__cortada" data-testid={`cortada-${c.indice}`}>
                  {TC.cortada}
                </p>
              )}
              {c.opcoes ? (
                <Selecao
                  rotulo={rotulo}
                  explicacao={c.explicacao}
                  exemplo={c.exemplo}
                  value={valor}
                  disabled={ocupado}
                  onChange={(e) => mudar(i, e.target.value)}
                  opcoes={[
                    { valor: "", texto: TC.vazio },
                    ...(valor && !c.opcoes.includes(valor) ? [{ valor, texto: TC.comoEsta(valor) }] : []),
                    ...c.opcoes.map((o) => ({ valor: o, texto: o })),
                  ]}
                />
              ) : variasLinhas ? (
                <AreaDeTexto rotulo={rotulo} explicacao={c.explicacao} exemplo={c.exemplo} value={valor} maxLength={500} rows={3} disabled={ocupado} onChange={(e) => mudar(i, e.target.value)} />
              ) : (
                <Campo rotulo={rotulo} explicacao={c.explicacao} exemplo={c.exemplo} value={valor} maxLength={500} disabled={ocupado} onChange={(e) => mudar(i, e.target.value)} />
              )}
            </div>
          );
        })}
      </div>
      <div className="hor-secao__botoes">
        <Botao type="submit" disabled={ocupado || mudancas.length === 0}>
          {TC.aplicar}
        </Botao>
        <Botao variante="secundario" disabled={ocupado} onClick={aoCancelar}>
          {TC.cancelar}
        </Botao>
      </div>
      {mudancas.length === 0 && <p className="imp-corrigir__intro">{TC.nadaMudou}</p>}
    </form>
  );
}

/** "3 correções feitas", com o que mudou, "Desfazer" em cada uma e o botão de baixar a planilha corrigida. */
export function CorrecoesFeitas({
  lista,
  ocupado,
  aoDesfazer,
  aoBaixar,
}: {
  lista: readonly CorrecaoFeita[];
  ocupado: boolean;
  aoDesfazer: (c: CorrecaoFeita) => void;
  aoBaixar: () => void;
}) {
  if (!lista.length) return null;
  return (
    <div className="imp-correcoes" data-testid="correcoes-feitas">
      <details>
        <summary data-testid="quantas-correcoes">{TC.feitas(lista.length)}</summary>
        <ul className="imp-correcoes__lista">
          {[...lista]
            .sort((a, b) => a.linha - b.linha || a.coluna - b.coluna)
            .map((c) => (
              <li key={`${c.linha}:${c.coluna}`} data-testid={`correcao-${c.linha}-${c.coluna}`}>
                <span>{TC.descricao(c.linha, c.rotulo, c.antes, c.valor)}</span>
                <Botao variante="secundario" disabled={ocupado} onClick={() => aoDesfazer(c)}>
                  {TC.desfazer}
                  <span className="ajuda__so-leitor"> {TC.desfazerQual(c.linha, c.rotulo)}</span>
                </Botao>
              </li>
            ))}
        </ul>
      </details>
      <div className="hor-secao__botoes">
        <Botao variante="secundario" disabled={ocupado} onClick={aoBaixar} aria-describedby="imp-baixar-aviso">
          {TC.baixar}
        </Botao>
      </div>
      <p id="imp-baixar-aviso" className="imp-corrigir__intro">
        {TC.baixarAviso}
      </p>
    </div>
  );
}
