"use client";

/**
 * Janela por cima da tela (popup) usada para adicionar e editar ingredientes.
 *
 * Usa <dialog> nativo em modo modal: o resto da página fica inerte (o foco não sai daqui), o
 * cabeçalho com o título e o botão Fechar ficam parados e só o corpo rola. No celular ocupa a tela
 * inteira (folha que sobe de baixo). Esc, Fechar e Cancelar passam por `pedirFechar`: se a pessoa
 * digitou algo que ainda não foi gravado, a janela pergunta "Descartar o que foi digitado?" antes
 * de fechar. Ao fechar, o foco volta para quem abriu (o botão da lista).
 *
 * Painéis que abrem por cima (ex.: o painel de embalagem do catálogo) são outro <dialog>, com o
 * próprio formulário: Esc e Enter neles nunca chegam a esta janela.
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Botao, Icone } from "@erp/interface";

const ContextoDaJanela = createContext<() => void>(() => undefined);

/** Para um botão Cancelar dentro da janela: fecha pelo mesmo caminho do Esc (pergunta se houver algo digitado). */
export const usarPedirFechar = () => useContext(ContextoDaJanela);

export function JanelaModal({
  titulo,
  sujo,
  aoMexer,
  aoFechar,
  topo,
  children,
  ...resto
}: {
  titulo: string;
  /** Há algo digitado e ainda não gravado. */
  sujo: boolean;
  /** Chamado a cada campo mexido dentro da janela. */
  aoMexer: () => void;
  /** Fecha de vez (sem perguntar). */
  aoFechar: () => void;
  /** Fica no cabeçalho, abaixo do título (ex.: as abas Rápido e Comum). */
  topo?: ReactNode;
  children: ReactNode;
  "data-testid"?: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const idPergunta = useId();
  const [perguntando, setPerguntando] = useState(false);
  // Quem estava com o foco quando a janela abriu (guardado antes de qualquer campo de dentro pegar o foco).
  const [quemAbriu] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const fechado = useRef(false);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    fechado.current = false;
    // Um campo de dentro pode já ter pegado o foco (ex.: o nome da cópia, já selecionado): mantém.
    const focado = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    if (focado && d.contains(focado)) focado.focus();
    else (d.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? d.querySelector<HTMLElement>(".janela__corpo input, .janela__corpo select, .janela__corpo textarea"))?.focus();
    return () => {
      fechado.current = true;
      if (d.open) d.close();
      if (quemAbriu?.isConnected) quemAbriu.focus();
    };
  }, [quemAbriu]);

  const pedirFechar = useCallback(() => {
    if (perguntando) return setPerguntando(false);
    if (sujo) return setPerguntando(true);
    aoFechar();
  }, [perguntando, sujo, aoFechar]);

  // Ao abrir a pergunta, o foco vai para "Continuar editando" (o caminho seguro).
  useEffect(() => {
    if (perguntando) document.getElementById(`${idPergunta}-continuar`)?.focus();
  }, [perguntando, idPergunta]);

  return (
    <ContextoDaJanela.Provider value={pedirFechar}>
      <dialog
        ref={dialogo}
        className="janela"
        aria-labelledby={idTitulo}
        aria-modal="true"
        data-testid={resto["data-testid"]}
        onKeyDown={(e) => {
          // Campos que usam o Esc para si (ex.: fechar a lista de sugestões) avisam com preventDefault.
          if (e.key !== "Escape" || e.defaultPrevented) return;
          e.preventDefault();
          pedirFechar();
        }}
        onCancel={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          pedirFechar();
        }}
        onClose={() => {
          // Fechou por fora (o navegador pode forçar): acompanha, para a tela não achar que segue aberta.
          if (!fechado.current && !dialogo.current?.open) aoFechar();
        }}
        onInput={aoMexer}
        onChange={aoMexer}
      >
        <header className="janela__cabeca">
          <div className="janela__linha">
            <h2 id={idTitulo} className="janela__titulo">
              {titulo}
            </h2>
            <Botao variante="secundario" className="janela__fechar" onClick={pedirFechar}>
              <Icone nome="fechar" />
              Fechar
            </Botao>
          </div>
          {perguntando && (
            <div className="janela__pergunta" role="alertdialog" aria-labelledby={`${idPergunta}-titulo`} aria-describedby={`${idPergunta}-texto`} data-testid="pergunta-descartar">
              <p id={`${idPergunta}-titulo`} className="janela__pergunta-titulo">
                Descartar o que foi digitado?
              </p>
              <p id={`${idPergunta}-texto`}>O que você digitou e ainda não gravou será perdido.</p>
              <div className="cadastros__botoes">
                <Botao id={`${idPergunta}-continuar`} variante="secundario" onClick={() => setPerguntando(false)}>
                  Continuar editando
                </Botao>
                <Botao variante="perigo" onClick={aoFechar}>
                  Descartar
                </Botao>
              </div>
            </div>
          )}
          {topo}
        </header>
        <div className="janela__corpo">{children}</div>
      </dialog>
    </ContextoDaJanela.Provider>
  );
}
