"use client";

/**
 * Painel do estoque (E09, decisão 0027): cada item das áreas da pessoa nesta tela (Cozinha ou
 * Salão), com em uso, guardado, bloqueado, vencido e livre; "vence logo"; valor e custo médio só
 * quando o servidor manda (custos.ver). Filtro por área e busca. Tocar num item abre o detalhe
 * (lotes, histórico e lançamentos). A aba Contagem tem a contagem rápida, o inventário e a lista.
 * Reposição (E10, decisão 0029): selo da pior situação nas áreas vistas (Repor, Emergência,
 * Esgotou) e "Trazer do guardado"; o chip "Para repor" mostra só o que não está saudável.
 * Lê tudo de GET /api/estoque, que confere a área no servidor.
 * Etiqueta do lote (ideia nº 16): a busca acha também pelo código do produto (BAC) e pela etiqueta
 * do pacote (BAC-002, "bac 2", "bac2"). Etiqueta que não está na lista carregada vai a GET
 * /api/estoque/etiqueta (o servidor decide e a mensagem dele aparece como veio), que abre a gaveta
 * do item com o lote marcado.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aviso, Selo, varianteDaArea } from "@erp/interface";
import type { ItemDoPainel } from "@erp/dominio";
import { nomeComparavel } from "@erp/dominio/produtos";
import { chamar } from "../chamar";
import { BotaoExemplos } from "../Campo";
import { Abas } from "./Abas";
import { consulta, custoMedio, dia, hojeNaLoja, leiturasDaBusca, q4, qtd, reais, somarDias, textoQ4 } from "./comum";
import type { ContextoDoEstoque } from "./contexto";
import { Contagens } from "./Contagens";
import { DetalheDoItem, type LoteEmDestaque } from "./DetalheDoItem";
import { DinheiroEmRisco } from "./DinheiroEmRisco";
import { EntradaDeMercadoria } from "./compras/EntradaDeMercadoria";
import { Recebimentos } from "./Recebimentos";
import { TE } from "./textos";

type Aba = "itens" | "contagem" | "entrada";
const DIAS_DO_VENCE_LOGO = 3;

/** Soma das áreas visíveis nesta tela (o servidor já manda só as áreas da pessoa). */
export function somaDasAreas(i: ItemDoPainel, areas: readonly string[]) {
  const s = { emUso: 0n, guardado: 0n, bloqueado: 0n, vencido: 0n, livre: 0n, aReceber: 0n, valor: null as bigint | null, emContagem: false };
  for (const a of i.areas) {
    if (!areas.includes(a.area)) continue;
    // Contagem cega: com contagem aberta do item nesta área, o servidor não manda os números.
    if (a.emContagem || a.livre === null) {
      s.emContagem = true;
      continue;
    }
    s.emUso += q4(a.emUso ?? "0");
    s.guardado += q4(a.guardado ?? "0");
    s.bloqueado += q4(a.bloqueado ?? "0");
    s.vencido += q4(a.vencido ?? "0");
    s.livre += q4(a.livre);
    s.aReceber += q4(a.aReceber ?? "0");
    if (a.valorCentavos !== null) s.valor = (s.valor ?? 0n) + BigInt(a.valorCentavos);
  }
  return s;
}

/** Gravidade da situação de reposição (quanto pior, maior), para mostrar só a pior das áreas vistas. */
const GRAVIDADE: Record<string, number> = { saudavel: 0, repor: 1, emergencia: 2, esgotado: 3 };

/** A pior situação de reposição nas áreas vistas e se alguma precisa trazer do guardado. Contagem cega: o servidor não manda. */
export function reposicaoDasAreas(i: Pick<ItemDoPainel, "reposicao">, areas: readonly string[]) {
  let pior: string = "saudavel";
  let abastecer = false;
  for (const r of i.reposicao ?? []) {
    if (!areas.includes(r.area)) continue;
    if ((GRAVIDADE[r.situacao] ?? 0) > (GRAVIDADE[pior] ?? 0)) pior = r.situacao;
    if (r.abastecer) abastecer = true;
  }
  return { pior, abastecer };
}

export const chaveDoItem = (i: Pick<ItemDoPainel, "ingredienteId" | "preparoId">) => (i.ingredienteId !== null ? `i${i.ingredienteId}` : `p${i.preparoId}`);

export function PainelDoEstoque({ contexto, areasDaPagina, titulo }: { contexto: ContextoDoEstoque; areasDaPagina: readonly string[]; titulo: string }) {
  const minhas = useMemo(() => contexto.areas.filter((a) => areasDaPagina.includes(a.valor)), [contexto.areas, areasDaPagina]);
  const codigos = useMemo(() => minhas.map((a) => a.valor), [minhas]);
  const [itens, setItens] = useState<ItemDoPainel[] | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<Aba>("itens");
  const [busca, setBusca] = useState("");
  const [area, setArea] = useState("");
  const [soVence, setSoVence] = useState(false);
  const [soRepor, setSoRepor] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  /** Lote achado pela etiqueta (marcado na gaveta). */
  const [destaque, setDestaque] = useState<LoteEmDestaque | null>(null);
  /** Busca de etiqueta no servidor: procurando ou a mensagem de "não achou". */
  const [buscaNoServidor, setBuscaNoServidor] = useState<{ etiqueta: string; mensagem: string } | null>(null);
  /** Última etiqueta perguntada ao servidor (a recarga da lista não pergunta de novo nem reabre a gaveta). */
  const procurada = useRef<string | null>(null);
  /** Muda a cada recarga: o bloco "Dinheiro em risco" busca de novo. */
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(async () => {
    setVersao((v) => v + 1);
    const r = await chamar<ItemDoPainel[]>("/api/estoque");
    if (r.ok && r.dados) {
      setItens(r.dados);
      setErro("");
    } else setErro(r.mensagem);
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const daPagina = useMemo(
    () => (itens ?? []).filter((i) => codigos.includes(i.areaPadrao) || i.areas.some((a) => codigos.includes(a.area))),
    [itens, codigos],
  );
  const hoje = hojeNaLoja();
  const limite = somarDias(hoje, DIAS_DO_VENCE_LOGO);
  const termo = nomeComparavel(busca);
  const leituras = useMemo(() => leiturasDaBusca(busca), [busca]);
  /** O texto que vai ao servidor quando parece etiqueta (nulo se não parece). */
  const etiquetaBuscada = leituras.length > 0 ? busca.trim().toUpperCase() : null;
  const etiquetaDoItem = (i: ItemDoPainel) => i.etiquetas.find((e) => leituras.includes(e)) ?? null;
  const codigoBuscado = busca.trim().toUpperCase();
  const areasVistas = area ? [area] : codigos;
  const achaNaBusca = (i: ItemDoPainel) =>
    nomeComparavel(i.nome).includes(termo) || (i.codigo !== null && i.codigo === codigoBuscado) || etiquetaDoItem(i) !== null;
  const filtrados = daPagina.filter((i) => {
    if (termo && !achaNaBusca(i)) return false;
    if (area && i.areaPadrao !== area && !i.areas.some((a) => a.area === area)) return false;
    if (soVence) {
      const s = somaDasAreas(i, areasVistas);
      if (!(s.vencido > 0n || (i.proximaValidade !== null && i.proximaValidade <= limite))) return false;
    }
    if (soRepor && reposicaoDasAreas(i, areasVistas).pior === "saudavel") return false;
    return true;
  });
  // A gaveta pode abrir um item achado pela etiqueta que não está nesta tela (está em outra área da pessoa).
  const itemAberto = aberto ? (daPagina.find((i) => chaveDoItem(i) === aberto) ?? itens?.find((i) => chaveDoItem(i) === aberto)) : undefined;
  const etiquetaNaLista = leituras.length > 0 && daPagina.some((i) => etiquetaDoItem(i) !== null);

  // Parece etiqueta e não está na lista carregada: pergunta ao servidor (que confere as áreas da
  // pessoa) e abre a gaveta do item com o lote marcado. Espera a pessoa parar de digitar.
  useEffect(() => {
    if (etiquetaBuscada === null || etiquetaNaLista || !itens) {
      procurada.current = null;
      setBuscaNoServidor(null);
      return;
    }
    if (procurada.current === etiquetaBuscada) return;
    let vivo = true;
    setBuscaNoServidor({ etiqueta: etiquetaBuscada, mensagem: TE.etiqueta.procurando(etiquetaBuscada) });
    const espera = window.setTimeout(async () => {
      const r = await chamar<{ itemId: number; ingredienteId: number | null; preparoId: number | null; loteId: number; etiqueta: string }>(`/api/estoque/etiqueta${consulta({ etiqueta: etiquetaBuscada })}`);
      if (!vivo) return;
      procurada.current = etiquetaBuscada;
      if (!r.ok || !r.dados) return setBuscaNoServidor({ etiqueta: etiquetaBuscada, mensagem: r.mensagem });
      setBuscaNoServidor(null);
      setDestaque({ loteId: r.dados.loteId, etiqueta: r.dados.etiqueta });
      setAberto(chaveDoItem(r.dados));
    }, 400);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [etiquetaBuscada, etiquetaNaLista, itens]);

  /** Tocar num item: se a busca é uma etiqueta dele, o lote fica marcado na gaveta. */
  const abrirItem = (i: ItemDoPainel) => {
    const etiqueta = etiquetaDoItem(i);
    setDestaque(etiqueta !== null ? { loteId: null, etiqueta } : null);
    setAberto(chaveDoItem(i));
  };

  return (
    <div className="hor-tela est-tela">
      <header className="hor-tela__cabeca">
        <h1>{titulo}</h1>
        <p className="hor-tela__intro">{TE.painel.intro}</p>
      </header>
      {minhas.length === 0 && <Aviso tipo="atencao">{TE.painel.semArea}</Aviso>}
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!itens && !erro && <p aria-live="polite">{TE.carregando}</p>}
      {/* Veio de outra área para esta tela: quem recebe confirma ou recusa (25/11/2026). */}
      {itens && minhas.length > 0 && <Recebimentos contexto={contexto} areas={codigos} aoMudar={() => void recarregar()} />}
      {/* D1 (ideia nº 15): só quem vê custos; sem custos.ver a rota nem é chamada. */}
      {itens && minhas.length > 0 && contexto.podeVerCusto && (
        <DinheiroEmRisco
          contexto={contexto}
          areas={codigos}
          versao={versao}
          aoAbrirItem={(itemId) => {
            const i = daPagina.find((x) => x.itemId === itemId);
            if (i) {
              setDestaque(null);
              setAberto(chaveDoItem(i));
            }
          }}
        />
      )}
      {itens && minhas.length > 0 && (
        <Abas
          rotulo={TE.painel.abas}
          abas={[
            { valor: "itens", texto: TE.painel.abaItens },
            { valor: "contagem", texto: TE.painel.abaContagem },
            { valor: "entrada", texto: TE.painel.abaEntrada },
          ]}
          atual={aba}
          aoTrocar={setAba}
        >
          {aba === "itens" && (
            <>
              <BotaoExemplos />
              <div className="balcao-barra">
                <div className="balcao-chips" role="group" aria-label={TE.painel.area}>
                  {minhas.length > 1 && (
                    <>
                      <button type="button" className="balcao-chip" aria-pressed={!area} onClick={() => setArea("")}>
                        {TE.painel.todas}
                      </button>
                      {minhas.map((m) => (
                        <button key={m.valor} type="button" className="balcao-chip" aria-pressed={area === m.valor} onClick={() => setArea(m.valor)}>
                          {m.texto}
                        </button>
                      ))}
                    </>
                  )}
                  <button type="button" className="balcao-chip" aria-pressed={soVence} onClick={() => setSoVence(!soVence)} title={TE.painel.filtroVenceAjuda}>
                    {TE.painel.filtroVence}
                  </button>
                  <button type="button" className="balcao-chip" aria-pressed={soRepor} onClick={() => setSoRepor(!soRepor)} title={TE.painel.filtroReporAjuda}>
                    {TE.painel.filtroRepor}
                  </button>
                </div>
                <div className="balcao-acoes">
                  <label className="balcao-busca">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />
                    </svg>
                    <input type="search" value={busca} maxLength={60} autoComplete="off" onChange={(e) => setBusca(e.target.value)} placeholder={`${TE.painel.busca} (ex.: ${TE.painel.buscaExemplo})`} aria-label={TE.painel.busca} />
                  </label>
                </div>
              </div>
              {buscaNoServidor && (
                <p className="est-busca__aviso" aria-live="polite" data-testid="busca-da-etiqueta">
                  {buscaNoServidor.mensagem}
                </p>
              )}
              {daPagina.length === 0 ? (
                <p className="hor-vazio">{TE.painel.vazio}</p>
              ) : filtrados.length === 0 ? (
                <p className="hor-vazio">{TE.painel.nenhum}</p>
              ) : (
                <div className="balcao-lista">
                  <ul className="est-itens" data-testid="itens-do-estoque">
                    {filtrados.map((i) => (
                      <CartaoDoItem key={chaveDoItem(i)} item={i} areas={areasVistas} contexto={contexto} limite={limite} aoAbrir={() => abrirItem(i)} />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {/* Quem recebe a mercadoria (cozinha ou salão) dá entrada aqui, nas áreas desta tela. Valor só com custos.ver. */}
          {aba === "entrada" && <EntradaDeMercadoria contexto={{ ...contexto, areas: minhas }} aoGravar={() => void recarregar()} />}
          {aba === "contagem" && <Contagens contexto={contexto} areas={minhas} itens={daPagina} aoMudar={() => void recarregar()} />}
        </Abas>
      )}
      {itemAberto && (
        <DetalheDoItem
          resumo={itemAberto}
          contexto={contexto}
          areas={minhas}
          destaque={destaque}
          aoFechar={() => {
            setAberto(null);
            setDestaque(null);
          }}
          aoMudar={() => void recarregar()}
        />
      )}
    </div>
  );
}

function CartaoDoItem({ item, areas, contexto, limite, aoAbrir }: { item: ItemDoPainel; areas: readonly string[]; contexto: ContextoDoEstoque; limite: string; aoAbrir: () => void }) {
  const s = somaDasAreas(item, areas);
  // Em contagem (cega): no lugar dos números, "Em contagem".
  const cego = s.emContagem || (item.emContagem && areas.includes(item.areaPadrao) && item.areas.every((a) => !areas.includes(a.area) || a.emContagem));
  const n = (v: bigint) => (cego ? TE.painel.emContagem : qtd(textoQ4(v), item.unidade));
  const total = s.emUso + s.guardado + s.aReceber;
  const venceLogo = item.proximaValidade !== null && item.proximaValidade <= limite;
  const rep = reposicaoDasAreas(item, areas);
  return (
    <li className="est-item" data-testid={`item-${item.nome}`}>
      <button type="button" className="est-item__botao" onClick={aoAbrir} aria-label={TE.painel.abrir(item.nome)}>
        <span className="est-item__cabeca">
          <span className="est-item__nome">
            {item.nome}
            {item.codigo && item.usaEtiqueta && (
              <>
                {" "}
                <span className="est-item__codigo" data-testid="codigo-do-item">
                  <span className="ajuda__so-leitor">{TE.etiqueta.codigoDoItem} </span>
                  {item.codigo}
                </span>
              </>
            )}
          </span>
          <span className="est-item__livre" data-testid="livre">
            <span className="est-item__rotulo">{TE.painel.livre}</span> {n(s.livre)}
          </span>
        </span>
        <span className="est-item__selos">
          <Selo variante={varianteDaArea(item.areaPadrao)}>{contexto.nomeDaArea[item.areaPadrao] ?? item.areaPadrao}</Selo>
          {item.preparoId !== null && <Selo variante="info">{TE.painel.preparo}</Selo>}
          {s.vencido > 0n && (
            <Selo variante="perigo" icone="alerta">
              {TE.painel.venceu}
            </Selo>
          )}
          {venceLogo && s.vencido === 0n && (
            <Selo variante="alerta" icone="relogio">
              {TE.painel.venceLogo(dia(item.proximaValidade))}
            </Selo>
          )}
          {cego && <Selo variante="info">{TE.painel.emContagem}</Selo>}
          {rep.pior === "esgotado" && (
            <Selo variante="perigo" icone="alerta" data-testid="situacao">
              {TE.painel.esgotou}
            </Selo>
          )}
          {rep.pior === "emergencia" && (
            <Selo variante="perigo" data-testid="situacao">
              {TE.painel.emergencia}
            </Selo>
          )}
          {rep.pior === "repor" && (
            <Selo variante="alerta" data-testid="situacao">
              {TE.painel.repor}
            </Selo>
          )}
          {rep.abastecer && <Selo variante="info">{TE.painel.trazerDoGuardado}</Selo>}
          {total === 0n && !cego && rep.pior !== "esgotado" && <Selo>{TE.painel.zerado}</Selo>}
        </span>
        <span className="est-item__numeros">
          <Numero rotulo={TE.painel.emUso} valor={n(s.emUso)} />
          <Numero rotulo={TE.painel.guardado} valor={n(s.guardado)} />
          <Numero rotulo={TE.painel.bloqueado} valor={n(s.bloqueado)} destaque={s.bloqueado > 0n} />
          <Numero rotulo={TE.painel.vencido} valor={n(s.vencido)} destaque={s.vencido > 0n} />
          {s.aReceber > 0n && <Numero rotulo={TE.painel.aReceber} valor={n(s.aReceber)} destaque />}
        </span>
        {(item.proximaValidade || s.valor !== null || item.custoMedioCentavos) && (
          <span className="est-item__rodape">
            {item.proximaValidade && !venceLogo && <span>{TE.painel.proxima(dia(item.proximaValidade))}</span>}
            {s.valor !== null && (
              <span>
                {TE.painel.valor}: {reais(s.valor.toString())}
              </span>
            )}
            {item.custoMedioCentavos && (
              <span>
                {TE.painel.custoMedio}: {custoMedio(item.custoMedioCentavos, item.unidade)}
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <span className={`est-numero${destaque ? " est-numero--destaque" : ""}`}>
      <span className="est-numero__rotulo">{rotulo}</span>
      <span className="est-numero__valor">{valor}</span>
    </span>
  );
}
