"use client";

/**
 * Aba "Embalagens" de Cadastros: o catálogo por tipo, em corredores recolhíveis, com busca
 * instantânea (realça o trecho), filtros em chips com contadores ao vivo, painel para criar e
 * editar, e desativar com "Desfazer". Nada se apaga.
 *
 * Atalhos (só fora de campos de texto e sem painel aberto): "/" foca a busca; "N" abre uma nova
 * embalagem (só quem gerencia). Esc fecha o painel (o próprio <dialog> cuida disso).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso, Botao, Cartao, Icone } from "@erp/interface";
import { BotaoExemplos, Campo } from "../../Campo";
import {
  agruparPorTipo,
  contarParaFiltros,
  FILTROS_VAZIOS,
  filtrarModelos,
  filtrosAtivos,
  nomeDoModeloParaMostrar,
  nomeDoRascunho,
  ordenarTipos,
  plural,
  rascunhoDaBusca,
  type Filtros,
  type ModeloDeEmbalagem,
} from "./contas";
import { AvisoComDesfazer, type AvisoRapido } from "./AvisoComDesfazer";
import { CartaoDoModelo, type UsoDoModelo } from "./CartaoDoModelo";
import { CorredorDoTipo } from "./CorredorDoTipo";
import { FiltrosDoCatalogo } from "./FiltrosDoCatalogo";
import { PainelDoModelo, type InicioDoPainel } from "./PainelDoModelo";
import { usarCatalogo, type CorpoDoModelo } from "./usarCatalogo";
import { T } from "./textos";

const ID_BUSCA = "emb-busca";
const DESATIVADAS = "__desativadas";

let numeroDoAviso = 0;

/** Tecla de atalho só vale fora de campo de texto, sem modificador e sem painel aberto. */
function atalhoLivre(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (document.querySelector("dialog[open]")) return false;
  const alvo = e.target as HTMLElement | null;
  if (!alvo) return true;
  return !(alvo.isContentEditable || alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement);
}

const corpoDe = (m: ModeloDeEmbalagem, ativo: boolean): CorpoDoModelo => ({
  id: m.id,
  tipo: m.tipo,
  tamanho: m.tamanho,
  unidade: m.unidade,
  fornecedorId: m.fornecedorId,
  ativo,
});

export function CatalogoDeEmbalagens({ podeGerenciar }: { podeGerenciar: boolean }) {
  const catalogo = usarCatalogo({ comIngredientes: true });
  const { modelos, ingredientes, unidades, carregado, erro, salvarModelo } = catalogo;
  const [termo, setTermo] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  /** Corredores fechados (por tipo). Todos começam abertos; as desativadas começam fechadas. */
  const [fechados, setFechados] = useState<Set<string>>(() => new Set([DESATIVADAS]));
  const [painel, setPainel] = useState<InicioDoPainel | null>(null);
  const [aviso, setAviso] = useState<AvisoRapido | null>(null);
  const [destaque, setDestaque] = useState<number | null>(null);
  const [erroAcao, setErroAcao] = useState("");

  const avisar = useCallback((texto: string, extra: Partial<AvisoRapido> = {}) => setAviso({ id: ++numeroDoAviso, texto, ...extra }), []);

  // Quais ingredientes usam cada modelo (mesma regra do "em uso" do servidor: conversão ativa).
  const usoPorModelo = useMemo(() => {
    const mapa = new Map<number, UsoDoModelo>();
    for (const i of ingredientes)
      for (const c of i.conversoes)
        if (c.ativo && c.modeloId) {
          const lista = mapa.get(c.modeloId) ?? [];
          if (!lista.some((x) => x.nome === i.nome)) lista.push({ nome: i.nome, ativo: i.ativo });
          mapa.set(c.modeloId, lista);
        }
    return mapa;
  }, [ingredientes]);

  const ativos = useMemo(() => modelos.filter((m) => m.ativo), [modelos]);
  const inativos = useMemo(() => modelos.filter((m) => !m.ativo), [modelos]);
  const achados = useMemo(() => filtrarModelos(ativos, filtros, termo, unidades), [ativos, filtros, termo, unidades]);
  const achadosInativos = useMemo(() => filtrarModelos(inativos, filtros, termo, unidades), [inativos, filtros, termo, unidades]);
  const grupos = useMemo(() => agruparPorTipo(achados, unidades), [achados, unidades]);
  const contagens = useMemo(() => contarParaFiltros(ativos, filtros, termo, unidades), [ativos, filtros, termo, unidades]);
  const tipos = useMemo(() => ordenarTipos(ativos.map((m) => m.tipo)), [ativos]);
  const fornecedoresDosModelos = useMemo(() => {
    const vistos = new Map<number, string>();
    for (const m of ativos) if (m.fornecedorId && m.fornecedor) vistos.set(m.fornecedorId, m.fornecedor);
    return [...vistos].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [ativos]);
  const sugestaoDeCriar = achados.length === 0 && termo.trim() ? rascunhoDaBusca(termo, unidades) : null;
  const procurando = !!termo.trim() || filtrosAtivos(filtros);

  // No celular os corredores começam fechados (a lista inteira ficaria longa demais); a busca abre todos.
  const [comecou, setComecou] = useState(false);
  useEffect(() => {
    if (comecou || !carregado) return;
    setComecou(true);
    if (window.matchMedia("(max-width: 40rem)").matches) setFechados(new Set([DESATIVADAS, ...ativos.map((m) => m.tipo)]));
  }, [comecou, carregado, ativos]);

  // Atalhos do teclado.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!atalhoLivre(e)) return;
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById(ID_BUSCA)?.focus();
      } else if ((e.key === "n" || e.key === "N") && podeGerenciar) {
        e.preventDefault();
        setPainel({ inicial: {} });
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [podeGerenciar]);

  // O cartão recém-criado ou salvo aparece na tela e brilha por um instante.
  useEffect(() => {
    if (destaque === null) return;
    const el = document.querySelector<HTMLElement>(`[data-modelo-id="${destaque}"]`);
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ block: "nearest", behavior: calmo ? "auto" : "smooth" });
    const t = window.setTimeout(() => setDestaque(null), 2500);
    return () => window.clearTimeout(t);
  }, [destaque]);

  const alternar = (chave: string) =>
    setFechados((f) => {
      const novo = new Set(f);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  async function mudarAtivo(m: ModeloDeEmbalagem, ativo: boolean, desfazendo = false) {
    setErroAcao("");
    const nome = nomeDoModeloParaMostrar(m);
    const r = await salvarModelo(corpoDe(m, ativo));
    if (!r.ok) {
      setErroAcao(r.mensagem);
      return;
    }
    if (desfazendo) return avisar(T.avisos.desfeito(nome));
    if (ativo) {
      avisar(T.avisos.reativada(nome));
      setDestaque(m.id);
      return;
    }
    // O cartão sumiu: o foco vai para o "Desfazer" (não se perde no fim da página).
    avisar(T.avisos.desativada(nome), { desfazer: () => void mudarAtivo(m, true, true), focar: true });
  }

  const cartao = (m: ModeloDeEmbalagem) => (
    <li key={m.id} data-modelo-id={m.id} className={destaque === m.id ? "emb-grade__item emb-grade__item--destaque" : "emb-grade__item"}>
      <CartaoDoModelo
        modelo={m}
        unidades={unidades}
        termo={termo}
        uso={usoPorModelo.get(m.id)}
        podeGerenciar={podeGerenciar}
        aoEditar={() => setPainel({ modelo: m })}
        aoDesativar={() => void mudarAtivo(m, false)}
        aoReativar={() => void mudarAtivo(m, true)}
      />
    </li>
  );

  const todosFechados = grupos.length > 0 && grupos.every((g) => fechados.has(g.tipo));

  return (
    <div className="emb-aba">
      <header className="emb-aba__cabeca">
        <div className="emb-aba__texto">
          <h1>{T.aba.titulo}</h1>
          <p className="emb-aba__intro">{T.aba.intro}</p>
        </div>
        {podeGerenciar && (
          <Botao onClick={() => setPainel({ inicial: {} })} aria-keyshortcuts="N" className="emb-aba__nova">
            <Icone nome="mais" />
            {T.aba.nova}
          </Botao>
        )}
      </header>
      <BotaoExemplos />
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <div aria-live="polite">{erroAcao && <Aviso tipo="perigo">{erroAcao}</Aviso>}</div>
      <Cartao>
        <div className="emb-busca">
          <Campo
            id={ID_BUSCA}
            rotulo={T.busca.rotulo}
            explicacao={T.busca.explicacao}
            exemplo={T.busca.exemplo}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && termo) {
                e.preventDefault();
                setTermo("");
              }
            }}
            type="search"
            autoComplete="off"
            aria-keyshortcuts="/"
          />
        </div>
        <FiltrosDoCatalogo tipos={tipos} fornecedores={fornecedoresDosModelos} filtros={filtros} contagens={contagens} aoMudar={setFiltros} />
        <div className="emb-aba__barra">
          <p className="emb-aba__contagem" aria-live="polite" data-testid="contagem-do-catalogo">
            {carregado ? T.aba.resultado(achados.length, ativos.length) : T.aba.carregando}
          </p>
          <div className="emb-aba__barra-botoes">
            {procurando && (
              <Botao
                variante="secundario"
                onClick={() => {
                  setTermo("");
                  setFiltros(FILTROS_VAZIOS);
                }}
              >
                {T.aba.limpar}
              </Botao>
            )}
            {grupos.length > 1 && (
              <Botao variante="secundario" onClick={() => setFechados(todosFechados ? new Set([...fechados].filter((f) => f === DESATIVADAS)) : new Set([...grupos.map((g) => g.tipo), ...(fechados.has(DESATIVADAS) ? [DESATIVADAS] : [])]))}>
                {todosFechados ? T.aba.abrirTodos : T.aba.fecharTodos}
              </Botao>
            )}
          </div>
        </div>
        <p className="emb-aba__atalhos">{podeGerenciar ? T.aba.atalhos : T.aba.atalhosSoBusca}</p>
      </Cartao>

      {carregado && achados.length === 0 && (
        <div className="emb-vazio" data-testid="catalogo-vazio">
          <Icone nome="busca" />
          <p>
            <strong>{T.aba.nadaAchado}</strong> {!podeGerenciar || !sugestaoDeCriar ? T.aba.vazioSemPermissao : null}
          </p>
          <div className="cadastros__botoes">
            {podeGerenciar && sugestaoDeCriar && (
              <Botao onClick={() => setPainel({ inicial: { ...sugestaoDeCriar, fornecedorId: typeof filtros.fornecedor === "number" ? filtros.fornecedor : null } })}>
                <Icone nome="mais" />
                {T.aba.criarDaBusca(nomeDoRascunho(sugestaoDeCriar))}
              </Botao>
            )}
            <Botao
              variante="secundario"
              onClick={() => {
                setTermo("");
                setFiltros(FILTROS_VAZIOS);
                document.getElementById(ID_BUSCA)?.focus();
              }}
            >
              {T.aba.limpar}
            </Botao>
          </div>
        </div>
      )}

      <div className="emb-corredores" data-testid="corredores">
        {grupos.map((g) => (
          <CorredorDoTipo key={g.tipo} titulo={plural(g.tipo)} quantidade={g.modelos.length} aberto={!fechados.has(g.tipo) || !!termo.trim()} aoAlternar={() => alternar(g.tipo)}>
            <ul className="emb-grade">{g.modelos.map(cartao)}</ul>
          </CorredorDoTipo>
        ))}
        {achadosInativos.length > 0 && (
          <CorredorDoTipo
            discreto
            titulo="Desativadas"
            quantidade={achadosInativos.length}
            aberto={!fechados.has(DESATIVADAS) || (achados.length === 0 && !!termo.trim())}
            aoAlternar={() => alternar(DESATIVADAS)}
          >
            <p className="emb-corredor__nota">{T.aba.desativadasExplicacao}</p>
            <ul className="emb-grade">{achadosInativos.map(cartao)}</ul>
          </CorredorDoTipo>
        )}
      </div>

      {painel && (
        <PainelDoModelo
          catalogo={catalogo}
          inicio={painel}
          aoFechar={() => setPainel(null)}
          aoSalvo={(m, criado) => {
            setPainel(null);
            const nome = nomeDoModeloParaMostrar(m);
            avisar(criado ? T.avisos.criada(nome) : m.ativo ? T.avisos.salva(nome) : T.avisos.desativada(nome));
            setFechados((f) => {
              const novo = new Set(f);
              novo.delete(m.ativo ? m.tipo : DESATIVADAS);
              return novo;
            });
            setDestaque(m.id);
          }}
        />
      )}
      <AvisoComDesfazer aviso={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}
