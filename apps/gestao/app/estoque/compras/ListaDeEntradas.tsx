"use client";

/**
 * Lista das entradas (compras e saldo inicial) das áreas da pessoa, a mais nova primeiro, com o
 * filtro "só estimadas", as fotos da nota e a correção de custo (só para quem vê custos; o servidor
 * confere `custos.ver` e a área). Valores só aparecem quando o servidor manda.
 */
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Selo } from "@erp/interface";
import type { EntradaDaLista, ItemDoPainel } from "@erp/dominio";
import { centavosDoTexto } from "@erp/dominio/produtos";
import { chamar } from "../../chamar";
import { Campo, Marcador } from "../../Campo";
import { formatarDataHora } from "../../formatar";
import { consulta, dia, novaChave, qtd, reais } from "../comum";
import type { ContextoDoEstoque } from "../contexto";
import { TE } from "../textos";
import { AnexarFoto } from "./AnexarFoto";

const T = TE.lista;
const POR_VEZ = 20;

export function ListaDeEntradas({ contexto, versao }: { contexto: ContextoDoEstoque; versao: number }) {
  const [entradas, setEntradas] = useState<EntradaDaLista[] | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [soEstimadas, setSoEstimadas] = useState(false);
  const [erro, setErro] = useState("");
  const [painel, setPainel] = useState<ItemDoPainel[]>([]);

  const carregar = useCallback(async (so: boolean) => {
    const r = await chamar<EntradaDaLista[]>(`/api/estoque/entradas${consulta({ soEstimadas: so || null, limite: POR_VEZ })}`);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setErro("");
    setEntradas(r.dados);
    setTemMais(r.dados.length === POR_VEZ);
  }, []);

  useEffect(() => {
    void carregar(soEstimadas);
  }, [carregar, soEstimadas, versao]);

  // A correção de custo pede o ingrediente (ou preparo); a lista traz o item do estoque: o painel liga um ao outro.
  useEffect(() => {
    if (!contexto.podeVerCusto) return;
    void chamar<ItemDoPainel[]>("/api/estoque").then((r) => r.ok && r.dados && setPainel(r.dados));
  }, [contexto.podeVerCusto, versao]);

  async function mais() {
    const ultima = entradas?.[entradas.length - 1];
    if (!ultima) return;
    const r = await chamar<EntradaDaLista[]>(`/api/estoque/entradas${consulta({ soEstimadas: soEstimadas || null, limite: POR_VEZ, antesDe: ultima.movimentoId })}`);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setEntradas((e) => [...(e ?? []), ...r.dados!]);
    setTemMais(r.dados.length === POR_VEZ);
  }

  return (
    <div className="est-contagens">
      <Marcador rotulo={T.soEstimadas} explicacao={T.soEstimadasAjuda} exemplo={T.soEstimadasExemplo} checked={soEstimadas} onChange={(e) => setSoEstimadas(e.target.checked)} />
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!entradas && !erro && <p>{TE.carregando}</p>}
      {entradas && entradas.length === 0 && <p className="hor-vazio">{T.nenhuma}</p>}
      {entradas && entradas.length > 0 && (
        <ul className="est-lista" data-testid="lista-de-entradas">
          {entradas.map((e) => (
            <UmaEntrada key={e.movimentoId} entrada={e} contexto={contexto} painel={painel} aoMudar={() => void carregar(soEstimadas)} />
          ))}
        </ul>
      )}
      {temMais && (
        <Botao variante="secundario" onClick={() => void mais()}>
          {T.mais}
        </Botao>
      )}
    </div>
  );
}

function UmaEntrada({ entrada: e, contexto, painel, aoMudar }: { entrada: EntradaDaLista; contexto: ContextoDoEstoque; painel: ItemDoPainel[]; aoMudar: () => void }) {
  const [anexando, setAnexando] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  return (
    <li className="est-linha" data-testid={`entrada-${e.movimentoId}`}>
      <span className="est-linha__cabeca">
        <strong>{e.tipo === "saldo_inicial" ? T.saldoInicial : T.compra}</strong>
        {e.notaNumero && <span>{T.nota(e.notaNumero)}</span>}
        {e.notaData && <span>{T.deDia(dia(e.notaData))}</span>}
        {e.fornecedor && <Selo>{e.fornecedor}</Selo>}
      </span>
      <span className="est-linha__texto">{T.por(e.autor, formatarDataHora(e.quando))}</span>
      {e.observacao && <span className="est-linha__texto">{e.observacao}</span>}
      <ul className="est-lote__saldos">
        {e.itens.map((i) => (
          <li key={i.itemId}>
            {i.nome}: <strong>{qtd(i.quantidade, i.unidade)}</strong>
            {i.valorCentavos !== null && ` (${reais(i.valorCentavos)})`} {i.estimado && !i.corrigido && <Selo variante="alerta">{T.estimado}</Selo>}
            {i.corrigido && <Selo variante="sucesso">{T.corrigido}</Selo>}
          </li>
        ))}
        {e.maisItens > 0 && <li>{T.maisItens(e.maisItens)}</li>}
      </ul>
      {e.fotos.length > 0 && (
        <span className="est-item__selos">
          <span>{T.fotos(e.fotos.length)}:</span>
          {e.fotos.map((id, k) => (
            <a key={id} href={`/api/estoque/entradas/foto/${id}`} target="_blank" rel="noopener">
              {T.verFoto(k + 1)}
            </a>
          ))}
        </span>
      )}
      <div className="hor-secao__botoes">
        <Botao variante="secundario" aria-expanded={anexando} onClick={() => setAnexando(!anexando)}>
          {T.anexar}
        </Botao>
        {contexto.podeVerCusto && (
          <Botao variante="secundario" aria-expanded={corrigindo} onClick={() => setCorrigindo(!corrigindo)}>
            {T.corrigir}
          </Botao>
        )}
      </div>
      {anexando && <AnexarFoto movimentoId={e.movimentoId} aoAnexar={aoMudar} />}
      {corrigindo && <CorrigirCusto entrada={e} painel={painel} aoGravar={aoMudar} />}
    </li>
  );
}

function CorrigirCusto({ entrada: e, painel, aoGravar }: { entrada: EntradaDaLista; painel: ItemDoPainel[]; aoGravar: () => void }) {
  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries(e.itens.map((i) => [i.itemId, i.valorCentavos !== null ? reais(i.valorCentavos).replace("R$ ", "") : ""])),
  );
  const [chave, setChave] = useState(novaChave);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState("");

  async function gravar() {
    if (ocupado) return;
    setErro("");
    setFeito("");
    const itens: Record<string, unknown>[] = [];
    for (const i of e.itens) {
      const t = valores[i.itemId]?.trim() ?? "";
      if (!t) continue;
      const c = centavosDoTexto(t);
      if (c === null) return setErro(`${i.nome}: valor em reais, como 142,30.`);
      const p = painel.find((x) => x.itemId === i.itemId);
      if (!p) return setErro(`${i.nome}: item não encontrado no estoque. Abra a tela de novo.`);
      itens.push({ ...(p.ingredienteId !== null ? { ingredienteId: p.ingredienteId } : { preparoId: p.preparoId }), valorCentavos: c });
    }
    setOcupado(true);
    const r = await chamar<{ aplicadoCentavos: string; repetido: boolean }>("/api/estoque/entradas/custo", "POST", { chave, movimentoId: e.movimentoId, itens });
    setOcupado(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setChave(novaChave());
    setFeito(r.dados.repetido ? TE.form.repetido : T.custoGravado(reais(r.dados.aplicadoCentavos)));
    aoGravar();
  }

  return (
    <form
      className="est-form"
      data-testid={`corrigir-custo-${e.movimentoId}`}
      onSubmit={(ev) => {
        ev.preventDefault();
        void gravar();
      }}
    >
      {e.itens.map((i) => (
        <Campo
          key={i.itemId}
          rotulo={T.valorCerto(i.nome)}
          explicacao={T.valorCertoAjuda}
          exemplo={T.valorCertoExemplo}
          inputMode="decimal"
          maxLength={20}
          value={valores[i.itemId] ?? ""}
          onChange={(ev) => setValores((v) => ({ ...v, [i.itemId]: ev.target.value }))}
        />
      ))}
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {feito && <Aviso tipo="sucesso">{feito}</Aviso>}
      <div className="hor-secao__botoes">
        <Botao type="submit" disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? TE.form.gravando : T.gravarCusto}
        </Botao>
      </div>
    </form>
  );
}
