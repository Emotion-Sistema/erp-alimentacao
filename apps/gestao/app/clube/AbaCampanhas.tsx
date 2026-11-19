"use client";

/**
 * Aba "Campanhas": limite por semana (gravado nas regras), o aviso fixo de como as campanhas saem,
 * a lista (agendadas primeiro; depois enviadas e canceladas, com quem criou e o motivo) e
 * "Agendar campanha" (janela). Agendada pode ser editada ou cancelada, com motivo (nada se apaga).
 * Quem confere dia, hora, casa aberta e limite da semana é o servidor; a mensagem dele aparece aqui.
 */
import { useState } from "react";
import { Aviso, Botao, Icone, Selo } from "@erp/interface";
import { NOME_DO_PUBLICO, type Campanha } from "@erp/dominio/clube";
import { chamar } from "../chamar";
import { Campo } from "../Campo";
import { inteiroDoTexto, ordenarCampanhas } from "./contas";
import { JanelaDaCampanha } from "./JanelaDaCampanha";
import type { PropsDaAba } from "./TelaDoClube";
import { TC, textoDoEnvio } from "./textos";

const VARIANTE = { agendada: "info", enviada: "sucesso", cancelada: "neutro" } as const;

export function AbaCampanhas({ painel, podeGerenciar, avisar, recarregar }: PropsDaAba) {
  const [limite, setLimite] = useState(String(painel.regras.campanhasPorSemana));
  const [erroLimite, setErroLimite] = useState("");
  const [gravando, setGravando] = useState(false);
  const [janela, setJanela] = useState<{ campanha?: Campanha } | null>(null);
  const [cancelando, setCancelando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erroCancelar, setErroCancelar] = useState("");
  const n = inteiroDoTexto(limite, 1, 7);
  const campanhas = ordenarCampanhas(painel.campanhas);
  const variasUnidades = painel.unidades.length > 1;
  const nomeDaUnidade = (id: number) => painel.unidades.find((u) => u.id === id)?.nome ?? "";

  async function salvarLimite() {
    setErroLimite("");
    if (n === null) return setErroLimite(TC.campanhas.erroLimite);
    setGravando(true);
    const r = await chamar("/api/clube/regras", "POST", { campanhasPorSemana: n });
    setGravando(false);
    if (!r.ok) return setErroLimite(r.mensagem);
    avisar(TC.campanhas.limiteSalvo);
    await recarregar();
  }

  async function cancelar(c: Campanha) {
    setErroCancelar("");
    if (motivo.trim().length < 2) return setErroCancelar(TC.campanhas.erroMotivo);
    const r = await chamar<Campanha>("/api/clube/campanhas/cancelar", "POST", { id: c.id, motivo: motivo.trim() });
    if (!r.ok) return setErroCancelar(r.mensagem);
    setCancelando(null);
    setMotivo("");
    avisar(TC.campanhas.cancelada(c.titulo));
    await recarregar();
  }

  return (
    <>
      <section className="hor-secao" aria-labelledby="clube-campanhas-titulo" data-testid="aba-campanhas">
        <div className="hor-secao__cabeca">
          <h2 id="clube-campanhas-titulo">{TC.campanhas.titulo}</h2>
          {podeGerenciar && (
            <Botao onClick={() => setJanela({})} className="hor-secao__acao">
              <Icone nome="mais" />
              {TC.campanhas.agendar}
            </Botao>
          )}
        </div>
        <Aviso tipo="info" data-testid="aviso-das-campanhas">
          {TC.campanhas.aviso}
        </Aviso>
        <div className="hor-form">
          <Campo
            rotulo={TC.campanhas.limite}
            explicacao={TC.campanhas.limiteAjuda}
            exemplo={TC.campanhas.limiteExemplo}
            value={limite}
            inputMode="numeric"
            maxLength={1}
            autoComplete="off"
            className="linha-editavel__numero"
            disabled={!podeGerenciar}
            onChange={(e) => setLimite(e.target.value)}
          />
          <div aria-live="polite">{erroLimite && <Aviso tipo="perigo">{erroLimite}</Aviso>}</div>
          {podeGerenciar && (
            <div className="hor-secao__botoes">
              <Botao variante="secundario" onClick={() => void salvarLimite()} disabled={n === painel.regras.campanhasPorSemana || gravando}>
                {TC.campanhas.salvarLimite}
              </Botao>
            </div>
          )}
        </div>
        {campanhas.length === 0 ? (
          <p className="hor-vazio">{TC.campanhas.nenhuma}</p>
        ) : (
          <ul className="hor-cats clube__lista" data-testid="lista-de-campanhas">
            {campanhas.map((c) => (
              <li key={c.id} className="hor-cats__item">
                <article className={["hor-cat", c.situacao !== "agendada" && "hor-cat--inativa"].filter(Boolean).join(" ")} data-testid={`campanha-${c.titulo}`}>
                  <header className="hor-cat__cabeca">
                    <h3 className="hor-cat__nome">{c.titulo}</h3>
                    <Selo variante={VARIANTE[c.situacao]} data-testid="situacao-da-campanha">
                      {TC.campanhas.situacao[c.situacao]}
                    </Selo>
                  </header>
                  <p className="hor-cat__descricao">{c.texto}</p>
                  <div className="hor-cat__selos">
                    <Selo icone="calendario" data-testid="quando-da-campanha">
                      {textoDoEnvio(c.enviarEm)}
                    </Selo>
                    <Selo>{NOME_DO_PUBLICO[c.publico]}</Selo>
                    {variasUnidades && <Selo icone="local">{nomeDaUnidade(c.unidadeId)}</Selo>}
                  </div>
                  <p className="clube__nota">{TC.campanhas.criadaPor(c.criadaPor)}</p>
                  {c.destinatarios !== null && <p className="clube__nota">{TC.campanhas.enviadaPara(c.destinatarios)}</p>}
                  {c.motivoCancelamento && (
                    <p className="clube__nota" data-testid="motivo-do-cancelamento">
                      {TC.campanhas.motivo(c.motivoCancelamento)}
                    </p>
                  )}
                  {podeGerenciar && c.situacao === "agendada" && cancelando !== c.id && (
                    <div className="hor-cat__acoes">
                      <Botao variante="secundario" aria-label={TC.campanhas.editar(c.titulo)} onClick={() => setJanela({ campanha: c })}>
                        Editar
                      </Botao>
                      <Botao
                        variante="secundario"
                        aria-label={TC.campanhas.cancelar(c.titulo)}
                        onClick={() => {
                          setCancelando(c.id);
                          setMotivo("");
                          setErroCancelar("");
                        }}
                      >
                        Cancelar
                      </Botao>
                    </div>
                  )}
                  {podeGerenciar && cancelando === c.id && (
                    <div className="hor-confirmar" role="group" aria-label={TC.campanhas.cancelarPergunta(c.titulo)} data-testid="cancelar-campanha">
                      <p>{TC.campanhas.cancelarPergunta(c.titulo)}</p>
                      <span>{TC.campanhas.cancelarExplicacao}</span>
                      <Campo
                        rotulo={TC.campanhas.motivoCampo}
                        explicacao={TC.campanhas.motivoAjuda}
                        exemplo={TC.campanhas.motivoExemplo}
                        value={motivo}
                        maxLength={120}
                        autoComplete="off"
                        autoFocus
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                      <div aria-live="polite">{erroCancelar && <Aviso tipo="perigo">{erroCancelar}</Aviso>}</div>
                      <div className="cadastros__botoes">
                        <Botao variante="perigo" onClick={() => void cancelar(c)}>
                          {TC.campanhas.confirmarCancelar}
                        </Botao>
                        <Botao variante="secundario" onClick={() => setCancelando(null)}>
                          {TC.campanhas.voltar}
                        </Botao>
                      </div>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
      {janela && (
        <JanelaDaCampanha
          campanha={janela.campanha}
          unidades={painel.unidades}
          aoFechar={() => setJanela(null)}
          aoSalvo={(c, criada) => {
            setJanela(null);
            void recarregar();
            avisar(criada ? TC.campanhas.agendada(c.titulo) : TC.campanhas.salva(c.titulo));
          }}
        />
      )}
    </>
  );
}
