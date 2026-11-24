"use client";

/**
 * Contagem (E09 parte 4, decisão 0027): rápida do dia (um botão por área), inventário, itens
 * escolhidos e a lista. Na tela de contar NUNCA aparece o esperado enquanto a contagem está aberta
 * (o servidor nem manda). Fechar acerta o estoque e mostra as diferenças; cancelar pede o motivo.
 */
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Selo, varianteDaArea } from "@erp/interface";
import type { ContagemDaLista, ContagemVista, ItemDoPainel } from "@erp/dominio";
import { nomeComparavel } from "@erp/dominio/produtos";
import { chamar } from "../chamar";
import { AreaDeTexto, BotaoExemplos, Campo, CampoDoGrupo, Grupo, OpcaoDoGrupo, Selecao, SelecaoDoGrupo } from "../Campo";
import { formatarDataHora } from "../formatar";
import { qtd, qtdComSinal, reais, unidadesDoItem } from "./comum";
import type { ContextoDoEstoque, Opcao } from "./contexto";
import { chaveDoItem } from "./PainelDoEstoque";
import { MOTIVO_DO_ITEM_NA_RAPIDA, NOME_DA_SITUACAO, NOME_DO_LOCAL, NOME_DO_TIPO_DE_CONTAGEM, TE } from "./textos";

const T = TE.contagem;

export function Contagens({ contexto, areas, itens, aoMudar }: { contexto: ContextoDoEstoque; areas: Opcao[]; itens: ItemDoPainel[]; aoMudar: () => void }) {
  const [lista, setLista] = useState<ContagemDaLista[] | null>(null);
  const [aberta, setAberta] = useState<ContagemVista | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const codigos = areas.map((a) => a.valor);

  const recarregar = useCallback(async () => {
    const r = await chamar<ContagemDaLista[]>("/api/estoque/contagens?limite=30");
    if (r.ok && r.dados) setLista(r.dados);
    else setErro(r.mensagem);
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function abrir(url: string, corpo: unknown) {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    const r = await chamar<ContagemVista>(url, "POST", corpo);
    setOcupado(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setAberta(r.dados);
    void recarregar();
  }

  async function verUma(id: number) {
    setErro("");
    const r = await chamar<ContagemVista>(`/api/estoque/contagens/${id}`);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setAberta(r.dados);
  }

  if (aberta)
    return (
      <TelaDeContar
        contagem={aberta}
        preparos={new Set(itens.flatMap((i) => (i.preparoId !== null && i.itemId !== null ? [i.itemId] : [])))}
        contexto={contexto}
        aoVoltar={() => {
          setAberta(null);
          void recarregar();
        }}
        aoMudar={(c) => {
          setAberta(c);
          aoMudar();
        }}
      />
    );

  const daTela = (lista ?? []).filter((c) => codigos.includes(c.area));
  return (
    <div className="est-contagens">
      <p className="hor-secao__intro">{T.intro}</p>
      {erro && (
        <Aviso tipo="perigo" data-testid="erro-da-contagem">
          {erro}
        </Aviso>
      )}
      <section className="hor-secao" aria-labelledby="est-rapida">
        <h2 id="est-rapida">{T.rapida}</h2>
        <p className="hor-secao__intro">{T.rapidaIntro}</p>
        <div className="est-acoes est-acoes--grandes">
          {areas.map((a) => (
            <Botao key={a.valor} disabled={ocupado} onClick={() => void abrir("/api/estoque/contagens/rapida", { area: a.valor })}>
              {T.rapidaDe(a.texto)}
            </Botao>
          ))}
        </div>
      </section>
      <EscolherItens areas={areas} itens={itens} ocupado={ocupado} aoAbrir={(corpo) => void abrir("/api/estoque/contagens", corpo)} />
      <section className="hor-secao" aria-labelledby="est-inventario">
        <h2 id="est-inventario">{T.inventario}</h2>
        <p className="hor-secao__intro">{T.inventarioIntro}</p>
        <div className="est-acoes">
          {areas.map((a) => (
            <Botao key={a.valor} variante="secundario" disabled={ocupado} onClick={() => void abrir("/api/estoque/contagens", { tipo: "inventario", area: a.valor })}>
              {T.inventarioDe(a.texto)}
            </Botao>
          ))}
        </div>
      </section>
      <section className="hor-secao" aria-labelledby="est-lista-contagens">
        <h2 id="est-lista-contagens">{T.lista}</h2>
        <p className="hor-secao__intro">{T.listaIntro}</p>
        {!lista && !erro && <p>{TE.carregando}</p>}
        {lista && daTela.length === 0 && <p className="hor-vazio">{T.nenhuma}</p>}
        {daTela.length > 0 && (
          <ul className="est-lista" data-testid="lista-de-contagens">
            {daTela.map((c) => (
              <li key={c.id} className="est-linha">
                <span className="est-linha__cabeca">
                  <strong>{NOME_DO_TIPO_DE_CONTAGEM[c.tipo]}</strong>
                  <Selo variante={c.situacao === "aberta" ? "alerta" : c.situacao === "fechada" ? "sucesso" : "neutro"}>{NOME_DA_SITUACAO[c.situacao]}</Selo>
                  <Selo variante={varianteDaArea(c.area)}>{contexto.nomeDaArea[c.area]}</Selo>
                </span>
                <span className="est-linha__texto">
                  {T.contados(c.contados, c.itens)}. {formatarDataHora(c.abertaEm)}, {c.abertaPor}
                  {c.motivo && c.tipo !== "rapida" ? `. ${c.motivo}` : ""}
                </span>
                <Botao variante="secundario" onClick={() => void verUma(c.id)}>
                  {c.situacao === "aberta" ? "Continuar" : "Ver"}
                  <span className="ajuda__so-leitor"> {T.abrirUma(c.id)}</span>
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EscolherItens({ areas, itens, ocupado, aoAbrir }: { areas: Opcao[]; itens: ItemDoPainel[]; ocupado: boolean; aoAbrir: (corpo: unknown) => void }) {
  const [area, setArea] = useState(areas[0]!.valor);
  const [busca, setBusca] = useState("");
  const [motivo, setMotivo] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const termo = nomeComparavel(busca);
  const daArea = itens.filter((i) => i.areaPadrao === area || i.areas.some((a) => a.area === area));
  const mostrados = daArea.filter((i) => marcados.has(chaveDoItem(i)) || !termo || nomeComparavel(i.nome).includes(termo)).slice(0, 60);
  const escolhidos = daArea.filter((i) => marcados.has(chaveDoItem(i)));
  return (
    <section className="hor-secao" aria-labelledby="est-escolhidos">
      <h2 id="est-escolhidos">{T.escolhidos}</h2>
      <p className="hor-secao__intro">{T.escolhidosIntro}</p>
      <BotaoExemplos />
      {areas.length > 1 && (
        <Selecao
          rotulo={T.areaDosEscolhidos}
          explicacao={T.areaDosEscolhidosAjuda}
          exemplo={T.areaDosEscolhidosExemplo}
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
            setMarcados(new Set());
          }}
          opcoes={areas}
        />
      )}
      <Campo rotulo={T.busca} explicacao={T.buscaAjuda} exemplo={T.buscaExemplo} type="search" value={busca} maxLength={60} autoComplete="off" onChange={(e) => setBusca(e.target.value)} />
      <Grupo legenda={T.escolha} explicacao={T.escolhaAjuda} exemplo={T.escolhaExemplo} className="hor-escolhas">
        {mostrados.map((i) => (
          <OpcaoDoGrupo
            key={chaveDoItem(i)}
            className="hor-escolha"
            rotulo={i.nome}
            checked={marcados.has(chaveDoItem(i))}
            onChange={(e) =>
              setMarcados((m) => {
                const n = new Set(m);
                if (e.target.checked) n.add(chaveDoItem(i));
                else n.delete(chaveDoItem(i));
                return n;
              })
            }
          />
        ))}
      </Grupo>
      <Campo rotulo={T.motivo} explicacao={T.motivoAjuda} exemplo={T.motivoExemplo} value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
      <div className="hor-secao__botoes">
        <Botao
          disabled={ocupado || escolhidos.length === 0}
          onClick={() =>
            aoAbrir({
              tipo: "item",
              area,
              ...(motivo.trim() ? { motivo } : {}),
              itens: escolhidos.map((i) => (i.ingredienteId !== null ? { ingredienteId: i.ingredienteId } : { preparoId: i.preparoId })),
            })
          }
        >
          {T.abrir(escolhidos.length)}
        </Botao>
      </div>
    </section>
  );
}

function TelaDeContar({ contagem: c, preparos, contexto, aoVoltar, aoMudar }: { contagem: ContagemVista; preparos: ReadonlySet<number>; contexto: ContextoDoEstoque; aoVoltar: () => void; aoMudar: (c: ContagemVista) => void }) {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const aberta = c.situacao === "aberta";

  async function recarregar() {
    const r = await chamar<ContagemVista>(`/api/estoque/contagens/${c.id}`);
    if (r.ok && r.dados) aoMudar(r.dados);
    else setErro(r.mensagem);
  }

  async function enviar(url: string, corpo: unknown) {
    if (ocupado) return false;
    setOcupado(true);
    setErro("");
    const r = await chamar(url, "POST", corpo);
    setOcupado(false);
    if (!r.ok) {
      setErro(r.mensagem);
      return false;
    }
    await recarregar();
    return true;
  }

  return (
    <div className="est-contar" data-testid="tela-de-contar">
      <div className="hor-secao__botoes">
        <Botao variante="secundario" onClick={aoVoltar}>
          {T.voltar}
        </Botao>
      </div>
      <h2>
        {NOME_DO_TIPO_DE_CONTAGEM[c.tipo]}: {contexto.nomeDaArea[c.area]}
      </h2>
      <p className="est-item__selos">
        <Selo variante={aberta ? "alerta" : c.situacao === "fechada" ? "sucesso" : "neutro"} data-testid="situacao-da-contagem">
          {NOME_DA_SITUACAO[c.situacao]}
        </Selo>
        <span>{T.contados(c.contados, c.linhas.length)}</span>
      </p>
      {erro && (
        <Aviso tipo="perigo" data-testid="erro-da-contagem">
          {erro}
        </Aviso>
      )}
      {aberta && <Aviso tipo="info">{T.cega}</Aviso>}
      {c.situacao === "fechada" && (
        <Aviso tipo={c.linhas.some((l) => l.diferenca && l.diferenca !== "0") ? "atencao" : "sucesso"} data-testid="contagem-fechada">
          {c.linhas.some((l) => l.diferenca && l.diferenca !== "0") ? T.fechada : T.semDiferenca}
        </Aviso>
      )}
      {c.situacao === "cancelada" && c.fim && <Aviso tipo="info">{T.cancelada(c.fim.por, c.fim.observacao ?? "")}</Aviso>}
      {c.linhas.length === 0 ? (
        <p className="hor-vazio">{T.vazia}</p>
      ) : (
        <ul className="est-lista" data-testid="linhas-da-contagem">
          {c.linhas.map((l) => (
            <li key={l.contagemItemId} className="est-linha" data-testid={`contar-${l.nome}-${l.local}`}>
              {aberta ? (
                <LinhaParaContar linha={l} preparo={preparos.has(l.itemId)} ocupado={ocupado} aoContar={(q, un) => enviar("/api/estoque/contagens/contar", { contagemId: c.id, contagemItemId: l.contagemItemId, quantidade: q, unidade: un })} />
              ) : (
                <>
                  <span className="est-linha__cabeca">
                    <strong>{l.nome}</strong>
                    <span>{NOME_DO_LOCAL[l.local]}</span>
                    {l.diferenca !== null && l.diferenca !== "0" && <Selo variante={l.diferenca.startsWith("-") ? "perigo" : "info"}>{T.diferenca(qtdComSinal(l.diferenca, l.unidade))}</Selo>}
                  </span>
                  <span className="est-linha__texto">
                    {l.contado === null ? T.naoContado : T.contado(qtd(l.contado, l.unidade), l.contadoPor ?? "")}
                    {l.esperado !== null && `. ${T.esperado(qtd(l.esperado, l.unidade))}`}
                    {l.valorDaDiferenca !== null && l.diferenca !== "0" && `. ${T.valorDaDiferenca(reais(l.valorDaDiferenca))}`}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {aberta && (
        <section className="hor-secao" aria-labelledby="est-fim">
          <h3 id="est-fim">{T.fechar}</h3>
          <p className="hor-secao__intro">{T.fecharAjuda}</p>
          <div className="hor-secao__botoes">
            <Botao disabled={ocupado} onClick={() => void enviar("/api/estoque/contagens/fechar", { contagemId: c.id })}>
              {T.fechar}
            </Botao>
            {!cancelando && (
              <Botao variante="secundario" disabled={ocupado} onClick={() => setCancelando(true)}>
                {T.cancelar}
              </Botao>
            )}
          </div>
          {cancelando && (
            <form
              className="est-form"
              onSubmit={(e) => {
                e.preventDefault();
                void enviar("/api/estoque/contagens/cancelar", { contagemId: c.id, observacao: motivo });
              }}
            >
              <AreaDeTexto rotulo={T.cancelarMotivo} explicacao={T.cancelarMotivoAjuda} exemplo={T.cancelarMotivoExemplo} value={motivo} maxLength={500} rows={2} onChange={(e) => setMotivo(e.target.value)} />
              <div className="hor-secao__botoes">
                <Botao type="submit" variante="perigo" disabled={ocupado}>
                  {T.confirmarCancelar}
                </Botao>
                <Botao variante="secundario" disabled={ocupado} onClick={() => setCancelando(false)}>
                  {TE.form.cancelar}
                </Botao>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

function LinhaParaContar({ linha: l, preparo, ocupado, aoContar }: { linha: ContagemVista["linhas"][number]; preparo: boolean; ocupado: boolean; aoContar: (q: string, un: string) => Promise<boolean> }) {
  // Preparo conta só na unidade dele (o servidor recusa outra); ingrediente, em kg ou g, L ou ml...
  const unidades = preparo ? [{ valor: l.unidade, texto: l.unidade }] : unidadesDoItem(l.unidade);
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState(unidades[0]!.valor);
  const nome = `${l.nome} (${NOME_DO_LOCAL[l.local]})`;
  return (
    <form
      className="est-contar__linha"
      onSubmit={(e) => {
        e.preventDefault();
        void aoContar(quantidade, unidade).then((ok) => ok && setQuantidade(""));
      }}
    >
      <Grupo legenda={nome} explicacao={T.conteiAjuda} exemplo={T.conteiExemplo} className="est-contar__grupo">
        {l.motivo && <Selo variante="info">{MOTIVO_DO_ITEM_NA_RAPIDA[l.motivo] ?? l.motivo}</Selo>}
        <p className="est-linha__texto" data-testid="ja-contado">
          {l.contado === null ? T.naoContado : `${T.contado(qtd(l.contado, l.unidade), l.contadoPor ?? "")}. ${T.recontar}`}
        </p>
        <div className="est-form__linha">
          <CampoDoGrupo rotulo={T.contei} complemento={nome} inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          {unidades.length > 1 && <SelecaoDoGrupo rotulo={TE.form.unidade} complemento={nome} value={unidade} onChange={(e) => setUnidade(e.target.value)} opcoes={unidades} />}
          <Botao type="submit" disabled={ocupado || !quantidade.trim()}>
            {T.gravarContagem}
            <span className="ajuda__so-leitor"> {nome}</span>
          </Botao>
        </div>
      </Grupo>
    </form>
  );
}
