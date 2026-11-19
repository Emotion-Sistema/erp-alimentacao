"use client";

/**
 * Tela "Adicionais": grupos em uso primeiro (por nome), os desativados num bloco "Fora de uso".
 * "Novo grupo" e "Editar" abrem a janela; desativar tem "Desfazer". Nada se apaga.
 * Em quantos produtos cada grupo é usado vem da lista de produtos (só os ativos contam).
 * `podeGerenciar` (cadastros.gerenciar) vem da página; o servidor confere tudo de novo.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import type { GrupoDeAdicionais, Produto } from "@erp/dominio/produtos";
import { chamar } from "../../chamar";
import { AvisoComDesfazer, type AvisoRapido } from "../embalagens/AvisoComDesfazer";
import { CartaoDoGrupo } from "./CartaoDoGrupo";
import { JanelaDoGrupo } from "./JanelaDoGrupo";
import { TA } from "./textos";

let numeroDoAviso = 0;

type Dados = { grupos: GrupoDeAdicionais[]; produtos: Produto[] };

export function ListaDeGrupos({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState<{ grupo?: GrupoDeAdicionais } | null>(null);
  const [aviso, setAviso] = useState<AvisoRapido | null>(null);
  const [erroAcao, setErroAcao] = useState("");
  const avisar = useCallback((texto: string, extra: Partial<AvisoRapido> = {}) => setAviso({ id: ++numeroDoAviso, texto, ...extra }), []);

  const recarregar = useCallback(async (vivo: () => boolean = () => true) => {
    const [g, p] = await Promise.all([chamar<GrupoDeAdicionais[]>("/api/cadastros/adicionais"), chamar<Produto[]>("/api/cadastros/produtos")]);
    if (!vivo()) return;
    if (g.ok && g.dados && p.ok && p.dados) {
      setDados({ grupos: g.dados, produtos: p.dados });
      setErro("");
    } else setErro([g, p].find((r) => !r.ok || !r.dados)!.mensagem);
  }, []);

  useEffect(() => {
    let vivo = true;
    void recarregar(() => vivo);
    return () => {
      vivo = false;
    };
  }, [recarregar]);

  const grupos = dados?.grupos ?? [];
  const ativos = grupos.filter((g) => g.ativo);
  const inativos = grupos.filter((g) => !g.ativo);
  const usadoEm = (id: number) => (dados?.produtos ?? []).filter((p) => p.ativo && p.gruposAdicionais.includes(id)).length;

  async function mudarAtivo(g: GrupoDeAdicionais, ativo: boolean, desfazendo = false) {
    setErroAcao("");
    const r = await chamar<GrupoDeAdicionais>("/api/cadastros/adicionais", "POST", { id: g.id, ativo });
    if (!r.ok) return setErroAcao(r.mensagem);
    await recarregar();
    if (desfazendo) return avisar(TA.avisos.desfeito(g.nome));
    if (ativo) return avisar(TA.avisos.reativado(g.nome));
    avisar(TA.avisos.desativado(g.nome), { desfazer: () => void mudarAtivo(g, true, true), focar: true });
  }

  const cartao = (g: GrupoDeAdicionais) => (
    <li key={g.id} className="hor-cats__item">
      <CartaoDoGrupo grupo={g} usadoEm={usadoEm(g.id)} podeGerenciar={podeGerenciar} aoEditar={() => setJanela({ grupo: g })} aoMudarAtivo={(ativo) => void mudarAtivo(g, ativo)} />
    </li>
  );

  return (
    <div className="hor-tela">
      <header className="hor-tela__cabeca hor-tela__cabeca--com-botao">
        <div>
          <h1>{TA.pagina.titulo}</h1>
          <p className="hor-tela__intro">
            {TA.pagina.intro} <Link href="/cadastros/produtos">{TA.pagina.irParaProdutos}</Link>
          </p>
        </div>
        {podeGerenciar && (
          <div className="hor-secao__botoes">
            <Botao onClick={() => setJanela({})} className="hor-secao__acao">
              <Icone nome="mais" />
              {TA.pagina.novo}
            </Botao>
          </div>
        )}
      </header>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <div aria-live="polite">{erroAcao && <Aviso tipo="perigo">{erroAcao}</Aviso>}</div>
      {!dados && !erro && <p>{TA.pagina.carregando}</p>}
      {dados && grupos.length === 0 && <p className="hor-vazio">{TA.pagina.nenhum}</p>}
      {ativos.length > 0 && (
        <section className="hor-secao" aria-labelledby="adic-ativos" data-testid="grupos-ativos">
          <h2 id="adic-ativos">{TA.pagina.ativos}</h2>
          <ul className="hor-cats">{ativos.map(cartao)}</ul>
        </section>
      )}
      {inativos.length > 0 && (
        <section className="hor-secao hor-secao--discreta" aria-labelledby="adic-inativos" data-testid="grupos-fora-de-uso">
          <h2 id="adic-inativos">{TA.pagina.foraDeUso}</h2>
          <p className="hor-secao__intro">{TA.pagina.foraDeUsoExplicacao}</p>
          <ul className="hor-cats">{inativos.map(cartao)}</ul>
        </section>
      )}
      {janela && (
        <JanelaDoGrupo
          grupo={janela.grupo}
          aoFechar={() => setJanela(null)}
          aoSalvo={(g, criado) => {
            setJanela(null);
            void recarregar();
            avisar(criado ? TA.avisos.criado(g.nome) : TA.avisos.salvo(g.nome));
          }}
        />
      )}
      <AvisoComDesfazer aviso={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}
