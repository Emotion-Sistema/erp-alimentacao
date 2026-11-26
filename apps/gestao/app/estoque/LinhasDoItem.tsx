"use client";

/**
 * Linhas de reposição do item (E10, decisão 0029), dentro do detalhe do item: por área, a situação
 * agora, as linhas (saudável, emergência, abastecimento do em uso, aviso do guardado), quem mudou e
 * quando, e "dura até" pelo consumo real. "Mudar linhas" abre o formulário aqui mesmo (sem outra
 * janela). "Usar sugestão" pede a conta ao servidor (que nunca grava) e preenche saudável e
 * emergência. O servidor confere quem cuida da área em cada chamada; a mensagem dele aparece.
 */
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Selo } from "@erp/interface";
import type { LinhasDaArea, MudancaDeLinha, SugestaoDeLinhas } from "@erp/dominio";
import { opcaoDeUnidade } from "@erp/dominio/unidades";
import { chamar } from "../chamar";
import { AreaDeTexto, Campo, Selecao } from "../Campo";
import { formatarDataHora } from "../formatar";
import { consulta, dia, qtd, textoQ4, unidadesDoItem } from "./comum";
import type { ContextoDoEstoque } from "./contexto";
import { useEnvio } from "./envio";
import { TE } from "./textos";

const T = TE.linhas;
type Ref = { ingredienteId: number } | { preparoId: number };
type Dados = { areas: LinhasDaArea[]; mudancas: MudancaDeLinha[] };

/** Situação de reposição em selo (texto sempre; a cor só ajuda). */
export function SeloDaSituacao({ situacao }: { situacao: string | null }) {
  if (situacao === null) return null;
  const variante = situacao === "esgotado" || situacao === "emergencia" ? "perigo" : situacao === "repor" ? "alerta" : "sucesso";
  return (
    <Selo variante={variante} icone={situacao === "esgotado" ? "alerta" : undefined} data-testid="situacao-da-area">
      {T.situacao[situacao] ?? situacao}
    </Selo>
  );
}

/** "24/11/2026" -> "24/11". */
const diaCurto = (iso: string) => dia(iso).slice(0, 5);

/** Frase da base da sugestão (consumo, prazo, folga e "dura até"). */
export function fraseDaSugestao(s: SugestaoDeLinhas): string {
  if (s.consumo === "0") return T.semConsumo(s.dias);
  const base = T.base(qtd(s.mediaDiaria, s.unidade), s.dias, s.prazoDias, s.prazoDe === "fornecedor", s.folgaDias);
  return s.duraAte ? `${base} ${T.duraAte(diaCurto(s.duraAte))}` : base;
}

export function LinhasDoItem({ refDoItem, unidade, preparo, contexto, codigos, areasDoItem, cegas, aoMudar }: {
  refDoItem: Ref;
  unidade: string;
  preparo: boolean;
  contexto: ContextoDoEstoque;
  /** Áreas desta tela. */
  codigos: readonly string[];
  /** Áreas em que o item tem saldo (para definir a primeira linha lá). */
  areasDoItem: readonly string[];
  /** Áreas em contagem cega do item (sem situação nem "dura até"). */
  cegas: readonly string[];
  aoMudar: () => void;
}) {
  const chaveDaRef = JSON.stringify(refDoItem);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [dura, setDura] = useState<Record<string, SugestaoDeLinhas>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [feito, setFeito] = useState("");

  const carregar = useCallback(async () => {
    const ref = JSON.parse(chaveDaRef) as Record<string, number>;
    const r = await chamar<Dados>(`/api/estoque/linhas${consulta(ref)}`);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setErro("");
    setDados(r.dados);
    // "Dura até" de cada área: a mesma conta da sugestão (nada é gravado). O prazo só entra na
    // sugestão das linhas; aqui vai 0 para não pedir o prazo quando o fornecedor não tem.
    const areas = r.dados.areas.map((a) => a.area);
    const sugestoes = await Promise.all(areas.map((area) => chamar<SugestaoDeLinhas>(`/api/estoque/linhas/sugestao${consulta({ ...ref, area, prazoDias: 0 })}`)));
    const m: Record<string, SugestaoDeLinhas> = {};
    sugestoes.forEach((s, k) => {
      if (s.ok && s.dados) m[areas[k]!] = s.dados;
    });
    setDura(m);
  }, [chaveDaRef]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // As áreas desta tela: as que o servidor mandou e as que têm saldo do item (ainda sem linha).
  const vistas = dados
    ? [
        ...dados.areas.filter((a) => codigos.includes(a.area)),
        ...areasDoItem
          .filter((a) => codigos.includes(a) && !dados.areas.some((x) => x.area === a))
          .map(
            (a): LinhasDaArea => ({ itemId: 0, area: a as LinhasDaArea["area"], unidade, saudavel: null, emergencia: null, abastecimento: null, avisoGuardado: "urgente", alteradoPor: null, alteradoEm: null, situacao: null, usandoGuardado: null, abastecer: null }),
          ),
      ]
    : [];
  const mudancas = (dados?.mudancas ?? []).filter((m) => codigos.includes(m.area));
  const nome = (a: string) => contexto.nomeDaArea[a] ?? a;
  const valor = (v: string | null, u: string) => (v === null ? T.semValor : qtd(v, u));
  const texto = (l: { saudavel: string | null; emergencia: string | null; abastecimento: string | null; avisoGuardado: string }, u: string) =>
    T.valores(valor(l.saudavel, u), valor(l.emergencia, u), valor(l.abastecimento, u), T.avisos[l.avisoGuardado] ?? l.avisoGuardado);

  return (
    <section className="est-bloco" aria-labelledby="est-linhas" data-testid="linhas-de-reposicao">
      <h3 id="est-linhas">{T.titulo}</h3>
      <p className="hor-secao__intro">{T.intro}</p>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!dados && !erro && <p>{TE.carregando}</p>}
      {feito && (
        <Aviso tipo="sucesso" data-testid="linhas-salvas">
          {feito}
        </Aviso>
      )}
      {dados && (
        <ul className="est-lista">
          {vistas.map((l) => {
            const semLinha = l.saudavel === null && l.emergencia === null && l.abastecimento === null;
            const s = dura[l.area];
            return (
              <li key={l.area} className="est-linha" data-testid={`linhas-${l.area}`}>
                <span className="est-linha__cabeca">
                  <strong>{nome(l.area)}</strong>
                  {!cegas.includes(l.area) && <SeloDaSituacao situacao={l.situacao} />}
                  {l.abastecer && <Selo variante="info">{TE.painel.trazerDoGuardado}</Selo>}
                </span>
                {cegas.includes(l.area) && <p className="est-linha__texto">{T.emContagem}</p>}
                <p className="est-linha__texto" data-testid="linhas-atuais">
                  {semLinha ? T.semLinhas : texto(l, l.unidade)}
                </p>
                {l.alteradoPor && l.alteradoEm && <p className="est-linha__texto">{T.alterado(l.alteradoPor, formatarDataHora(l.alteradoEm))}</p>}
                {s && !cegas.includes(l.area) && (s.consumo === "0" || s.duraAte) && (
                  <p className="est-linha__texto" data-testid="dura-ate">
                    {s.consumo === "0" ? T.semConsumo(s.dias) : T.duraAte(diaCurto(s.duraAte!))}
                  </p>
                )}
                {editando === l.area ? (
                  <FormDasLinhas
                    refDoItem={refDoItem}
                    linha={l}
                    preparo={preparo}
                    observacao={mudancas.find((m) => m.area === l.area)?.observacao ?? ""}
                    aoCancelar={() => setEditando(null)}
                    aoGravar={() => {
                      setEditando(null);
                      setFeito(T.salvo);
                      void carregar();
                      aoMudar();
                    }}
                  />
                ) : (
                  <Botao
                    variante="secundario"
                    className="est-mov__desfazer"
                    onClick={() => {
                      setFeito("");
                      setEditando(l.area);
                    }}
                  >
                    {T.mudar}
                    {vistas.length > 1 && <span className="ajuda__so-leitor"> ({nome(l.area)})</span>}
                  </Botao>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {dados && (
        <>
          <h4 className="est-linhas__subtitulo">{T.mudancas}</h4>
          {mudancas.length === 0 ? (
            <p className="hor-vazio">{T.semMudancas}</p>
          ) : (
            <ol className="est-historico" data-testid="mudancas-das-linhas">
              {mudancas.map((m, k) => (
                <li key={`${m.area}-${m.em}-${k}`} className="est-mov">
                  <span className="est-mov__obs">{T.mudanca(nome(m.area), texto(m, unidade))}</span>
                  {m.observacao && <span className="est-mov__obs">{m.observacao}</span>}
                  <span className="est-mov__quando">{TE.item.por(m.por, formatarDataHora(m.em))}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- formulário

/** Texto digitado ("2,5") -> dez-milésimos; nulo se não for número. Vazio também nulo. */
function lerQ4(t: string): bigint | null {
  const m = /^(\d{1,12})(?:[.,](\d{1,4}))?$/.exec(t.trim());
  if (!m) return null;
  return BigInt(m[1]!) * 10_000n + BigInt((m[2] ?? "").padEnd(4, "0"));
}
const paraCampo = (q: bigint | null) => (q === null ? "" : textoQ4(q).replace(".", ","));
const fatorDe = (u: string) => opcaoDeUnidade(u)?.fator ?? 1n;

/**
 * Escolhe a unidade mais à mão para mostrar as linhas (ex.: kg em vez de g) quando todas cabem
 * exatas nela; senão, a do estoque. Recebe e devolve dez-milésimos (sem float).
 */
function emUnidadeBoa(valores: (bigint | null)[], unidades: { valor: string }[], base: string): { unidade: string; valores: (bigint | null)[] } {
  for (const u of unidades) {
    const f = fatorDe(u.valor);
    if (opcaoDeUnidade(u.valor)?.base !== base && u.valor !== base) continue;
    if (valores.every((v) => v === null || v % f === 0n)) return { unidade: u.valor, valores: valores.map((v) => (v === null ? null : v / f)) };
  }
  return { unidade: base, valores };
}

function FormDasLinhas({ refDoItem, linha, preparo, observacao: obsAtual, aoCancelar, aoGravar }: { refDoItem: Ref; linha: LinhasDaArea; preparo: boolean; observacao: string; aoCancelar: () => void; aoGravar: () => void }) {
  // Preparo conta só na unidade dele (o servidor recusa outra); ingrediente, na família (kg, g...).
  const unidades = preparo ? [{ valor: linha.unidade, texto: linha.unidade }] : unidadesDoItem(linha.unidade);
  const [inicio] = useState(() => {
    const atual = [linha.saudavel, linha.emergencia, linha.abastecimento].map((v) => (v === null ? null : lerQ4(v)));
    const tudoVazio = atual.every((v) => v === null);
    return tudoVazio ? { unidade: unidades[0]!.valor, valores: atual } : emUnidadeBoa(atual, unidades, linha.unidade);
  });
  const [saudavel, setSaudavel] = useState(paraCampo(inicio.valores[0] ?? null));
  const [emergencia, setEmergencia] = useState(paraCampo(inicio.valores[1] ?? null));
  const [abastecimento, setAbastecimento] = useState(paraCampo(inicio.valores[2] ?? null));
  const [unidade, setUnidade] = useState(inicio.unidade);
  const [aviso, setAviso] = useState<string>(linha.avisoGuardado);
  const [observacao, setObservacao] = useState(obsAtual);
  const [base, setBase] = useState("");
  const [prazo, setPrazo] = useState("");
  const [erroDaSugestao, setErroDaSugestao] = useState("");
  const [buscando, setBuscando] = useState(false);
  const { enviar, ocupado, erro, setErro } = useEnvio();
  const pedePrazo = /prazo de entrega/i.test(erroDaSugestao) || prazo !== "";

  async function usarSugestao() {
    setErroDaSugestao("");
    setBase("");
    if (prazo !== "" && !/^\d{1,2}$/.test(prazo.trim())) return setErroDaSugestao(TE.linhas.numeroInvalido(T.prazo));
    setBuscando(true);
    const r = await chamar<SugestaoDeLinhas>(`/api/estoque/linhas/sugestao${consulta({ ...refDoItem, area: linha.area, prazoDias: prazo.trim() })}`);
    setBuscando(false);
    if (!r.ok || !r.dados) return setErroDaSugestao(r.mensagem);
    const s = r.dados;
    setBase(fraseDaSugestao(s));
    if (s.saudavel === null || s.emergencia === null) return;
    // A sugestão vem na unidade do estoque; o abastecimento que já está no campo vai junto para
    // a mesma conta (multiplicar é exato) e tudo volta na unidade mais à mão.
    const fator = fatorDe(unidade);
    const abast = abastecimento.trim() === "" ? null : lerQ4(abastecimento);
    if (abastecimento.trim() !== "" && abast === null) return setErroDaSugestao(TE.linhas.numeroInvalido(T.abastecimento));
    const boa = emUnidadeBoa([lerQ4(s.saudavel), lerQ4(s.emergencia), abast === null ? null : abast * fator], unidades, s.unidade);
    setUnidade(boa.unidade);
    setSaudavel(paraCampo(boa.valores[0] ?? null));
    setEmergencia(paraCampo(boa.valores[1] ?? null));
    setAbastecimento(paraCampo(boa.valores[2] ?? null));
  }

  async function salvar() {
    setErro("");
    const r = await enviar<LinhasDaArea>("/api/estoque/linhas", {
      ...refDoItem,
      area: linha.area,
      saudavel: saudavel.trim() || null,
      emergencia: emergencia.trim() || null,
      abastecimento: abastecimento.trim() || null,
      unidade,
      avisoGuardado: aviso,
      observacao,
    });
    if (r) aoGravar();
  }

  return (
    <form
      className="est-form"
      data-testid="form-linhas"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <div className="hor-secao__botoes">
        <Botao variante="secundario" disabled={buscando || ocupado} aria-busy={buscando} onClick={() => void usarSugestao()}>
          {buscando ? T.buscandoSugestao : T.usarSugestao}
        </Botao>
      </div>
      {pedePrazo && <Campo rotulo={T.prazo} explicacao={T.prazoAjuda} exemplo={T.prazoExemplo} inputMode="numeric" maxLength={2} value={prazo} onChange={(e) => setPrazo(e.target.value)} />}
      {erroDaSugestao && (
        <Aviso tipo="perigo" data-testid="erro-da-sugestao">
          {erroDaSugestao}
        </Aviso>
      )}
      {base && (
        <p className="est-linha__texto" data-testid="base-da-sugestao" aria-live="polite">
          {base}
        </p>
      )}
      <div className="est-form__linha">
        <Campo rotulo={T.saudavel} explicacao={T.saudavelAjuda} exemplo={T.saudavelExemplo} inputMode="decimal" value={saudavel} maxLength={20} onChange={(e) => setSaudavel(e.target.value)} />
        <Campo rotulo={T.emergencia} explicacao={T.emergenciaAjuda} exemplo={T.emergenciaExemplo} inputMode="decimal" value={emergencia} maxLength={20} onChange={(e) => setEmergencia(e.target.value)} />
      </div>
      <div className="est-form__linha">
        <Campo rotulo={T.abastecimento} explicacao={T.abastecimentoAjuda} exemplo={T.abastecimentoExemplo} inputMode="decimal" value={abastecimento} maxLength={20} onChange={(e) => setAbastecimento(e.target.value)} />
        <Selecao rotulo={T.unidade} explicacao={T.unidadeAjuda} exemplo={T.unidadeExemplo} value={unidade} onChange={(e) => setUnidade(e.target.value)} opcoes={unidades} />
      </div>
      <Selecao rotulo={T.aviso} explicacao={T.avisoAjuda} exemplo={T.avisoExemplo} value={aviso} onChange={(e) => setAviso(e.target.value)} opcoes={Object.entries(T.avisos).map(([valor, texto]) => ({ valor, texto }))} />
      <AreaDeTexto rotulo={T.observacao} explicacao={T.observacaoAjuda} exemplo={T.observacaoExemplo} value={observacao} maxLength={500} rows={2} onChange={(e) => setObservacao(e.target.value)} />
      {erro && (
        <Aviso tipo="perigo" data-testid="erro-das-linhas">
          {erro}
        </Aviso>
      )}
      <div className="hor-secao__botoes">
        <Botao type="submit" disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? T.salvando : T.salvar}
        </Botao>
        <Botao variante="secundario" disabled={ocupado} onClick={aoCancelar}>
          {T.cancelar}
        </Botao>
      </div>
    </form>
  );
}
