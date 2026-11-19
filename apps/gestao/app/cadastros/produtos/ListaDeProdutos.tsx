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
import type { Produto } from "@erp/dominio/produtos";
import type { TipoDeProducao } from "@erp/dominio/tipos-producao";
import { chamar } from "../../chamar";
import { AvisoComDesfazer, type AvisoRapido } from "../embalagens/AvisoComDesfazer";
import type { Categoria } from "../horarios/contas";
import { CartaoDoProduto } from "./CartaoDoProduto";
import { JanelaDoProduto } from "./JanelaDoProduto";
import { TP } from "./textos";

let numeroDoAviso = 0;

type Dados = { produtos: Produto[]; categorias: Categoria[]; tipos: TipoDeProducao[] };

export function ListaDeProdutos({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState<{ produto?: Produto } | null>(null);
  const [aviso, setAviso] = useState<AvisoRapido | null>(null);
  const [erroAcao, setErroAcao] = useState("");
  const avisar = useCallback((texto: string, extra: Partial<AvisoRapido> = {}) => setAviso({ id: ++numeroDoAviso, texto, ...extra }), []);

  const recarregar = useCallback(async (vivo: () => boolean = () => true) => {
    const [p, c, t] = await Promise.all([
      chamar<Produto[]>("/api/cadastros/produtos"),
      chamar<Categoria[]>("/api/cadastros/categorias"),
      chamar<TipoDeProducao[]>("/api/cadastros/tipos-producao"),
    ]);
    if (!vivo()) return;
    if (p.ok && p.dados && c.ok && c.dados && t.ok && t.dados) {
      setDados({ produtos: p.dados, categorias: c.dados, tipos: t.dados });
      setErro("");
    } else setErro([p, c, t].find((r) => !r.ok || !r.dados)!.mensagem);
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
  const ativos = produtos.filter((p) => p.ativo);
  const inativos = produtos.filter((p) => !p.ativo);
  const temCategoriaAtiva = categorias.some((c) => c.ativo);
  // As ativas, e as desativadas que ainda têm produto ativo (o produto continua nelas).
  const grupos = categorias.filter((c) => c.ativo || ativos.some((p) => p.categoriaId === c.id));

  async function mudarAtivo(p: Produto, ativo: boolean, desfazendo = false) {
    setErroAcao("");
    const r = await chamar<Produto>("/api/cadastros/produtos", "POST", { id: p.id, ativo });
    if (!r.ok) return setErroAcao(r.mensagem);
    await recarregar();
    if (desfazendo) return avisar(TP.avisos.desfeito(p.nome));
    if (ativo) return avisar(TP.avisos.reativado(p.nome));
    avisar(TP.avisos.desativado(p.nome), { desfazer: () => void mudarAtivo(p, true, true), focar: true });
  }

  const cartao = (p: Produto, posicao: number | null, nomeDaCategoria?: string) => (
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
        {podeGerenciar && temCategoriaAtiva && (
          <div className="hor-secao__botoes">
            <Link className="erp-botao erp-botao--secundario hor-secao__acao" href="/cadastros/importar?tipo=produtos">
              <Icone nome="documento" />
              {TP.pagina.importar}
            </Link>
            <Botao onClick={() => setJanela({})} className="hor-secao__acao">
              <Icone nome="mais" />
              {TP.pagina.novo}
            </Botao>
          </div>
        )}
      </header>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <div aria-live="polite">{erroAcao && <Aviso tipo="perigo">{erroAcao}</Aviso>}</div>
      {!dados && !erro && <p>{TP.pagina.carregando}</p>}
      {dados && !temCategoriaAtiva && (
        <Aviso tipo="atencao" data-testid="sem-categoria">
          {TP.pagina.semCategoria} <Link href="/cadastros/categorias">{TP.pagina.irParaCategorias}</Link>
        </Aviso>
      )}
      {dados && produtos.length === 0 && temCategoriaAtiva && <p className="hor-vazio">{TP.pagina.nenhum}</p>}
      {dados &&
        produtos.length > 0 &&
        grupos.map((c) => {
          const daCategoria = ativos.filter((p) => p.categoriaId === c.id);
          return (
            <section key={c.id} className="hor-secao" aria-labelledby={`prod-cat-${c.id}`} data-testid={`categoria-${c.nome}`}>
              <h2 id={`prod-cat-${c.id}`}>{c.nome}</h2>
              {!c.ativo && <p className="hor-secao__intro">{TP.pagina.categoriaDesativada}</p>}
              {daCategoria.length === 0 ? <p className="hor-vazio">{TP.pagina.nenhumNaCategoria}</p> : <ul className="hor-cats">{daCategoria.map((p, i) => cartao(p, i + 1))}</ul>}
            </section>
          );
        })}
      {inativos.length > 0 && (
        <section className="hor-secao hor-secao--discreta" aria-labelledby="prod-inativos" data-testid="produtos-desativados">
          <h2 id="prod-inativos">{TP.pagina.desativados}</h2>
          <p className="hor-secao__intro">{TP.pagina.desativadosExplicacao}</p>
          <ul className="hor-cats">{inativos.map((p) => cartao(p, null, categorias.find((c) => c.id === p.categoriaId)?.nome))}</ul>
        </section>
      )}
      {janela && dados && (
        <JanelaDoProduto
          produto={janela.produto}
          produtos={produtos}
          categorias={categorias}
          tipos={tipos}
          aoFechar={() => setJanela(null)}
          aoSalvo={(p, criado) => {
            setJanela(null);
            void recarregar();
            avisar(criado ? TP.avisos.criado(p.nome) : TP.avisos.salvo(p.nome));
          }}
        />
      )}
      <AvisoComDesfazer aviso={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}
