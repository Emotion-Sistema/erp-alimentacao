"use client";

/**
 * Tela "Tipos de produção": ativos primeiro, agrupados por área (Cozinha, Cafeteria) com a frase
 * de onde o pedido sai; desativados no fim. "+ Novo tipo", editar na janela e desativar com
 * "Desfazer". Nada se apaga. `podeGerenciar` (cadastros.gerenciar) vem da página; o servidor
 * confere tudo de novo.
 */
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import { AREAS_DE_PRODUCAO, NOME_DA_AREA_DE_PRODUCAO, SAIDA_DA_AREA_DE_PRODUCAO, type TipoDeProducao } from "@erp/dominio/tipos-producao";
import { chamar } from "../../chamar";
import { AvisoComDesfazer, type AvisoRapido } from "../embalagens/AvisoComDesfazer";
import { CartaoDoTipo } from "./CartaoDoTipo";
import { JanelaDoTipo } from "./JanelaDoTipo";
import { TT } from "./textos";

let numeroDoAviso = 0;

export function ListaDeTipos({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [tipos, setTipos] = useState<TipoDeProducao[] | null>(null);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState<{ tipo?: TipoDeProducao } | null>(null);
  const [aviso, setAviso] = useState<AvisoRapido | null>(null);
  const [erroAcao, setErroAcao] = useState("");
  const avisar = useCallback((texto: string, extra: Partial<AvisoRapido> = {}) => setAviso({ id: ++numeroDoAviso, texto, ...extra }), []);

  const recarregar = useCallback(async (vivo: () => boolean = () => true) => {
    const r = await chamar<TipoDeProducao[]>("/api/cadastros/tipos-producao");
    if (!vivo()) return;
    if (r.ok && r.dados) {
      setTipos(r.dados);
      setErro("");
    } else setErro(r.mensagem);
  }, []);

  useEffect(() => {
    let vivo = true;
    void recarregar(() => vivo);
    return () => {
      vivo = false;
    };
  }, [recarregar]);

  const lista = tipos ?? [];
  const ativos = lista.filter((t) => t.ativo);
  const inativos = lista.filter((t) => !t.ativo);
  const ordemSugerida = (Math.floor(Math.max(0, ...lista.map((t) => t.ordem)) / 10) + 1) * 10;

  async function mudarAtivo(t: TipoDeProducao, ativo: boolean, desfazendo = false) {
    setErroAcao("");
    const r = await chamar<TipoDeProducao>("/api/cadastros/tipos-producao", "POST", { id: t.id, ativo });
    if (!r.ok) return setErroAcao(r.mensagem);
    await recarregar();
    if (desfazendo) return avisar(TT.avisos.desfeito(t.nome));
    if (ativo) return avisar(TT.avisos.reativado(t.nome));
    avisar(TT.avisos.desativado(t.nome), { desfazer: () => void mudarAtivo(t, true, true), focar: true });
  }

  const cartao = (t: TipoDeProducao) => (
    <li key={t.id} className="hor-cats__item">
      <CartaoDoTipo tipo={t} podeGerenciar={podeGerenciar} aoEditar={() => setJanela({ tipo: t })} aoMudarAtivo={(ativo) => void mudarAtivo(t, ativo)} />
    </li>
  );

  return (
    <div className="hor-tela">
      <header className="hor-tela__cabeca hor-tela__cabeca--com-botao">
        <div>
          <h1>{TT.pagina.titulo}</h1>
          <p className="hor-tela__intro">{TT.pagina.intro}</p>
        </div>
        {podeGerenciar && (
          <Botao onClick={() => setJanela({})} className="hor-secao__acao">
            <Icone nome="mais" />
            {TT.pagina.novo}
          </Botao>
        )}
      </header>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <div aria-live="polite">{erroAcao && <Aviso tipo="perigo">{erroAcao}</Aviso>}</div>
      {!tipos && !erro && <p>{TT.pagina.carregando}</p>}
      {tipos && tipos.length === 0 && <p className="hor-vazio">{TT.pagina.nenhum}</p>}
      {tipos &&
        tipos.length > 0 &&
        AREAS_DE_PRODUCAO.map((a) => {
          const daArea = ativos.filter((t) => t.area === a);
          return (
            <section key={a} className="hor-secao" aria-labelledby={`tp-area-${a}`} data-testid={`area-${a}`}>
              <h2 id={`tp-area-${a}`}>{NOME_DA_AREA_DE_PRODUCAO[a]}</h2>
              <p className="hor-secao__intro">{TT.pagina.saida(SAIDA_DA_AREA_DE_PRODUCAO[a])}</p>
              {daArea.length === 0 ? <p className="hor-vazio">{TT.pagina.nenhumNaArea}</p> : <ul className="hor-cats">{daArea.map(cartao)}</ul>}
            </section>
          );
        })}
      {inativos.length > 0 && (
        <section className="hor-secao hor-secao--discreta" aria-labelledby="tp-inativos" data-testid="tipos-desativados">
          <h2 id="tp-inativos">{TT.pagina.desativados}</h2>
          <p className="hor-secao__intro">{TT.pagina.desativadosExplicacao}</p>
          <ul className="hor-cats">{inativos.map(cartao)}</ul>
        </section>
      )}
      {janela && (
        <JanelaDoTipo
          tipo={janela.tipo}
          ordemSugerida={ordemSugerida}
          aoFechar={() => setJanela(null)}
          aoSalvo={(t, criado) => {
            setJanela(null);
            void recarregar();
            avisar(criado ? TT.avisos.criado(t.nome) : TT.avisos.salvo(t.nome));
          }}
        />
      )}
      <AvisoComDesfazer aviso={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}
