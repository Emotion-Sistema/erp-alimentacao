"use client";

/**
 * Tela "Categorias": cartões em ordem (ativas primeiro), "+ Nova categoria", editar na janela e
 * desativar com "Desfazer". Nada se apaga. `podeGerenciar` (cadastros.gerenciar) vem da página;
 * o horário de cada categoria usa `podeMudar` de /api/horarios. O servidor confere tudo de novo.
 */
import { useCallback, useState } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import { chamar } from "../../chamar";
import { AvisoComDesfazer, type AvisoRapido } from "../embalagens/AvisoComDesfazer";
import type { Categoria } from "../horarios/contas";
import { usarHorarios } from "../horarios/usarHorarios";
import { CartaoDaCategoria } from "./CartaoDaCategoria";
import { JanelaDaCategoria } from "./JanelaDaCategoria";
import { TC } from "./textos";

let numeroDoAviso = 0;

export function ListaDeCategorias({ podeGerenciar }: { podeGerenciar: boolean }) {
  const { horarios, categorias, erro, gravar, recarregar } = usarHorarios();
  const [janela, setJanela] = useState<{ categoria?: Categoria } | null>(null);
  const [aviso, setAviso] = useState<AvisoRapido | null>(null);
  const [erroAcao, setErroAcao] = useState("");
  const avisar = useCallback((texto: string, extra: Partial<AvisoRapido> = {}) => setAviso({ id: ++numeroDoAviso, texto, ...extra }), []);

  const ativas = categorias.filter((c) => c.ativo);
  const inativas = categorias.filter((c) => !c.ativo);
  const ordemSugerida = (Math.floor(Math.max(0, ...categorias.map((c) => c.ordem)) / 10) + 1) * 10;

  async function mudarAtivo(c: Categoria, ativo: boolean, desfazendo = false) {
    setErroAcao("");
    const r = await chamar<Categoria>("/api/cadastros/categorias", "POST", { id: c.id, nome: c.nome, ativo });
    if (!r.ok) return setErroAcao(r.mensagem);
    await recarregar();
    if (desfazendo) return avisar(TC.avisos.desfeito(c.nome));
    if (ativo) return avisar(TC.avisos.reativada(c.nome));
    avisar(TC.avisos.desativada(c.nome), { desfazer: () => void mudarAtivo(c, true, true), focar: true });
  }

  const cartao = (c: Categoria) => (
    <li key={c.id} className="hor-cats__item">
      <CartaoDaCategoria
        categoria={c}
        horarios={horarios}
        podeGerenciar={podeGerenciar}
        gravar={gravar}
        avisar={(t) => avisar(t)}
        aoEditar={() => setJanela({ categoria: c })}
        aoMudarAtivo={(ativo) => void mudarAtivo(c, ativo)}
      />
    </li>
  );

  const carregado = categorias.length > 0 || !!horarios || !!erro;

  return (
    <div className="hor-tela">
      <header className="hor-tela__cabeca hor-tela__cabeca--com-botao">
        <div>
          <h1>{TC.pagina.titulo}</h1>
          <p className="hor-tela__intro">{TC.pagina.intro}</p>
        </div>
        {podeGerenciar && (
          <Botao onClick={() => setJanela({})} className="hor-secao__acao">
            <Icone nome="mais" />
            {TC.pagina.nova}
          </Botao>
        )}
      </header>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <div aria-live="polite">{erroAcao && <Aviso tipo="perigo">{erroAcao}</Aviso>}</div>
      {!carregado && <p>{TC.pagina.carregando}</p>}
      {carregado && categorias.length === 0 && <p className="hor-vazio">{TC.pagina.nenhuma}</p>}
      <ul className="hor-cats" data-testid="lista-categorias">
        {ativas.map(cartao)}
      </ul>
      {inativas.length > 0 && (
        <section className="hor-secao hor-secao--discreta" aria-labelledby="hor-cats-inativas">
          <h2 id="hor-cats-inativas">{TC.pagina.desativadas}</h2>
          <p className="hor-secao__intro">{TC.pagina.desativadasExplicacao}</p>
          <ul className="hor-cats">{inativas.map(cartao)}</ul>
        </section>
      )}
      {janela && (
        <JanelaDaCategoria
          categoria={janela.categoria}
          ordemSugerida={ordemSugerida}
          aoFechar={() => setJanela(null)}
          aoSalvo={(c, criada) => {
            setJanela(null);
            void recarregar();
            avisar(criada ? TC.avisos.criada(c.nome) : TC.avisos.salva(c.nome));
          }}
        />
      )}
      <AvisoComDesfazer aviso={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}
