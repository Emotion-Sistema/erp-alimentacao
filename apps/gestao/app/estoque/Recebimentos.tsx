"use client";

/**
 * Bloco "A receber" do painel (E09; migração 0024; decisão do responsável em 25/11/2026: quem recebe
 * confirma). Mostra o que outra área mandou para as áreas desta tela e ainda espera confirmação.
 * Quem pode (a pessoa indicada ou a supervisão, nunca quem mandou; o servidor confere de novo) confirma escolhendo em
 * uso ou guardado, ou recusa com o motivo (volta para onde estava). Lê GET /api/estoque/recebimentos.
 */
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Selo } from "@erp/interface";
import type { RecebimentoPendente } from "@erp/dominio";
import { chamar } from "../chamar";
import { AreaDeTexto, Selecao } from "../Campo";
import { formatarDataHora } from "../formatar";
import { qtd } from "./comum";
import type { ContextoDoEstoque } from "./contexto";
import { useEnvio } from "./envio";
import { NOME_DO_LOCAL, TE } from "./textos";

const T = TE.receber;

export function Recebimentos({ contexto, areas, aoMudar }: { contexto: ContextoDoEstoque; areas: readonly string[]; aoMudar: () => void }) {
  const [lista, setLista] = useState<RecebimentoPendente[] | null>(null);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState("");
  const [aberto, setAberto] = useState<{ id: number; modo: "confirmar" | "recusar" } | null>(null);

  const recarregar = useCallback(async () => {
    const r = await chamar<RecebimentoPendente[]>("/api/estoque/recebimentos");
    if (r.ok && r.dados) {
      setLista(r.dados);
      setErro("");
    } else setErro(r.mensagem);
  }, []);
  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const daTela = (lista ?? []).filter((r) => areas.includes(r.areaDestino));
  if (!erro && daTela.length === 0 && !feito) return null;

  function pronto(texto: string) {
    setAberto(null);
    setFeito(texto);
    void recarregar();
    aoMudar();
  }

  return (
    <section className="est-bloco" aria-labelledby="est-a-receber" data-testid="a-receber">
      <h2 id="est-a-receber">{T.titulo}</h2>
      {daTela.length > 0 && <p className="hor-secao__intro">{T.intro}</p>}
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {feito && (
        <Aviso tipo="sucesso" data-testid="recebimento-feito">
          {feito}
        </Aviso>
      )}
      {daTela.length > 0 && (
        <ul className="est-lista">
          {daTela.map((r) => (
            <li key={r.recebimentoId} className="est-linha" data-testid={`receber-${r.nome}`}>
              <span className="est-linha__cabeca">
                <strong>{r.nome}</strong>
                <Selo variante="info">{contexto.nomeDaArea[r.areaDestino] ?? r.areaDestino}</Selo>
                {r.emContagem && <Selo variante="info">{TE.painel.emContagem}</Selo>}
              </span>
              <span className="est-linha__texto">
                {T.deOnde(r.quantidade === null ? TE.painel.emContagem : qtd(r.quantidade, r.unidade), contexto.nomeDaArea[r.areaOrigem] ?? r.areaOrigem, r.enviadoPor, formatarDataHora(r.quando))}{" "}
                {T.paraQuem(r.recebidoPor.nome)} {T.sugestao(NOME_DO_LOCAL[r.localSugerido] ?? r.localSugerido)}
              </span>
              {r.podeConfirmar ? (
                <div className="est-acoes">
                  <Botao variante={aberto?.id === r.recebimentoId && aberto.modo === "confirmar" ? "primario" : "secundario"} aria-expanded={aberto?.id === r.recebimentoId && aberto.modo === "confirmar"} onClick={() => abrir(r.recebimentoId, "confirmar")}>
                    {T.confirmar(r.nome)}
                  </Botao>
                  <Botao variante={aberto?.id === r.recebimentoId && aberto.modo === "recusar" ? "primario" : "secundario"} aria-expanded={aberto?.id === r.recebimentoId && aberto.modo === "recusar"} onClick={() => abrir(r.recebimentoId, "recusar")}>
                    {T.recusar(r.nome)}
                  </Botao>
                </div>
              ) : (
                <span className="est-linha__texto">{r.enviadoPorMim ? T.proprioEnvio : T.soQuem(r.recebidoPor.nome)}</span>
              )}
              {aberto?.id === r.recebimentoId && aberto.modo === "confirmar" && <FormDeConfirmar r={r} aoCancelar={() => setAberto(null)} aoGravar={pronto} />}
              {aberto?.id === r.recebimentoId && aberto.modo === "recusar" && <FormDeRecusar r={r} contexto={contexto} aoCancelar={() => setAberto(null)} aoGravar={pronto} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  function abrir(id: number, modo: "confirmar" | "recusar") {
    setFeito("");
    setAberto(aberto?.id === id && aberto.modo === modo ? null : { id, modo });
  }
}

function FormDeConfirmar({ r, aoCancelar, aoGravar }: { r: RecebimentoPendente; aoCancelar: () => void; aoGravar: (texto: string) => void }) {
  const [local, setLocal] = useState<string>(r.localSugerido);
  const { enviar, ocupado, erro } = useEnvio();
  return (
    <form
      className="est-form"
      data-testid="form-confirmar-recebimento"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar<{ repetido: boolean }>("/api/estoque/recebimentos/confirmar", { recebimentoId: r.recebimentoId, local }).then(
          (x) => x && aoGravar(x.repetido ? TE.form.repetido : T.feitoConfirmar(r.nome, NOME_DO_LOCAL[local] ?? local)),
        );
      }}
    >
      <Selecao rotulo={T.local} explicacao={T.localAjuda} exemplo={T.localExemplo} value={local} onChange={(e) => setLocal(e.target.value)} opcoes={Object.entries(NOME_DO_LOCAL).map(([valor, texto]) => ({ valor, texto }))} />
      {erro && (
        <Aviso tipo="perigo" data-testid="erro-do-recebimento">
          {erro}
        </Aviso>
      )}
      <div className="hor-secao__botoes">
        <Botao type="submit" disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? TE.form.gravando : T.gravarConfirmar}
        </Botao>
        <Botao variante="secundario" disabled={ocupado} onClick={aoCancelar}>
          {TE.form.cancelar}
        </Botao>
      </div>
    </form>
  );
}

function FormDeRecusar({ r, contexto, aoCancelar, aoGravar }: { r: RecebimentoPendente; contexto: ContextoDoEstoque; aoCancelar: () => void; aoGravar: (texto: string) => void }) {
  const [observacao, setObservacao] = useState("");
  const { enviar, ocupado, erro } = useEnvio();
  return (
    <form
      className="est-form"
      data-testid="form-recusar-recebimento"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar<{ repetido: boolean }>("/api/estoque/recebimentos/recusar", { recebimentoId: r.recebimentoId, observacao }).then(
          (x) => x && aoGravar(x.repetido ? TE.form.repetido : T.feitoRecusar(r.nome, contexto.nomeDaArea[r.areaOrigem] ?? r.areaOrigem)),
        );
      }}
    >
      <AreaDeTexto rotulo={T.motivo} explicacao={T.motivoAjuda} exemplo={T.motivoExemplo} value={observacao} maxLength={500} rows={2} onChange={(e) => setObservacao(e.target.value)} />
      {erro && (
        <Aviso tipo="perigo" data-testid="erro-do-recebimento">
          {erro}
        </Aviso>
      )}
      <div className="hor-secao__botoes">
        <Botao type="submit" variante="perigo" disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? TE.form.gravando : T.gravarRecusar}
        </Botao>
        <Botao variante="secundario" disabled={ocupado} onClick={aoCancelar}>
          {TE.form.cancelar}
        </Botao>
      </div>
    </form>
  );
}
