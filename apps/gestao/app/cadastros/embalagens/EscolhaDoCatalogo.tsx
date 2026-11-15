"use client";

/**
 * Escolher do catálogo, dentro do ingrediente: sugestões em destaque (padrão do fornecedor do
 * item primeiro, depois as mais usadas, depois as da mesma família), busca, filtro por tipo e
 * seleção de VÁRIAS de uma vez. Cada escolhida mostra a conta ao vivo ("= 25 kg") ou pede a
 * quantidade ali mesmo. O botão "Adicionar N embalagens" entrega tudo de uma vez.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Botao, Icone, Selo } from "@erp/interface";
import { Campo, Grupo, OpcaoDoGrupo } from "../../Campo";
import { equivalenciaNaUnidade, type UnidadeBase, type UnidadePadrao } from "../auxiliares";
import {
  agruparPorTipo,
  casaComBusca,
  chaveDoNome,
  contaDoModelo,
  nomeDoModeloParaMostrar,
  ordenarTipos,
  perguntaDaQuantidade,
  plural,
  quantidadeDigitada,
  sugerirModelos,
  type ModeloDeEmbalagem,
  type MotivoDaSugestao,
} from "./contas";
import { Realce } from "./Realce";
import { T } from "./textos";

export type Escolhida = { modelo: ModeloDeEmbalagem; /** Quantidade na base: a da conta ou a digitada. */ quantidadeBase: string; calculada: boolean };
/** Situação de um nome que o item já tem: colocada (ativa) ou desativada. */
export type Ocupados = Map<string, "colocada" | "desativada">;

export function EscolhaDoCatalogo({
  modelos,
  unidades,
  base,
  exibicao,
  fornecedorId,
  ocupados,
  preSelecionar,
  podeCriar,
  aoCriarNova,
  aoAdicionar,
  aoFechar,
}: {
  modelos: ModeloDeEmbalagem[];
  unidades: UnidadePadrao[];
  base: UnidadeBase;
  exibicao?: string;
  fornecedorId: number | null;
  ocupados: Ocupados;
  /** Modelo recém-criado pelo painel: já entra marcado. */
  preSelecionar?: number | null;
  podeCriar?: boolean;
  aoCriarNova?: () => void;
  /** Devolve as que falharam (id e motivo); as outras saem da seleção. */
  aoAdicionar: (escolhidas: Escolhida[]) => Promise<{ id: number; motivo: string }[]>;
  aoFechar: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [tipo, setTipo] = useState<string | null>(null);
  /** id -> quantidade digitada (só usada quando a conta não sai sozinha). Map mantém a ordem de marcação. */
  const [marcadas, setMarcadas] = useState<Map<number, string>>(new Map());
  const [falhas, setFalhas] = useState<{ id: number; motivo: string }[]>([]);
  const [enviando, setEnviando] = useState(false);

  const ativos = useMemo(() => modelos.filter((m) => m.ativo), [modelos]);
  const sugestoes = useMemo(() => sugerirModelos(ativos, { fornecedorId, base, unidades }), [ativos, fornecedorId, base, unidades]);
  const motivoDe = useMemo(() => new Map<number, MotivoDaSugestao>(sugestoes.map((s) => [s.modelo.id, s.motivo])), [sugestoes]);
  const tipos = useMemo(() => ordenarTipos(ativos.map((m) => m.tipo)), [ativos]);
  const procurando = !!termo.trim() || tipo !== null;
  const ordenados = useMemo(() => agruparPorTipo(ativos, unidades).flatMap((g) => g.modelos), [ativos, unidades]);
  const achados = procurando ? ordenados.filter((m) => casaComBusca(m, termo) && (tipo === null || m.tipo === tipo)) : [];
  const resto = procurando ? [] : ordenados.filter((m) => !motivoDe.has(m.id));

  // A recém-criada entra marcada uma vez só (depois de adicionada, não volta).
  const preAplicado = useRef<number | null>(null);
  useEffect(() => {
    if (!preSelecionar || preAplicado.current === preSelecionar || !ativos.some((m) => m.id === preSelecionar)) return;
    preAplicado.current = preSelecionar;
    setMarcadas((atual) => (atual.has(preSelecionar) ? atual : new Map(atual).set(preSelecionar, "")));
  }, [preSelecionar, ativos]);

  const situacao = (m: ModeloDeEmbalagem) => ocupados.get(chaveDoNome(m.nome)) ?? null;
  const alternar = (m: ModeloDeEmbalagem) =>
    setMarcadas((atual) => {
      const nova = new Map(atual);
      if (nova.has(m.id)) nova.delete(m.id);
      else nova.set(m.id, "");
      return nova;
    });

  const escolhidas = [...marcadas].flatMap(([id, digitada]) => {
    const modelo = ativos.find((m) => m.id === id);
    // Some da escolha o que saiu do catálogo ou já está no item.
    if (!modelo || ocupados.has(chaveDoNome(modelo.nome))) return [];
    const conta = contaDoModelo(modelo, base, unidades);
    return [{ modelo, conta, digitada, quantidade: conta ?? quantidadeDigitada(digitada) }];
  });
  const faltando = escolhidas.find((e) => !e.quantidade);

  async function adicionar() {
    if (faltando || escolhidas.length === 0) return;
    setEnviando(true);
    const r = await aoAdicionar(escolhidas.map((e) => ({ modelo: e.modelo, quantidadeBase: e.quantidade!, calculada: e.conta !== null })));
    setEnviando(false);
    setFalhas(r);
    const falharam = new Set(r.map((f) => f.id));
    setMarcadas((atual) => new Map([...atual].filter(([id]) => falharam.has(id))));
  }

  const opcao = (m: ModeloDeEmbalagem) => {
    const nome = nomeDoModeloParaMostrar(m);
    const conta = contaDoModelo(m, base, unidades);
    const sit = situacao(m);
    const marcada = marcadas.has(m.id) && !sit;
    const motivo = motivoDe.get(m.id);
    return (
      <li key={m.id}>
        <OpcaoDoGrupo
          rotulo={sit ? `${nome} (${sit === "colocada" ? T.escolha.jaColocada : T.escolha.jaExisteDesativada})` : nome}
          checked={marcada}
          disabled={!!sit}
          onChange={() => alternar(m)}
          className={[
            "emb-opcao",
            marcada && "emb-opcao--marcada",
            sit && "emb-opcao--ja",
            motivo === "fornecedor" && "emb-opcao--fornecedor",
          ]
            .filter(Boolean)
            .join(" ")}
          conteudo={
            <>
              <span className="emb-opcao__nome">
                <Realce texto={nome} termo={termo} />
              </span>{" "}
              {sit ? (
                <span className="emb-opcao__conta">{sit === "colocada" ? T.escolha.jaColocada : T.escolha.jaExisteDesativada}</span>
              ) : conta ? (
                <span className="emb-opcao__conta">= {equivalenciaNaUnidade(conta, base, exibicao)}</span>
              ) : null}
              <span className="emb-opcao__selos">
                {motivo === "fornecedor" ? (
                  <Selo variante="info" icone="caminhao">
                    {T.escolha.motivo.fornecedor}
                  </Selo>
                ) : motivo === "mais-usada" ? (
                  <Selo variante="sucesso">{T.escolha.motivo["mais-usada"]}</Selo>
                ) : m.fornecedor ? (
                  <Selo variante="info" icone="caminhao">
                    {T.escolha.padraoDe(m.fornecedor)}
                  </Selo>
                ) : null}
                {!conta && !sit && (
                  <Selo variante="alerta" icone="alerta">
                    {T.escolha.pedeQuantidade}
                  </Selo>
                )}
              </span>
            </>
          }
        />
      </li>
    );
  };

  return (
    <section className="emb-escolha" aria-label={T.escolha.titulo}>
      <div className="emb-escolha__cabeca">
        <h4>
          <Icone nome="caixa" />
          {T.escolha.titulo}
        </h4>
        <span className="cadastros__botoes">
          {podeCriar && aoCriarNova && (
            <Botao variante="secundario" onClick={aoCriarNova}>
              <Icone nome="mais" />
              {T.ingrediente.criarNova}
            </Botao>
          )}
          <Botao variante="secundario" onClick={aoFechar}>
            {T.ingrediente.fecharEscolha}
          </Botao>
        </span>
      </div>
      <Campo
        rotulo={T.escolha.busca.rotulo}
        explicacao={T.escolha.busca.explicacao}
        exemplo={T.escolha.busca.exemplo}
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => {
          // Enter aqui não envia o formulário do ingrediente.
          if (e.key === "Enter") e.preventDefault();
          if (e.key === "Escape" && termo) {
            e.preventDefault();
            setTermo("");
          }
        }}
        type="search"
        autoComplete="off"
      />
      <div className="emb-escolha__tipos" role="group" aria-label={T.escolha.tipos}>
        <button type="button" className="emb-chip" aria-pressed={tipo === null} onClick={() => setTipo(null)}>
          <span>{T.filtros.todos}</span>
        </button>
        {tipos.map((t) => (
          <button key={t} type="button" className="emb-chip" aria-pressed={tipo === t} onClick={() => setTipo(tipo === t ? null : t)}>
            <span>{plural(t)}</span>
          </button>
        ))}
      </div>
      <Grupo legenda={T.escolha.grupo.legenda} explicacao={T.escolha.grupo.explicacao} exemplo={T.escolha.grupo.exemplo} className="emb-escolha__grupo" ajudaNoTopo>
        {procurando ? (
          <div className="emb-escolha__secao">
            <p className="emb-escolha__secao-titulo" aria-live="polite">
              {T.escolha.resultado(achados.length)}
            </p>
            {achados.length === 0 ? <p className="erp-vazio">{T.escolha.nenhuma}</p> : <ul className="emb-opcoes">{achados.map(opcao)}</ul>}
          </div>
        ) : (
          <>
            {sugestoes.length > 0 && (
              <div className="emb-escolha__secao">
                <p className="emb-escolha__secao-titulo">{T.escolha.sugestoes}</p>
                <ul className="emb-opcoes" aria-label={T.escolha.sugestoes} data-testid="sugestoes-de-embalagem">
                  {sugestoes.map((s) => opcao(s.modelo))}
                </ul>
              </div>
            )}
            {resto.length > 0 && (
              <div className="emb-escolha__secao">
                <p className="emb-escolha__secao-titulo">{T.escolha.todas}</p>
                <ul className="emb-opcoes">{resto.map(opcao)}</ul>
              </div>
            )}
          </>
        )}
      </Grupo>
      {escolhidas.length > 0 && (
        <div className="emb-escolhidas" data-testid="escolhidas">
          <h5>{T.escolha.escolhidas(escolhidas.length)}</h5>
          <ul>
            {escolhidas.map((e) => {
              const nome = nomeDoModeloParaMostrar(e.modelo);
              const falha = falhas.find((f) => f.id === e.modelo.id);
              return (
                <li key={e.modelo.id} className={["emb-escolhida", !e.conta && "emb-escolhida--pede"].filter(Boolean).join(" ")}>
                  <span className="emb-escolhida__nome">{nome}</span>{" "}
                  {e.quantidade && <span className="emb-escolhida__conta">= {equivalenciaNaUnidade(e.quantidade, base, exibicao)}</span>}
                  <Botao
                    variante="secundario"
                    className="emb-escolhida__tirar"
                    aria-label={T.escolha.tirarDaEscolha(nome)}
                    onClick={() => alternar(e.modelo)}
                  >
                    Desmarcar
                  </Botao>
                  {!e.conta && (
                    <Campo
                      rotulo={perguntaDaQuantidade(base, e.modelo.nome)}
                      explicacao={T.ingrediente.quantidade.explicacao(base)}
                      exemplo={T.ingrediente.quantidade.exemplo(base)}
                      value={e.digitada}
                      onChange={(ev) => setMarcadas((atual) => new Map(atual).set(e.modelo.id, ev.target.value))}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") {
                          ev.preventDefault();
                          void adicionar();
                        }
                      }}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  )}
                  {falha && (
                    <p className="embalagem__bloqueio" role="alert">
                      <Icone nome="alerta" />
                      <span>{falha.motivo}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="emb-escolha__rodape">
        <p className="emb-escolha__falta" aria-live="polite" data-testid="falta-na-escolha">
          {escolhidas.length === 0 ? T.escolha.nadaMarcado : faltando ? T.escolha.falta(perguntaDaQuantidade(base, faltando.modelo.nome)) : ""}
        </p>
        {escolhidas.length > 1 && (
          <Botao variante="secundario" onClick={() => setMarcadas(new Map())}>
            {T.escolha.limparEscolha}
          </Botao>
        )}
        <Botao disabled={enviando || escolhidas.length === 0 || !!faltando} onClick={() => void adicionar()}>
          <Icone nome="mais" />
          {enviando ? T.escolha.adicionando : T.escolha.adicionar(Math.max(escolhidas.length, 1))}
        </Botao>
      </div>
    </section>
  );
}
