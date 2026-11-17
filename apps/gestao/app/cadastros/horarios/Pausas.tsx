"use client";

/**
 * "Pausas": o que está pausado agora, quem pausou, até quando e "Retomar". "Pausar agora" abre a
 * janela. A pausa com prazo vence sozinha (a lista se atualiza a cada minuto).
 */
import { useState } from "react";
import { Aviso, Botao, Icone, Selo } from "@erp/interface";
import { nomeDoAlvo, quandoLocal, type Categoria, type Horarios, type Pausa } from "./contas";
import { JanelaPausa } from "./JanelaPausa";
import type { Gravar } from "./usarHorarios";
import { T } from "./textos";

export function Pausas({
  horarios,
  categorias,
  podeMudar,
  gravar,
  avisar,
}: {
  horarios: Horarios;
  categorias: Categoria[];
  podeMudar: boolean;
  gravar: Gravar;
  avisar: (texto: string) => void;
}) {
  const [janela, setJanela] = useState(false);
  const [erro, setErro] = useState("");

  async function retomar(p: Pausa) {
    setErro("");
    const r = await gravar("/api/horarios/pausas/retomar", { id: p.id });
    if (!r.ok) return setErro(r.mensagem);
    avisar(T.pausas.retomada(nomeDoAlvo(p.canal, p.categoriaId, categorias)));
  }

  return (
    <section className="hor-secao" aria-labelledby="hor-pausas-titulo" data-testid="pausas">
      <div className="hor-secao__cabeca">
        <h2 id="hor-pausas-titulo">{T.pausas.titulo}</h2>
        {podeMudar && (
          <Botao onClick={() => setJanela(true)} className="hor-secao__acao">
            <Icone nome="relogio" />
            {T.pausas.pausar}
          </Botao>
        )}
      </div>
      <p className="hor-secao__intro">{T.pausas.explicacao}</p>
      <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
      {horarios.pausas.length === 0 ? (
        <p className="hor-vazio">{T.pausas.nenhuma}</p>
      ) : (
        <ul className="hor-lista">
          {horarios.pausas.map((p) => {
            const alvo = nomeDoAlvo(p.canal, p.categoriaId, categorias);
            return (
              <li key={p.id} className="hor-item hor-item--pausa" data-testid={`pausa-${p.id}`}>
                <div className="hor-item__linha">
                  <strong className="hor-item__alvo">{alvo}</strong>
                  <Selo variante="alerta" icone="relogio">
                    {p.ate ? T.pausas.ate(quandoLocal(p.ate, horarios.fuso, horarios.hoje)) : T.pausas.ateRetomar}
                  </Selo>
                  <Selo icone="pessoa">{T.pausas.por(p.criadaPor)}</Selo>
                </div>
                <p className="hor-item__motivo">{p.motivo}</p>
                {podeMudar && (
                  <div className="hor-item__acoes">
                    <Botao aria-label={T.pausas.retomarNome(alvo)} onClick={() => void retomar(p)}>
                      {T.pausas.retomar}
                    </Botao>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {janela && (
        <JanelaPausa
          categorias={categorias}
          gravar={gravar}
          aoFechar={() => setJanela(false)}
          aoSalvo={(alvo) => {
            setJanela(false);
            avisar(T.pausas.pausado(alvo));
          }}
        />
      )}
    </section>
  );
}
