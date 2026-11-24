"use client";

/**
 * Detalhe de um item do estoque (janela): saldo por área, lotes (validade e onde estão), botões de
 * ação (mudar de lugar, perda, bloquear, desbloquear e, se for preparo, produzir) e o histórico com
 * o saldo depois de cada movimento. "Desfazer" só para quem tem `estoque.desfazer`; o servidor
 * recusa o que não se desfaz e a mensagem dele aparece. Cada envio leva uma chave (toque duplo).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso, Botao, Selo, varianteDaArea } from "@erp/interface";
import type { EstoqueDoItem, ItemDoPainel, MovimentoDoHistorico } from "@erp/dominio";
import { chamar } from "../chamar";
import { AreaDeTexto, Campo, Marcador, Selecao } from "../Campo";
import { JanelaModal } from "../cadastros/JanelaModal";
import { formatarDataHora } from "../formatar";
import { consulta, custoMedio, dia, novaChave, qtd, qtdComSinal, reais, unidadesDoItem } from "./comum";
import type { ContextoDoEstoque, Opcao } from "./contexto";
import { somaDasAreas } from "./PainelDoEstoque";
import { NAO_SE_DESFAZ, NOME_DO_LOCAL, NOME_DO_MOVIMENTO, TE } from "./textos";

type Acao = "transferencia" | "perda" | "bloqueio" | "desbloqueio" | "producao";
const POR_PAGINA = 20;

export function DetalheDoItem({ resumo, contexto, areas, aoFechar, aoMudar }: { resumo: ItemDoPainel; contexto: ContextoDoEstoque; areas: Opcao[]; aoFechar: () => void; aoMudar: () => void }) {
  const ref = resumo.ingredienteId !== null ? { ingredienteId: resumo.ingredienteId } : { preparoId: resumo.preparoId! };
  const chaveDaRef = JSON.stringify(ref);
  const [item, setItem] = useState<EstoqueDoItem | null>(null);
  const [historico, setHistorico] = useState<MovimentoDoHistorico[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState<Acao | null>(null);
  const [feito, setFeito] = useState("");
  const [desfazendo, setDesfazendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const ref = JSON.parse(chaveDaRef) as Record<string, number>;
    const [a, h] = await Promise.all([
      chamar<EstoqueDoItem>(`/api/estoque/item${consulta(ref)}`),
      chamar<MovimentoDoHistorico[]>(`/api/estoque/item/historico${consulta({ ...ref, limite: POR_PAGINA })}`),
    ]);
    if (!a.ok || !a.dados) return setErro(a.mensagem);
    setItem(a.dados);
    if (h.ok && h.dados) {
      setHistorico(h.dados);
      setTemMais(h.dados.length === POR_PAGINA);
    } else setErro(h.mensagem);
  }, [chaveDaRef]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function maisAntigos() {
    const ultimo = historico[historico.length - 1];
    if (!ultimo) return;
    const h = await chamar<MovimentoDoHistorico[]>(`/api/estoque/item/historico${consulta({ ...ref, limite: POR_PAGINA, antesDe: ultimo.movimentoId })}`);
    if (!h.ok || !h.dados) return setErro(h.mensagem);
    setHistorico((x) => [...x, ...h.dados!]);
    setTemMais(h.dados.length === POR_PAGINA);
  }

  function pronto(texto: string) {
    setAcao(null);
    setDesfazendo(null);
    setFeito(texto);
    void carregar();
    aoMudar();
  }

  const codigos = areas.map((a) => a.valor);
  const s = item ? somaDasAreas(item, codigos) : null;
  const acoes: { valor: Acao; texto: string }[] = [
    { valor: "transferencia", texto: TE.item.transferir },
    { valor: "perda", texto: TE.item.perda },
    { valor: "bloqueio", texto: TE.item.bloquear },
    { valor: "desbloqueio", texto: TE.item.desbloquear },
    ...(resumo.preparoId !== null ? [{ valor: "producao" as const, texto: TE.item.produzir }] : []),
  ];

  return (
    <JanelaModal titulo={resumo.nome} sujo={false} aoMexer={() => undefined} aoFechar={aoFechar} data-testid="detalhe-do-item">
      <div className="est-detalhe">
        {erro && <Aviso tipo="perigo">{erro}</Aviso>}
        {!item && !erro && <p>{TE.carregando}</p>}
        {item && s && (
          <>
            <div className="est-item__selos">
              <Selo variante={varianteDaArea(item.areaPadrao)}>{contexto.nomeDaArea[item.areaPadrao] ?? item.areaPadrao}</Selo>
              {item.preparoId !== null && <Selo variante="info">{TE.painel.preparo}</Selo>}
            </div>
            <dl className="est-saldos" data-testid="saldo-do-item">
              {item.areas
                .filter((a) => codigos.includes(a.area))
                .map((a) => (
                  <div key={a.area} className="est-saldos__area">
                    <dt>{contexto.nomeDaArea[a.area]}</dt>
                    {a.emContagem || a.livre === null ? (
                      <dd data-testid="em-contagem">{TE.painel.emContagemExplicacao}</dd>
                    ) : (
                      <dd>
                        {TE.painel.livre}: <strong>{qtd(a.livre, item.unidade)}</strong>. {TE.painel.emUso}: {qtd(a.emUso, item.unidade)}. {TE.painel.guardado}: {qtd(a.guardado, item.unidade)}.
                        {a.bloqueado !== null && a.bloqueado !== "0" && ` ${TE.painel.bloqueado}: ${qtd(a.bloqueado, item.unidade)}.`}
                        {a.vencido !== null && a.vencido !== "0" && ` ${TE.painel.vencido}: ${qtd(a.vencido, item.unidade)}.`}
                        {a.valorCentavos !== null && ` ${TE.painel.valor}: ${reais(a.valorCentavos)}.`}
                      </dd>
                    )}
                  </div>
                ))}
              {item.custoMedioCentavos && (
                <div className="est-saldos__area">
                  <dt>{TE.painel.custoMedio}</dt>
                  <dd>{custoMedio(item.custoMedioCentavos, item.unidade)}</dd>
                </div>
              )}
            </dl>
            {feito && (
              <Aviso tipo="sucesso" data-testid="lancamento-feito">
                {feito}
              </Aviso>
            )}

            <section className="est-bloco" aria-labelledby="est-acoes">
              <h3 id="est-acoes">{TE.item.acoes}</h3>
              <div className="est-acoes">
                {acoes.map((a) => (
                  <Botao
                    key={a.valor}
                    variante={acao === a.valor ? "primario" : "secundario"}
                    aria-expanded={acao === a.valor}
                    onClick={() => {
                      setFeito("");
                      setAcao(acao === a.valor ? null : a.valor);
                    }}
                  >
                    {a.texto}
                  </Botao>
                ))}
              </div>
              {acao && <FormDoLancamento key={acao} acao={acao} item={item} contexto={contexto} areas={areas} aoCancelar={() => setAcao(null)} aoGravar={pronto} />}
            </section>

            <section className="est-bloco" aria-labelledby="est-lotes">
              <h3 id="est-lotes">{TE.item.lotes}</h3>
              <p className="hor-secao__intro">{TE.item.lotesIntro}</p>
              {item.lotes.length === 0 ? (
                <p className="hor-vazio">{TE.item.semLotes}</p>
              ) : (
                <ul className="est-lotes" data-testid="lotes">
                  {item.lotes.map((l) => (
                    <li key={l.loteId} className="est-lote">
                      <span className="est-lote__cabeca">
                        <strong>{l.validade ? TE.item.validade(dia(l.validade)) : TE.item.semValidade}</strong>
                        {l.vencido && <Selo variante="perigo">{TE.painel.vencido}</Selo>}
                        {l.codigo && <span>{TE.item.codigo(l.codigo)}</span>}
                        <span className="est-lote__quando">{TE.item.entrou(formatarDataHora(l.entrouEm))}</span>
                      </span>
                      <ul className="est-lote__saldos">
                        {l.saldos.map((x) => (
                          <li key={`${x.area}-${x.local}-${x.bloqueado}`}>
                            {NOME_DO_LOCAL[x.local]}, {contexto.nomeDaArea[x.area]}: <strong>{x.quantidade === null ? TE.painel.emContagem : qtd(x.quantidade, item.unidade)}</strong>
                            {x.bloqueado && ` (${TE.painel.bloqueado.toLowerCase()})`}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="est-bloco" aria-labelledby="est-historico">
              <h3 id="est-historico">{TE.item.historico}</h3>
              <p className="hor-secao__intro">{TE.item.historicoIntro}</p>
              {historico.length === 0 ? (
                <p className="hor-vazio">{TE.item.semHistorico}</p>
              ) : (
                <ol className="est-historico" data-testid="historico">
                  {historico.map((m) => {
                    const pode = contexto.podeDesfazer && !NAO_SE_DESFAZ.has(m.tipo) && !m.desfeitoPor;
                    const quando = formatarDataHora(m.quando);
                    return (
                      <li key={m.movimentoId} className="est-mov" data-testid={`movimento-${m.movimentoId}`}>
                        <span className="est-mov__cabeca">
                          <strong>{NOME_DO_MOVIMENTO[m.tipo] ?? m.tipo}</strong>
                          <span className="est-mov__qtd">{m.quantidade === null ? TE.painel.emContagem : qtdComSinal(m.quantidade, item.unidade)}</span>
                        </span>
                        <span className="est-mov__quando">{TE.item.por(m.autor, quando)}</span>
                        {(m.motivo || m.observacao) && <span className="est-mov__obs">{[motivoLegivel(m, contexto), m.observacao].filter(Boolean).join(": ")}</span>}
                        <span className="est-item__selos">
                          {m.quantidadeDepois !== null && <Selo>{TE.item.ficou(qtd(m.quantidadeDepois, item.unidade))}</Selo>}
                          {m.valorCentavos !== null && m.valorCentavos !== "0" && <Selo>{reais(m.valorCentavos)}</Selo>}
                          {m.custoEstimado && <Selo variante="alerta">{TE.item.estimado}</Selo>}
                          {m.usouGuardado && <Selo variante="info">{TE.item.usouGuardado}</Selo>}
                          {m.faltou !== "0" && <Selo variante="perigo">{TE.item.faltou(qtd(m.faltou, item.unidade))}</Selo>}
                          {m.desfeitoPor && <Selo variante="neutro">{TE.item.desfeito}</Selo>}
                        </span>
                        {pode && desfazendo !== m.movimentoId && (
                          <Botao variante="secundario" className="est-mov__desfazer" onClick={() => setDesfazendo(m.movimentoId)}>
                            {TE.item.desfazer}
                            <span className="ajuda__so-leitor"> {TE.item.desfazerQual(NOME_DO_MOVIMENTO[m.tipo] ?? m.tipo, quando)}</span>
                          </Botao>
                        )}
                        {desfazendo === m.movimentoId && <FormDeDesfazer movimentoId={m.movimentoId} aoCancelar={() => setDesfazendo(null)} aoGravar={pronto} />}
                      </li>
                    );
                  })}
                </ol>
              )}
              {temMais && (
                <Botao variante="secundario" onClick={() => void maisAntigos()}>
                  {TE.item.mais}
                </Botao>
              )}
            </section>
          </>
        )}
      </div>
    </JanelaModal>
  );
}

function motivoLegivel(m: MovimentoDoHistorico, c: ContextoDoEstoque): string | null {
  if (!m.motivo) return null;
  if (m.tipo === "perda") return c.motivosDePerda.find((x) => x.valor === m.motivo)?.texto ?? m.motivo;
  if (m.tipo === "bloqueio") return c.motivosDeBloqueio.find((x) => x.valor === m.motivo)?.texto ?? m.motivo;
  if (m.motivo === "contagem") return "Contagem";
  return m.motivo;
}

/** Envio com chave e trava contra toque duplo; devolve a resposta pronta. */
function useEnvio() {
  const [chave, setChave] = useState(novaChave);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const travado = useRef(false);
  async function enviar<T>(url: string, corpo: Record<string, unknown>): Promise<T | null> {
    if (travado.current) return null;
    travado.current = true;
    setOcupado(true);
    setErro("");
    const r = await chamar<T>(url, "POST", { ...corpo, chave });
    travado.current = false;
    setOcupado(false);
    if (!r.ok || !r.dados) {
      setErro(r.mensagem);
      return null;
    }
    setChave(novaChave());
    return r.dados;
  }
  return { enviar, ocupado, erro, setErro };
}

const ROTA: Record<Acao, string> = {
  transferencia: "/api/estoque/transferir",
  perda: "/api/estoque/perda",
  bloqueio: "/api/estoque/bloquear",
  desbloqueio: "/api/estoque/desbloquear",
  producao: "/api/estoque/produzir",
};

function FormDoLancamento({ acao, item, contexto, areas, aoCancelar, aoGravar }: { acao: Acao; item: EstoqueDoItem; contexto: ContextoDoEstoque; areas: Opcao[]; aoCancelar: () => void; aoGravar: (texto: string) => void }) {
  // Preparo conta só na unidade dele (o servidor recusa outra).
  const unidades = item.preparoId !== null ? [{ valor: item.unidade, texto: item.unidade }] : unidadesDoItem(item.unidade);
  const comSaldo = item.areas.find((a) => areas.some((x) => x.valor === a.area));
  const [area, setArea] = useState(comSaldo?.area ?? (areas.some((a) => a.valor === item.areaPadrao) ? item.areaPadrao : areas[0]!.valor));
  const [local, setLocal] = useState<string>(acao === "transferencia" ? "guardado" : "em_uso");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState(unidades[0]!.valor);
  const [loteId, setLoteId] = useState("");
  const [motivo, setMotivo] = useState(acao === "perda" ? contexto.motivosDePerda[0]!.valor : contexto.motivosDeBloqueio[0]!.valor);
  const [observacao, setObservacao] = useState("");
  const [doBloqueado, setDoBloqueado] = useState(false);
  const [rendimento, setRendimento] = useState("");
  const [validade, setValidade] = useState("");
  const [codigoLote, setCodigoLote] = useState("");
  const { enviar, ocupado, erro } = useEnvio();
  // Rendimento muito longe do previsto: o servidor pede para conferir; a pessoa confirma e reenvia.
  const [confirmar, setConfirmar] = useState(false);
  const pedeConfirmacao = acao === "producao" && /confira o número/i.test(erro);
  const para = local === "em_uso" ? "guardado" : "em_uso";
  const bloqueadoNoLote = acao === "desbloqueio" || (acao === "perda" && doBloqueado);
  const lotes = item.lotes.filter((l) => l.saldos.some((x) => x.area === area && x.local === local && x.bloqueado === bloqueadoNoLote && x.quantidade !== "0"));
  const opcoesDeLocal = Object.entries(NOME_DO_LOCAL).map(([valor, texto]) => ({ valor, texto }));

  async function gravar(confirmarRendimento = false) {
    const comum = {
      ...(item.ingredienteId !== null ? { ingredienteId: item.ingredienteId } : { preparoId: item.preparoId }),
      ...(observacao.trim() ? { observacao } : {}),
      ...(loteId ? { loteId: Number(loteId) } : {}),
    };
    let corpo: Record<string, unknown>;
    if (acao === "producao")
      corpo = { preparoId: item.preparoId, previsto: quantidade, rendimento, local, ...(confirmarRendimento ? { confirmarRendimento: true } : {}), ...(validade ? { validade } : {}), ...(codigoLote.trim() ? { lote: codigoLote } : {}), ...(observacao.trim() ? { observacao } : {}) };
    else if (acao === "transferencia") corpo = { ...comum, quantidade, unidade, de: { area, local }, para: { area, local: para } };
    else if (acao === "perda") corpo = { ...comum, quantidade, unidade, area, local, motivo, ...(doBloqueado ? { doBloqueado: true } : {}) };
    else if (acao === "bloqueio") corpo = { ...comum, quantidade, unidade, area, local, motivo };
    else corpo = { ...comum, quantidade, unidade, area, local };
    const r = await enviar<{ repetido: boolean; diferenca?: string; custoCentavos?: string | null; custoPorUnidade?: string | null }>(ROTA[acao], corpo);
    if (!r) return;
    if (r.repetido) return aoGravar(TE.form.repetido);
    const extra =
      acao === "producao" && r.diferenca !== undefined
        ? ` ${TE.form.producaoDiferenca(qtdComSinal(r.diferenca, item.unidade))}${r.custoCentavos ? ` ${TE.form.producaoCusto(reais(r.custoCentavos), custoMedio(r.custoPorUnidade ?? null, item.unidade))}` : ""}`
        : "";
    aoGravar(`${TE.form.feito[acao === "transferencia" ? "transferencia" : acao]}${extra}`);
  }

  return (
    <form
      className="est-form"
      data-testid={`form-${acao}`}
      onSubmit={(e) => {
        e.preventDefault();
        void gravar();
      }}
    >
      {acao !== "producao" && areas.length > 1 && (
        <Selecao rotulo={TE.form.area} explicacao={TE.form.areaAjuda} exemplo={TE.form.areaExemplo} value={area} onChange={(e) => setArea(e.target.value)} opcoes={areas} />
      )}
      {acao === "transferencia" ? (
        <Selecao
          rotulo={TE.form.de}
          explicacao={TE.form.localAjuda}
          exemplo={TE.form.localExemplo}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          opcoes={opcoesDeLocal.map((o) => ({ valor: o.valor, texto: `${o.texto} para ${NOME_DO_LOCAL[o.valor === "em_uso" ? "guardado" : "em_uso"]}` }))}
        />
      ) : (
        <Selecao rotulo={TE.form.local} explicacao={TE.form.localAjuda} exemplo={TE.form.localExemplo} value={local} onChange={(e) => setLocal(e.target.value)} opcoes={opcoesDeLocal} />
      )}
      {acao === "producao" ? (
        <>
          <Campo rotulo={`${TE.form.previsto} (${item.unidade})`} explicacao={TE.form.previstoAjuda} exemplo={TE.form.previstoExemplo} inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          <Campo rotulo={`${TE.form.rendimento} (${item.unidade})`} explicacao={TE.form.rendimentoAjuda} exemplo={TE.form.rendimentoExemplo} inputMode="decimal" value={rendimento} onChange={(e) => setRendimento(e.target.value)} />
          <Campo rotulo={TE.form.validade} explicacao={TE.form.validadeAjuda} exemplo={TE.form.validadeExemplo} type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
          <Campo rotulo={TE.form.codigoLote} explicacao={TE.form.codigoLoteAjuda} exemplo={TE.form.codigoLoteExemplo} value={codigoLote} maxLength={60} onChange={(e) => setCodigoLote(e.target.value)} />
        </>
      ) : (
        <>
          <div className="est-form__linha">
            <Campo rotulo={TE.form.quantidade} explicacao={TE.form.quantidadeAjuda} exemplo={TE.form.quantidadeExemplo} inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            <Selecao rotulo={TE.form.unidade} explicacao={TE.form.unidadeAjuda} exemplo={TE.form.unidadeExemplo} value={unidade} onChange={(e) => setUnidade(e.target.value)} opcoes={unidades} />
          </div>
          {acao === "perda" && (
            <>
              <Selecao rotulo={TE.form.motivo} explicacao={TE.form.motivoPerdaAjuda} exemplo={TE.form.motivoPerdaExemplo} value={motivo} onChange={(e) => setMotivo(e.target.value)} opcoes={contexto.motivosDePerda} />
              <Marcador rotulo={TE.form.doBloqueado} explicacao={TE.form.doBloqueadoAjuda} exemplo={TE.form.doBloqueadoExemplo} checked={doBloqueado} onChange={(e) => setDoBloqueado(e.target.checked)} />
            </>
          )}
          {acao === "bloqueio" && (
            <Selecao rotulo={TE.form.motivo} explicacao={TE.form.motivoBloqueioAjuda} exemplo={TE.form.motivoBloqueioExemplo} value={motivo} onChange={(e) => setMotivo(e.target.value)} opcoes={contexto.motivosDeBloqueio} />
          )}
          {lotes.length > 1 && (
            <Selecao
              rotulo={TE.form.lote}
              explicacao={TE.form.loteAjuda}
              exemplo={TE.form.loteExemplo}
              value={loteId}
              onChange={(e) => setLoteId(e.target.value)}
              opcoes={[{ valor: "", texto: TE.form.loteQualquer }, ...lotes.map((l) => ({ valor: String(l.loteId), texto: [l.validade ? TE.item.validade(dia(l.validade)) : TE.item.semValidade, l.codigo ? TE.item.codigo(l.codigo) : ""].filter(Boolean).join(", ") }))]}
            />
          )}
        </>
      )}
      <AreaDeTexto rotulo={TE.form.observacao} explicacao={TE.form.observacaoAjuda} exemplo={TE.form.observacaoExemplo} value={observacao} maxLength={500} rows={2} onChange={(e) => setObservacao(e.target.value)} />
      {erro && (
        <Aviso tipo="perigo" data-testid="erro-do-lancamento">
          {erro}
        </Aviso>
      )}
      {pedeConfirmacao && (
        <div className="est-form" data-testid="confirmar-rendimento">
          <p>
            <strong>{TE.form.confirmarRendimento}</strong> {TE.form.confirmarRendimentoTexto(qtd(rendimento.replace(",", "."), item.unidade), qtd(quantidade.replace(",", "."), item.unidade))}
          </p>
          <div className="hor-secao__botoes">
            <Botao disabled={ocupado || confirmar} onClick={() => {
              setConfirmar(true);
              void gravar(true).finally(() => setConfirmar(false));
            }}>
              {TE.form.confirmarRendimentoSim}
            </Botao>
          </div>
        </div>
      )}
      <div className="hor-secao__botoes">
        <Botao type="submit" disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? TE.form.gravando : TE.form.gravar}
        </Botao>
        <Botao variante="secundario" disabled={ocupado} onClick={aoCancelar}>
          {TE.form.cancelar}
        </Botao>
      </div>
    </form>
  );
}

function FormDeDesfazer({ movimentoId, aoCancelar, aoGravar }: { movimentoId: string; aoCancelar: () => void; aoGravar: (texto: string) => void }) {
  const [observacao, setObservacao] = useState("");
  const { enviar, ocupado, erro } = useEnvio();
  return (
    <form
      className="est-form"
      data-testid="form-desfazer"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar<{ repetido: boolean }>("/api/estoque/desfazer", { movimentoId, observacao }).then((r) => r && aoGravar(r.repetido ? TE.form.repetido : TE.form.feito.estorno));
      }}
    >
      <AreaDeTexto rotulo={TE.form.desfazerMotivo} explicacao={TE.form.desfazerMotivoAjuda} exemplo={TE.form.desfazerMotivoExemplo} value={observacao} maxLength={500} rows={2} onChange={(e) => setObservacao(e.target.value)} />
      {erro && (
        <Aviso tipo="perigo" data-testid="erro-do-desfazer">
          {erro}
        </Aviso>
      )}
      <div className="hor-secao__botoes">
        <Botao type="submit" variante="perigo" disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? TE.form.gravando : TE.form.desfazerConfirmar}
        </Botao>
        <Botao variante="secundario" disabled={ocupado} onClick={aoCancelar}>
          {TE.form.cancelar}
        </Botao>
      </div>
    </form>
  );
}
