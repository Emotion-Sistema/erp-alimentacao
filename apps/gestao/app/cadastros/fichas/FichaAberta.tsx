"use client";

/**
 * Uma ficha aberta (/cadastros/fichas/[id]). Lê GET /api/fichas/[id] e o painel GET /api/fichas
 * (unidades dos ingredientes, limite do alerta e o que o editor precisa). Mostra cabeçalho, o que
 * falta (pendências automáticas e anotadas), itens com quantidade, medida caseira, opcional e, só
 * para quem vê custo (o servidor manda nulo para os outros), o custo de cada item; rendimento,
 * porção, tempo, validade, modo de preparo, equipamentos, observações, consumo por porção,
 * "usado em" (preparos) e o histórico; os alergênicos herdados (S1), com os ingredientes a conferir. Quem gerencia edita (versão nova), desativa e reativa.
 * "Versão para a cozinha" abre a receita limpa e imprimível.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Dado, FichaDeDados, Icone, Selo } from "@erp/interface";
import type { FichaCompleta, PainelDeFichas } from "@erp/dominio";
import { NOME_DO_TIPO_DE_FICHA } from "@erp/dominio/fichas";
import type { Produto } from "@erp/dominio/produtos";
import { chamar } from "../../chamar";
import { AvisoComDesfazer, type AvisoRapido } from "../embalagens/AvisoComDesfazer";
import { BlocoDaEtiqueta } from "../CodigoDaEtiqueta";
import { BlocoDeAlergenicos } from "./AlergenicosDaFicha";
import { PercentualDoPreco, SeloDaSituacao } from "./CartaoDaFicha";
import { quando, quantidadeAmigavel, quantidadeLegivel, textoDoCusto } from "./contas";
import { EditorDaFicha } from "./EditorDaFicha";
import { HistoricoDaFicha } from "./HistoricoDaFicha";
import { TF } from "./textos";
import { VersaoDaCozinha } from "./VersaoDaCozinha";

const F = TF.ficha;
let numeroDoAviso = 0;

export function FichaAberta({ id, podeGerenciar, podeVerCusto }: { id: string; podeGerenciar: boolean; podeVerCusto: boolean }) {
  const [ficha, setFicha] = useState<FichaCompleta | null>(null);
  const [painel, setPainel] = useState<PainelDeFichas | null>(null);
  const [erro, setErro] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const [editando, setEditando] = useState(false);
  const [cozinha, setCozinha] = useState<{ fotoId: number | null } | null>(null);
  const [aviso, setAviso] = useState<AvisoRapido | null>(null);
  const avisar = useCallback((texto: string) => setAviso({ id: ++numeroDoAviso, texto }), []);

  const recarregar = useCallback(
    async (vivo: () => boolean = () => true) => {
      const [f, p] = await Promise.all([chamar<FichaCompleta>(`/api/fichas/${encodeURIComponent(id)}`), chamar<PainelDeFichas>("/api/fichas")]);
      if (!vivo()) return;
      if (f.ok && f.dados && p.ok && p.dados) {
        setFicha(f.dados);
        setPainel(p.dados);
        setErro("");
      } else setErro([f, p].find((r) => !r.ok || !r.dados)!.mensagem);
    },
    [id],
  );

  useEffect(() => {
    let vivo = true;
    void recarregar(() => vivo);
    return () => {
      vivo = false;
    };
  }, [recarregar]);

  async function mudarAtivo(ativo: boolean) {
    if (!ficha) return;
    setErroAcao("");
    const r = await chamar<FichaCompleta>("/api/fichas", "POST", { id: ficha.resumo.id, ativo });
    if (!r.ok || !r.dados) return setErroAcao(r.mensagem);
    await recarregar();
    avisar(ativo ? F.reativou : F.desativou);
  }

  async function abrirCozinha() {
    if (!ficha) return;
    const r = ficha.resumo;
    let produtoId = r.produtoId;
    if (r.tipo === "tamanho") produtoId = painel?.tamanhos.find((t) => t.id === r.tamanhoId)?.produtoId ?? null;
    let fotoId: number | null = null;
    if (produtoId !== null) {
      const p = await chamar<Produto[]>("/api/cadastros/produtos");
      fotoId = p.dados?.find((x) => x.id === produtoId)?.fotoId ?? null;
    }
    setCozinha({ fotoId });
  }

  if (erro) return <Aviso tipo="perigo">{erro}</Aviso>;
  if (!ficha || !painel) return <p aria-live="polite">{F.carregando}</p>;

  const r = ficha.resumo;
  const v = ficha.versao;
  const unidadeDe = new Map(painel.ingredientes.map((g) => [g.id, g.unidade]));
  const porcao = r.tipo === "preparo" ? `1 ${r.unidadeRendimento ?? "un"}` : "porção";
  const comCusto = podeVerCusto && ficha.custoDosItens.some((c) => c !== null);
  const custoDaReceita = ficha.custoDosItens.reduce<number>((s, c) => s + (c ?? 0), 0);
  const etiquetaDoPreparo = painel.etiquetasDosPreparos.find((e) => e.preparoId === r.id);

  if (cozinha)
    return (
      <div className="hor-tela fichas">
        <VersaoDaCozinha ficha={ficha} fotoId={cozinha.fotoId} aoFechar={() => setCozinha(null)} />
      </div>
    );

  return (
    <div className="hor-tela fichas">
      <p className="fichas__voltar">
        <Link href="/cadastros/fichas">{F.voltar}</Link>
      </p>
      <header className="hor-tela__cabeca hor-tela__cabeca--com-botao">
        <div>
          <h1>{r.nome}</h1>
          <div className="hor-cat__selos">
            <Selo variante="info">{NOME_DO_TIPO_DE_FICHA[r.tipo]}</Selo>
            <SeloDaSituacao resumo={r} />
            <Selo data-testid="versao-da-ficha">{r.versao === null ? TF.cartao.semReceita : TF.cartao.versao(r.versao)}</Selo>
            {!r.ativo && <Selo variante="alerta">{TF.cartao.desativada}</Selo>}
          </div>
          {v && <p className="hor-tela__intro">{F.porQuem(v.criadaPor, quando(v.criadaEm))}</p>}
        </div>
        <div className="hor-secao__botoes">
          <Botao variante={podeGerenciar && r.ativo ? "secundario" : "primario"} className="hor-secao__acao" onClick={() => void abrirCozinha()}>
            <Icone nome="documento" />
            {F.cozinha}
          </Botao>
          {podeGerenciar && r.ativo && (
            <Botao className="hor-secao__acao" onClick={() => setEditando(true)}>
              {F.editar}
            </Botao>
          )}
          {podeGerenciar && (
            <Botao variante="secundario" className="hor-secao__acao" onClick={() => void mudarAtivo(!r.ativo)}>
              {r.ativo ? F.desativar : F.reativar}
            </Botao>
          )}
        </div>
      </header>
      <div aria-live="polite">{erroAcao && <Aviso tipo="perigo">{erroAcao}</Aviso>}</div>
      {!r.ativo && <Aviso tipo="atencao">{F.desativada}</Aviso>}
      {r.ativo && r.foraDoCardapio && <Aviso tipo="atencao">{F.foraDoCardapio}</Aviso>}

      <section className={["hor-secao", ficha.pendencias.length > 0 && "fichas-pendencias"].filter(Boolean).join(" ")} aria-labelledby="ficha-pendencias" data-testid="pendencias">
        <h2 id="ficha-pendencias">{F.pendencias}</h2>
        {ficha.pendencias.length === 0 ? (
          <p className="fichas-ok">
            <Icone nome="ok" /> {F.semPendencias}
          </p>
        ) : (
          <>
            <p className="hor-secao__intro">{F.pendenciasIntro}</p>
            <ul className="fichas-pendencias__lista">
              {ficha.pendencias.map((p, k) => (
                <li key={k}>
                  <Icone nome="alerta" />
                  <span>{p.texto}</span>
                  {p.tipo === "anotada" && <Selo>{F.anotada}</Selo>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <BlocoDeAlergenicos alergenicos={r.alergenicos} />

      <section className="hor-secao" aria-labelledby="ficha-itens">
        <h2 id="ficha-itens">{F.itens}</h2>
        <p className="hor-secao__intro">{F.itensIntro}</p>
        {!v || v.itens.length === 0 ? (
          <p className="hor-vazio">{F.semItens}</p>
        ) : (
          <div className="fichas-tabela__caixa">
            <table className="fichas-tabela" data-testid="itens-da-receita">
              <thead>
                <tr>
                  <th scope="col">{F.colIngrediente}</th>
                  <th scope="col">{F.colQuantidade}</th>
                  <th scope="col">{F.colMedida}</th>
                  {podeVerCusto && <th scope="col">{F.colCusto}</th>}
                </tr>
              </thead>
              <tbody>
                {v.itens.map((i, k) => (
                  <tr key={i.ordem} data-testid={`item-${i.nome}`}>
                    <th scope="row">
                      {i.preparoId ? <Link href={`/cadastros/fichas/${i.preparoId}`}>{i.nome}</Link> : i.nome}
                      {i.preparoId && <span className="fichas-tabela__nota"> ({F.preparo})</span>}
                      {i.opcional && (
                        <>
                          {" "}
                          <Selo>{F.opcional}</Selo>
                        </>
                      )}
                    </th>
                    <td>{i.quantidade === null ? <Selo variante="alerta">{F.semQuantidade}</Selo> : quantidadeAmigavel(i.quantidade, i.unidade)}</td>
                    <td>{i.medidaCaseira ?? ""}</td>
                    {podeVerCusto && <td data-testid="custo-do-item">{ficha.custoDosItens[k] === null || ficha.custoDosItens[k] === undefined ? F.semCustoItem : textoDoCusto(ficha.custoDosItens[k]!)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {podeVerCusto && ficha.semCusto.length > 0 && (
          <Aviso tipo="atencao" data-testid="sem-custo">
            {F.semCusto}: {ficha.semCusto.map((s) => s.nome).join(", ")}. <Link href="/cadastros/fichas?aba=custos">{F.irParaCustos}</Link>
          </Aviso>
        )}
      </section>

      <section className="hor-secao" aria-labelledby="ficha-dados">
        <h2 id="ficha-dados" className="ajuda__so-leitor">
          {F.rende}
        </h2>
        <FichaDeDados>
          <Dado rotulo={F.rende}>{v?.rende ? (r.tipo === "preparo" ? quantidadeAmigavel(v.rende, r.unidadeRendimento ?? "un") : F.porcoes(v.rende.replace(".", ","))) : null}</Dado>
          <Dado rotulo={F.porcao}>{v?.porcaoQuantidade && v.porcaoUnidade ? quantidadeLegivel(v.porcaoQuantidade, v.porcaoUnidade) : null}</Dado>
          <Dado rotulo={F.tempo}>{v?.tempoMin != null ? F.minutos(v.tempoMin) : null}</Dado>
          <Dado rotulo={F.validade}>{v?.validadeDias != null ? F.dias(v.validadeDias) : null}</Dado>
          {podeVerCusto && (r.tipo !== "preparo" || r.unidadeRendimento === "un") && (
            <Dado rotulo={F.custoPorcao}>
              {r.custoCentavos === null ? null : (
                <span data-testid="custo-por-porcao">
                  {textoDoCusto(r.custoCentavos)}
                  {r.custoParcial && ` (${TF.cartao.parcial})`}
                </span>
              )}
            </Dado>
          )}
          {comCusto && (
            <Dado rotulo={F.custoReceita}>
              <span data-testid="custo-da-receita">
                {textoDoCusto(custoDaReceita)} <span className="fichas-tabela__nota">({F.custoReceitaNota})</span>
              </span>
            </Dado>
          )}
        </FichaDeDados>
        {podeVerCusto && (r.custoPbLoja !== null || r.custoPbDelivery !== null) && (
          <div className="hor-cat__selos">
            <PercentualDoPreco rotulo={TF.cartao.loja} pb={r.custoPbLoja} limite={painel.limiteCustoPb} testid="custo-loja" />
            <PercentualDoPreco rotulo={TF.cartao.delivery} pb={r.custoPbDelivery} limite={painel.limiteCustoPb} testid="custo-delivery" />
          </div>
        )}
      </section>

      <section className="hor-secao" aria-labelledby="ficha-etapas">
        <h2 id="ficha-etapas">{F.etapas}</h2>
        {!v || v.etapas.length === 0 ? (
          <p className="hor-vazio">{F.semEtapas}</p>
        ) : (
          <ol className="fichas-etapas">
            {v.etapas.map((e, k) => (
              <li key={k}>
                {e.texto}
                {e.minutos !== null && <Selo className="fichas-etapas__min">{F.minutos(e.minutos)}</Selo>}
              </li>
            ))}
          </ol>
        )}
        {v && v.equipamentos.length > 0 && (
          <>
            <h3>{F.equipamentos}</h3>
            <div className="hor-cat__selos">
              {v.equipamentos.map((e) => (
                <Selo key={e}>{e}</Selo>
              ))}
            </div>
          </>
        )}
        {v?.observacoes && (
          <>
            <h3>{F.observacoes}</h3>
            <p className="fichas-obs">{v.observacoes}</p>
          </>
        )}
      </section>

      <section className="hor-secao" aria-labelledby="ficha-consumo" data-testid="consumo">
        <h2 id="ficha-consumo">{F.consumo}</h2>
        {ficha.consumo.length === 0 ? (
          <p className="hor-vazio">{F.consumoVazio}</p>
        ) : (
          <>
            <p className="hor-secao__intro">{F.consumoIntro(porcao)}</p>
            <ul className="fichas-lista">
              {ficha.consumo.map((c) => (
                <li key={c.ingredienteId} className="fichas-lista__item">
                  <span className="fichas-lista__nome">{c.nome}</span>
                  <span className="fichas-lista__valor">{quantidadeLegivel(c.quantidade, unidadeDe.get(c.ingredienteId) ?? "")}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Ideia nº 16: código da etiqueta do preparo (cada produção vira um lote com etiqueta). */}
      {r.tipo === "preparo" && (
        <BlocoDaEtiqueta
          alvo={{ preparoId: r.id }}
          atual={{ codigo: etiquetaDoPreparo?.codigo ?? null, usaEtiqueta: etiquetaDoPreparo?.usaEtiqueta ?? true }}
          podeGerenciar={podeGerenciar}
          aoGravado={() => recarregar()}
        />
      )}

      {r.tipo === "preparo" && (
        <section className="hor-secao" aria-labelledby="ficha-usado" data-testid="usado-em">
          <h2 id="ficha-usado">{F.usadoEm}</h2>
          {ficha.usadoEm.length === 0 ? (
            <p className="hor-vazio">{F.naoUsado}</p>
          ) : (
            <ul className="fichas-lista">
              {ficha.usadoEm.map((u) => (
                <li key={u.id} className="fichas-lista__item">
                  <Link href={`/cadastros/fichas/${u.id}`}>{u.nome}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <HistoricoDaFicha key={ficha.versao?.id ?? 0} ficha={ficha} />

      {editando && (
        <EditorDaFicha
          painel={painel}
          ficha={ficha}
          aoFechar={() => setEditando(false)}
          aoRecarregar={() => {
            setEditando(false);
            void recarregar();
          }}
          aoSalvo={(f) => {
            setEditando(false);
            setFicha(f);
            void recarregar();
            avisar(F.salva(f.resumo.versao ?? 1));
          }}
        />
      )}
      <AvisoComDesfazer aviso={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}
