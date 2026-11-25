"use client";

/**
 * Painel do estoque (E09, decisão 0027): cada item das áreas da pessoa nesta tela (Cozinha ou
 * Salão), com em uso, guardado, bloqueado, vencido e livre; "vence logo"; valor e custo médio só
 * quando o servidor manda (custos.ver). Filtro por área e busca. Tocar num item abre o detalhe
 * (lotes, histórico e lançamentos). A aba Contagem tem a contagem rápida, o inventário e a lista.
 * Lê tudo de GET /api/estoque, que confere a área no servidor.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso, Selo, varianteDaArea } from "@erp/interface";
import type { ItemDoPainel } from "@erp/dominio";
import { nomeComparavel } from "@erp/dominio/produtos";
import { chamar } from "../chamar";
import { BotaoExemplos, Campo, Marcador, Selecao } from "../Campo";
import { Abas } from "./Abas";
import { custoMedio, dia, hojeNaLoja, q4, qtd, reais, somarDias, textoQ4 } from "./comum";
import type { ContextoDoEstoque } from "./contexto";
import { Contagens } from "./Contagens";
import { DetalheDoItem } from "./DetalheDoItem";
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
  const [aberto, setAberto] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
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
  const areasVistas = area ? [area] : codigos;
  const filtrados = daPagina.filter((i) => {
    if (termo && !nomeComparavel(i.nome).includes(termo)) return false;
    if (area && i.areaPadrao !== area && !i.areas.some((a) => a.area === area)) return false;
    if (soVence) {
      const s = somaDasAreas(i, areasVistas);
      if (!(s.vencido > 0n || (i.proximaValidade !== null && i.proximaValidade <= limite))) return false;
    }
    return true;
  });
  const itemAberto = aberto ? daPagina.find((i) => chaveDoItem(i) === aberto) : undefined;

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
              <div className="est-filtros">
                <Campo rotulo={TE.painel.busca} explicacao={TE.painel.buscaAjuda} exemplo={TE.painel.buscaExemplo} type="search" value={busca} maxLength={60} autoComplete="off" onChange={(e) => setBusca(e.target.value)} />
                {minhas.length > 1 && (
                  <Selecao
                    rotulo={TE.painel.area}
                    explicacao={TE.painel.areaAjuda}
                    exemplo={TE.painel.areaExemplo}
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    opcoes={[{ valor: "", texto: TE.painel.todas }, ...minhas]}
                  />
                )}
                <Marcador rotulo={TE.painel.filtroVence} explicacao={TE.painel.filtroVenceAjuda} exemplo={TE.painel.filtroVenceExemplo} checked={soVence} onChange={(e) => setSoVence(e.target.checked)} />
              </div>
              {daPagina.length === 0 ? (
                <p className="hor-vazio">{TE.painel.vazio}</p>
              ) : filtrados.length === 0 ? (
                <p className="hor-vazio">{TE.painel.nenhum}</p>
              ) : (
                <ul className="est-itens" data-testid="itens-do-estoque">
                  {filtrados.map((i) => (
                    <CartaoDoItem key={chaveDoItem(i)} item={i} areas={areasVistas} contexto={contexto} limite={limite} aoAbrir={() => setAberto(chaveDoItem(i))} />
                  ))}
                </ul>
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
          aoFechar={() => setAberto(null)}
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
  return (
    <li className="est-item" data-testid={`item-${item.nome}`}>
      <button type="button" className="est-item__botao" onClick={aoAbrir} aria-label={TE.painel.abrir(item.nome)}>
        <span className="est-item__cabeca">
          <span className="est-item__nome">{item.nome}</span>
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
          {total === 0n && !cego && <Selo>{TE.painel.zerado}</Selo>}
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
