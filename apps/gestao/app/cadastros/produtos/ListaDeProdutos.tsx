"use client";

/**
 * Tela "Produtos": ativos primeiro, agrupados por categoria (na ordem do cardápio) e, dentro de
 * cada uma, na ordem escolhida; desativados no fim. "+ Novo produto", editar na janela e
 * desativar com "Desfazer". Nada se apaga. `podeGerenciar` (cadastros.gerenciar) vem da página;
 * o servidor confere tudo de novo.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import type { GrupoDeAdicionais, Produto } from "@erp/dominio/produtos";
import type { TipoDeProducao } from "@erp/dominio/tipos-producao";
import { chamar } from "../../chamar";
import {
  AvisoComDesfazer,
  type AvisoRapido,
} from "../embalagens/AvisoComDesfazer";
import type { Categoria } from "../horarios/contas";
import { CartaoDoProduto } from "./CartaoDoProduto";
import { JanelaDoProduto } from "./JanelaDoProduto";
import { TP } from "./textos";

let numeroDoAviso = 0;

type Dados = {
  produtos: Produto[];
  categorias: Categoria[];
  tipos: TipoDeProducao[];
  grupos: GrupoDeAdicionais[];
};

export function ListaDeProdutos({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState<{ produto?: Produto } | null>(null);
  const [aviso, setAviso] = useState<AvisoRapido | null>(null);
  const [erroAcao, setErroAcao] = useState("");
  // Barra de cima (visual Balcão): filtro por categoria e busca pelo nome. Só escondem; nada muda.
  const [filtro, setFiltro] = useState<number | "todas">("todas");
  const [busca, setBusca] = useState("");
  const avisar = useCallback(
    (texto: string, extra: Partial<AvisoRapido> = {}) =>
      setAviso({ id: ++numeroDoAviso, texto, ...extra }),
    [],
  );

  const recarregar = useCallback(async (vivo: () => boolean = () => true) => {
    const [p, c, t, g] = await Promise.all([
      chamar<Produto[]>("/api/cadastros/produtos"),
      chamar<Categoria[]>("/api/cadastros/categorias"),
      chamar<TipoDeProducao[]>("/api/cadastros/tipos-producao"),
      chamar<GrupoDeAdicionais[]>("/api/cadastros/adicionais"),
    ]);
    if (!vivo()) return;
    if (
      p.ok &&
      p.dados &&
      c.ok &&
      c.dados &&
      t.ok &&
      t.dados &&
      g.ok &&
      g.dados
    ) {
      setDados({
        produtos: p.dados,
        categorias: c.dados,
        tipos: t.dados,
        grupos: g.dados,
      });
      setErro("");
    } else setErro([p, c, t, g].find((r) => !r.ok || !r.dados)!.mensagem);
  }, []);

  useEffect(() => {
    let vivo = true;
    void recarregar(() => vivo);
    return () => {
      vivo = false;
    };
  }, [recarregar]);

  const produtos = dados?.produtos ?? [];
  const categorias = dados?.categorias ?? [];
  const tipos = dados?.tipos ?? [];
  const gruposDeAdicionais = dados?.grupos ?? [];
  const ativos = produtos.filter((p) => p.ativo);
  const inativos = produtos.filter((p) => !p.ativo);
  const temCategoriaAtiva = categorias.some((c) => c.ativo);
  // As ativas, e as desativadas que ainda têm produto ativo (o produto continua nelas).
  const grupos = categorias.filter(
    (c) => c.ativo || ativos.some((p) => p.categoriaId === c.id),
  );
  // Busca sem acento e sem maiúscula ("pao" acha "Pão").
  const semAcento = (s: string) =>
    s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
  const termo = semAcento(busca.trim());
  // Filtro de uma categoria que saiu da lista (ex.: desativada sem produto ativo) volta para "Todas".
  const filtroValido =
    filtro === "todas" || grupos.some((c) => c.id === filtro)
      ? filtro
      : "todas";
  const passa = (p: Produto) =>
    (filtroValido === "todas" || p.categoriaId === filtroValido) &&
    (!termo || semAcento(p.nome).includes(termo));
  const gruposVisiveis = grupos.filter(
    (c) =>
      (filtroValido === "todas" || c.id === filtroValido) &&
      (!termo || ativos.some((p) => p.categoriaId === c.id && passa(p))),
  );
  const inativosVisiveis = inativos.filter(passa);

  async function mudarAtivo(p: Produto, ativo: boolean, desfazendo = false) {
    setErroAcao("");
    const r = await chamar<Produto>("/api/cadastros/produtos", "POST", {
      id: p.id,
      ativo,
    });
    if (!r.ok) return setErroAcao(r.mensagem);
    await recarregar();
    if (desfazendo) return avisar(TP.avisos.desfeito(p.nome));
    if (ativo) return avisar(TP.avisos.reativado(p.nome));
    avisar(TP.avisos.desativado(p.nome), {
      desfazer: () => void mudarAtivo(p, true, true),
      focar: true,
    });
  }

  const cartao = (
    p: Produto,
    posicao: number | null,
    nomeDaCategoria?: string,
  ) => (
    <li key={p.id} className="hor-cats__item">
      <CartaoDoProduto
        produto={p}
        posicao={posicao}
        tipo={tipos.find((t) => t.id === p.tipoProducaoId)}
        nomeDaCategoria={nomeDaCategoria}
        podeGerenciar={podeGerenciar}
        aoEditar={() => setJanela({ produto: p })}
        aoMudarAtivo={(ativo) => void mudarAtivo(p, ativo)}
      />
    </li>
  );

  return (
    <div className="hor-tela">
      <header className="hor-tela__cabeca hor-tela__cabeca--com-botao">
        <div>
          <h1>{TP.pagina.titulo}</h1>
          <p className="hor-tela__intro">{TP.pagina.intro}</p>
        </div>
      </header>
      {dados && produtos.length > 0 && (
        <div className="balcao-barra">
          <div
            className="balcao-chips"
            role="group"
            aria-label={TP.pagina.filtro}
          >
            <button
              type="button"
              className="balcao-chip"
              aria-pressed={filtroValido === "todas"}
              onClick={() => setFiltro("todas")}
            >
              {TP.pagina.todas}{" "}
              <em aria-label={TP.pagina.quantos(produtos.length)}>
                {produtos.length}
              </em>
            </button>
            {grupos.map((c) => (
              <button
                key={c.id}
                type="button"
                className="balcao-chip"
                aria-pressed={filtroValido === c.id}
                onClick={() => setFiltro(c.id)}
              >
                {c.nome}
              </button>
            ))}
          </div>
          <div className="balcao-acoes">
            <label className="balcao-busca">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />
              </svg>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={TP.pagina.buscarExemplo}
                aria-label={TP.pagina.buscar}
              />
            </label>
            {podeGerenciar && temCategoriaAtiva && (
              <>
                <Link
                  className="erp-botao erp-botao--secundario hor-secao__acao"
                  href="/cadastros/importar?tipo=produtos"
                >
                  <Icone nome="documento" />
                  {TP.pagina.importar}
                </Link>
                <Botao
                  onClick={() => setJanela({})}
                  className="hor-secao__acao"
                >
                  <Icone nome="mais" />
                  {TP.pagina.novo}
                </Botao>
              </>
            )}
          </div>
        </div>
      )}
      {dados && produtos.length === 0 && podeGerenciar && temCategoriaAtiva && (
        <div className="balcao-acoes">
          <Link
            className="erp-botao erp-botao--secundario hor-secao__acao"
            href="/cadastros/importar?tipo=produtos"
          >
            <Icone nome="documento" />
            {TP.pagina.importar}
          </Link>
          <Botao onClick={() => setJanela({})} className="hor-secao__acao">
            <Icone nome="mais" />
            {TP.pagina.novo}
          </Botao>
        </div>
      )}
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <div aria-live="polite">
        {erroAcao && <Aviso tipo="perigo">{erroAcao}</Aviso>}
      </div>
      {!dados && !erro && <p>{TP.pagina.carregando}</p>}
      {dados && !temCategoriaAtiva && (
        <Aviso tipo="atencao" data-testid="sem-categoria">
          {TP.pagina.semCategoria}{" "}
          <Link href="/cadastros/categorias">{TP.pagina.irParaCategorias}</Link>
        </Aviso>
      )}
      {dados && produtos.length === 0 && temCategoriaAtiva && (
        <p className="hor-vazio">{TP.pagina.nenhum}</p>
      )}
      {dados &&
        produtos.length > 0 &&
        (gruposVisiveis.length > 0 || inativosVisiveis.length > 0) && (
          <div className="balcao-lista">
            <div className="balcao-lista__cab prod-cab" aria-hidden="true">
              <span>Produto</span>
              <span>Preço</span>
              {podeGerenciar && <span />}
            </div>
            {gruposVisiveis.map((c) => {
              const todosDaCategoria = ativos.filter(
                (p) => p.categoriaId === c.id,
              );
              // O lugar na categoria é o da lista inteira, mesmo com a busca escondendo alguns.
              const daCategoria = todosDaCategoria.filter(passa);
              return (
                <section
                  key={c.id}
                  className="hor-secao"
                  aria-labelledby={`prod-cat-${c.id}`}
                  data-testid={`categoria-${c.nome}`}
                >
                  <h2 id={`prod-cat-${c.id}`}>{c.nome}</h2>
                  {!c.ativo && (
                    <p className="hor-secao__intro">
                      {TP.pagina.categoriaDesativada}
                    </p>
                  )}
                  {daCategoria.length === 0 ? (
                    <p className="hor-vazio">{TP.pagina.nenhumNaCategoria}</p>
                  ) : (
                    <ul className="hor-cats">
                      {daCategoria.map((p) =>
                        cartao(p, todosDaCategoria.indexOf(p) + 1),
                      )}
                    </ul>
                  )}
                </section>
              );
            })}
            {inativosVisiveis.length > 0 && (
              <section
                className="hor-secao hor-secao--discreta"
                aria-labelledby="prod-inativos"
                data-testid="produtos-desativados"
              >
                <h2 id="prod-inativos">{TP.pagina.desativados}</h2>
                <p className="hor-secao__intro">
                  {TP.pagina.desativadosExplicacao}
                </p>
                <ul className="hor-cats">
                  {inativosVisiveis.map((p) =>
                    cartao(
                      p,
                      null,
                      categorias.find((c) => c.id === p.categoriaId)?.nome,
                    ),
                  )}
                </ul>
              </section>
            )}
          </div>
        )}
      {dados &&
        produtos.length > 0 &&
        gruposVisiveis.length === 0 &&
        inativosVisiveis.length === 0 && (
          <p className="hor-vazio" data-testid="nada-na-busca">
            {termo
              ? TP.pagina.nadaNaBusca(busca.trim())
              : TP.pagina.nadaNoFiltro}
          </p>
        )}
      {janela && dados && (
        <JanelaDoProduto
          produto={janela.produto}
          produtos={produtos}
          categorias={categorias}
          tipos={tipos}
          grupos={gruposDeAdicionais}
          podeGerenciar={podeGerenciar}
          aoFechar={() => setJanela(null)}
          aoMudouSemFechar={() => void recarregar()}
          aoSalvo={(p, criado) => {
            setJanela(null);
            // O produto salvo aparece mesmo se o filtro ou a busca o esconderiam.
            if (filtro !== "todas" && filtro !== p.categoriaId)
              setFiltro("todas");
            setBusca("");
            void recarregar();
            avisar(criado ? TP.avisos.criado(p.nome) : TP.avisos.salvo(p.nome));
          }}
        />
      )}
      <AvisoComDesfazer aviso={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}
