"use client";

/**
 * Tela "Fichas técnicas": lê tudo de GET /api/fichas (`cadastros.ver`). Abas:
 * - Fichas: busca, filtro por tipo e por situação; ativas primeiro (por nome) e, num bloco no fim,
 *   as desativadas e as "fora do cardápio" (esmaecidas).
 * - No cardápio sem ficha: produtos à venda sem ficha, com "Criar ficha" (quem gerencia).
 * - Nomes parecidos: pares de ingredientes que podem ser o mesmo.
 * - Alergênicos: o catálogo (adicionar, editar, desativar e reativar só quem gerencia).
 * - Custos (só quem vê custo): limite do alerta e custo de referência dos ingredientes.
 * `podeGerenciar` e `podeVerCusto` vêm do servidor no painel; o servidor confere tudo de novo.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Aviso, Botao, Icone, Selo } from "@erp/interface";
import type { PainelDeFichas, ResumoDaFicha } from "@erp/dominio";
import { NOME_DO_TIPO_DE_FICHA, TIPOS_DE_FICHA, type TipoDeFicha } from "@erp/dominio/fichas";
import { nomeComparavel } from "@erp/dominio/produtos";
import { chamar } from "../../chamar";
import { BotaoExemplos } from "../../Campo";
import { AvisoComDesfazer, type AvisoRapido } from "../embalagens/AvisoComDesfazer";
import { CartaoDaFicha } from "./CartaoDaFicha";
import { CatalogoDeAlergenicos } from "./CatalogoDeAlergenicos";
import { CustosDeReferencia } from "./CustosDeReferencia";
import { ImportarFichas } from "./ImportarFichas";
import { EditorDaFicha, type AlvoInicial } from "./EditorDaFicha";
import { TF } from "./textos";

let numeroDoAviso = 0;

type Aba = "fichas" | "sem-ficha" | "parecidos" | "alergenicos" | "custos";
type Situacao = "todas" | "completas" | "incompletas" | "inativas" | "alergenicos";

const esmaecida = (f: ResumoDaFicha) => !f.ativo || f.foraDoCardapio;

export function PainelDasFichas() {
  const base = useId();
  const router = useRouter();
  const [painel, setPainel] = useState<PainelDeFichas | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<Aba>("fichas");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"todos" | TipoDeFicha>("todos");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [editor, setEditor] = useState<{ alvo?: AlvoInicial } | null>(null);
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<AvisoRapido | null>(null);
  const avisar = useCallback((texto: string) => setAviso({ id: ++numeroDoAviso, texto }), []);

  const recarregar = useCallback(async (vivo: () => boolean = () => true) => {
    const r = await chamar<PainelDeFichas>("/api/fichas");
    if (!vivo()) return;
    if (r.ok && r.dados) {
      setPainel(r.dados);
      setErro("");
    } else setErro(r.mensagem);
  }, []);

  useEffect(() => {
    let vivo = true;
    void recarregar(() => vivo);
    // "?aba=custos" (link da ficha aberta para pôr os preços que faltam).
    try {
      const pedida = new URLSearchParams(window.location.search).get("aba");
      if (pedida === "custos" || pedida === "sem-ficha" || pedida === "parecidos" || pedida === "alergenicos") setAba(pedida);
      if (new URLSearchParams(window.location.search).get("situacao") === "alergenicos") setSituacao("alergenicos");
    } catch {
      /* sem endereço: fica na primeira aba */
    }
    return () => {
      vivo = false;
    };
  }, [recarregar]);

  const abas: Aba[] = painel ? ["fichas", "sem-ficha", "parecidos", "alergenicos", ...(painel.podeVerCusto ? (["custos"] as const) : [])] : [];
  const abaVisivel: Aba = abas.includes(aba) ? aba : "fichas";
  const nomeDaAba = (a: Aba) =>
    a === "fichas"
      ? TF.pagina.aba.fichas(painel?.fichas.length ?? 0)
      : a === "sem-ficha"
        ? TF.pagina.aba.semFicha(painel?.semFicha.length ?? 0)
        : a === "parecidos"
          ? TF.pagina.aba.parecidos(painel?.nomesParecidos.length ?? 0)
          : a === "alergenicos"
            ? TF.pagina.aba.alergenicos(painel?.alergenicos.filter((x) => x.ativo).length ?? 0)
            : TF.pagina.aba.custos;

  const termo = nomeComparavel(busca);
  const filtradas = (painel?.fichas ?? []).filter(
    (f) =>
      (!termo || nomeComparavel(f.nome).includes(termo)) &&
      (tipo === "todos" || f.tipo === tipo) &&
      (situacao === "todas" ||
        (situacao === "completas" && f.completa && !esmaecida(f)) ||
        (situacao === "incompletas" && !f.completa && !esmaecida(f)) ||
        (situacao === "inativas" && esmaecida(f)) ||
        (situacao === "alergenicos" && f.alergenicos.situacao === "em_conferencia" && !esmaecida(f))),
  );
  const emUso = filtradas.filter((f) => !esmaecida(f));
  const noFim = filtradas.filter(esmaecida);
  const cartao = (f: ResumoDaFicha) => (
    <li key={f.id} className="hor-cats__item">
      <CartaoDaFicha resumo={f} limiteCustoPb={painel!.limiteCustoPb} />
    </li>
  );

  return (
    <div className="hor-tela fichas">
      <header className="hor-tela__cabeca hor-tela__cabeca--com-botao">
        <div>
          <h1>{TF.pagina.titulo}</h1>
          <p className="hor-tela__intro">{TF.pagina.intro}</p>
        </div>
        {painel?.podeGerenciar && (
          <div className="hor-secao__botoes">
            <Botao variante="secundario" onClick={() => setImportando(true)} className="hor-secao__acao">
              <Icone nome="documento" />
              {TF.importar.botao}
            </Botao>
            <Botao onClick={() => setEditor({})} className="hor-secao__acao">
              <Icone nome="mais" />
              {TF.pagina.nova}
            </Botao>
          </div>
        )}
      </header>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!painel && !erro && <p aria-live="polite">{TF.pagina.carregando}</p>}
      {painel && (
        <>
          {!painel.podeGerenciar && (
            <Aviso tipo="info" data-testid="so-ler">
              {TF.pagina.soLer}
            </Aviso>
          )}
          <div className="hor-abas">
            <div role="tablist" aria-label={TF.pagina.abas} className="hor-abas__lista fichas__abas">
              {abas.map((a, i) => (
                <button
                  key={a}
                  type="button"
                  role="tab"
                  id={`${base}-aba-${a}`}
                  aria-selected={abaVisivel === a}
                  aria-controls={`${base}-painel`}
                  tabIndex={abaVisivel === a ? 0 : -1}
                  className="hor-abas__aba"
                  onClick={() => setAba(a)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    const outra = abas[(i + (e.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length]!;
                    setAba(outra);
                    document.getElementById(`${base}-aba-${outra}`)?.focus();
                  }}
                >
                  {nomeDaAba(a)}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`${base}-painel`} aria-labelledby={`${base}-aba-${abaVisivel}`} className="hor-abas__painel">
              {abaVisivel === "fichas" && (
                <>
                  <BotaoExemplos />
                  <div className="balcao-barra">
                    <div className="balcao-chips" role="group" aria-label={TF.filtros.tipo}>
                      {[{ valor: "todos" as const, texto: TF.filtros.todos }, ...TIPOS_DE_FICHA.map((t) => ({ valor: t, texto: NOME_DO_TIPO_DE_FICHA[t] }))].map((o) => (
                        <button key={o.valor} type="button" className="balcao-chip" aria-pressed={tipo === o.valor} onClick={() => setTipo(o.valor)}>
                          {o.texto}
                        </button>
                      ))}
                    </div>
                    <div className="balcao-acoes">
                      <label className="balcao-busca">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />
                        </svg>
                        <input type="search" value={busca} maxLength={60} autoComplete="off" onChange={(e) => setBusca(e.target.value)} placeholder={`${TF.filtros.busca} (ex.: bacon)`} aria-label={TF.filtros.busca} />
                      </label>
                    </div>
                  </div>
                  <div className="balcao-chips fichas__situacao" role="group" aria-label={TF.filtros.situacao}>
                    {(
                      [
                        ["todas", TF.filtros.todas],
                        ["completas", TF.filtros.completas],
                        ["incompletas", TF.filtros.incompletas],
                        ["alergenicos", TF.filtros.alergenicosEmConferencia],
                        ["inativas", TF.filtros.inativas],
                      ] as const
                    ).map(([valor, texto]) => (
                      <button key={valor} type="button" className="balcao-chip" aria-pressed={situacao === valor} onClick={() => setSituacao(valor)}>
                        {texto}
                      </button>
                    ))}
                  </div>
                  {painel.fichas.length === 0 ? (
                    <p className="hor-vazio">{TF.filtros.nenhumaCadastrada}</p>
                  ) : filtradas.length === 0 ? (
                    <p className="hor-vazio">{TF.filtros.nenhuma}</p>
                  ) : null}
                  {filtradas.length > 0 && (
                    <div className="balcao-lista">
                      {emUso.length > 0 && (
                        <ul className="hor-cats" data-testid="fichas-em-uso">
                          {emUso.map(cartao)}
                        </ul>
                      )}
                      {noFim.length > 0 && (
                        <section className="hor-secao hor-secao--discreta" aria-labelledby={`${base}-fim`} data-testid="fichas-no-fim">
                          <h2 id={`${base}-fim`}>{TF.filtros.noFim}</h2>
                          <p className="hor-secao__intro">{TF.filtros.noFimExplicacao}</p>
                          <ul className="hor-cats">{noFim.map(cartao)}</ul>
                        </section>
                      )}
                    </div>
                  )}
                </>
              )}
              {abaVisivel === "sem-ficha" && (
                <>
                  <p className="hor-secao__intro">{TF.semFicha.intro}</p>
                  {painel.semFicha.length === 0 ? (
                    <p className="hor-vazio">{TF.semFicha.nenhum}</p>
                  ) : (
                    <ul className="fichas-lista" data-testid="sem-ficha">
                      {painel.semFicha.map((p) => (
                        <li key={p.id} className="fichas-lista__item">
                          <span className="fichas-lista__nome">{p.nome}</span>
                          <Selo>{p.categoria}</Selo>
                          {painel.podeGerenciar && (
                            <Botao variante="secundario" aria-label={TF.semFicha.criarDe(p.nome)} onClick={() => setEditor({ alvo: { tipo: "produto", produtoId: p.id } })}>
                              {TF.semFicha.criar}
                            </Botao>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {abaVisivel === "parecidos" && (
                <>
                  <p className="hor-secao__intro">
                    {TF.parecidos.intro} <Link href="/cadastros">{TF.parecidos.irParaIngredientes}</Link>
                  </p>
                  {painel.nomesParecidos.length === 0 ? (
                    <p className="hor-vazio">{TF.parecidos.nenhum}</p>
                  ) : (
                    <ul className="fichas-lista" data-testid="nomes-parecidos">
                      {painel.nomesParecidos.map((p) => (
                        <li key={`${p.a.id}-${p.b.id}`} className="fichas-lista__item">
                          <span className="fichas-lista__nome">{TF.parecidos.par(p.a.nome, p.b.nome)}</span>
                          <Selo variante="alerta" icone="alerta">
                            {TF.parecidos.aviso}
                          </Selo>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {abaVisivel === "alergenicos" && (
                <>
                  <BotaoExemplos />
                  <CatalogoDeAlergenicos
                    catalogo={painel.alergenicos}
                    podeGerenciar={painel.podeGerenciar}
                    aoMudar={(t) => {
                      void recarregar();
                      avisar(t);
                    }}
                  />
                </>
              )}
              {abaVisivel === "custos" && (
                <>
                  <BotaoExemplos />
                  <CustosDeReferencia
                    painel={painel}
                    podeGerenciar={painel.podeGerenciar}
                    aoMudar={(t) => {
                      void recarregar();
                      avisar(t);
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}
      {editor && painel && (
        <EditorDaFicha
          painel={painel}
          alvoInicial={editor.alvo}
          aoFechar={() => setEditor(null)}
          aoSalvo={(f) => {
            setEditor(null);
            router.push(`/cadastros/fichas/${f.resumo.id}`);
          }}
        />
      )}
      {importando && (
        <ImportarFichas
          aoFechar={() => setImportando(false)}
          aoGravado={(r) => {
            setImportando(false);
            void recarregar();
            avisar(TF.importar.gravado(r.fichas.filter((f) => f.acao === "criar" || f.acao === "nova_versao").length));
          }}
        />
      )}
      <AvisoComDesfazer aviso={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}
