"use client";

/**
 * Cadastro rápido de ingredientes (ideia nº 4): "Catálogo pronto" (marcar o que a casa usa) e
 * "Colar uma lista" (texto solto, lido pelo servidor, com prévia verde/amarela/vermelha).
 * Só quem tem cadastros.gerenciar chega aqui; o servidor confere de novo em cada chamada.
 * Nada é gravado sem a pessoa apertar o botão de gravar, e tudo é "tudo ou nada" no servidor.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Aviso, Botao, Cartao, Citacao, Faixa, Icone, ListaComIcone, Selo, varianteDaArea } from "@erp/interface";
import type { LinhaLida } from "@erp/dominio";
import { buscarNoCatalogo, chaveDeBusca, type ItemDoCatalogo } from "@erp/dominio/catalogo";
import { AreaDeTexto, Campo, Grupo, OpcaoDoGrupo, Selecao } from "../Campo";
import { chamar } from "../chamar";
import { unidadePorExtenso, type UnidadePadrao } from "./auxiliares";
import { EditorDeItem, embalagensDe, faltaNasEmbalagens, faltaNoItem, itemParaServidor, ResumoDoItemEditavel, type ItemEditavel, type Opcao } from "./Embalagens";

type ItemDaApi = ItemDoCatalogo & { jaCadastrado: boolean };
type CatalogoApi = { grupos: string[]; itens: ItemDaApi[]; jaCadastrados: string[] };
type Mensagem = { tipo: "sucesso" | "perigo" | "atencao"; texto: string } | null;

type Props = {
  areas: Opcao[];
  unidadesBase: Opcao[];
  unidades: UnidadePadrao[];
  /** Atualiza a lista de ingredientes da tela de trás. */
  aoGravar: () => Promise<void>;
  aoFechar: () => void;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function CadastroRapido({ areas, unidadesBase, unidades, aoGravar, aoFechar }: Props) {
  const [aba, setAba] = useState<"catalogo" | "lista">("catalogo");
  const [catalogo, setCatalogo] = useState<CatalogoApi | null>(null);
  const [erroCatalogo, setErroCatalogo] = useState("");
  const nomeDaArea = useCallback((a: string) => areas.find((x) => x.valor === a)?.texto ?? a, [areas]);

  const carregar = useCallback(async () => {
    const r = await chamar<CatalogoApi>("/api/cadastros/catalogo");
    if (r.ok && r.dados) {
      setCatalogo(r.dados);
      setErroCatalogo("");
    } else setErroCatalogo(r.mensagem);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function depoisDeGravar() {
    await carregar();
    await aoGravar();
  }

  const abas = [
    { id: "catalogo" as const, texto: "Catálogo pronto" },
    { id: "lista" as const, texto: "Colar uma lista" },
  ];

  return (
    <Cartao>
      <div className="rapido__topo">
        <h2>Cadastro rápido</h2>
        <Botao variante="secundario" onClick={aoFechar}>
          Fechar
        </Botao>
      </div>
      <p className="cadastros__dica">Cadastre vários ingredientes de uma vez, sem digitar um por um. O campo de digitar um ingrediente continua no botão Novo ingrediente.</p>
      {erroCatalogo && <Aviso tipo="perigo">{erroCatalogo}</Aviso>}
      <div role="tablist" aria-label="Jeito de cadastrar" className="rapido__abas">
        {abas.map((a, n) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`aba-${a.id}`}
            aria-selected={aba === a.id}
            aria-controls={`painel-${a.id}`}
            tabIndex={aba === a.id ? 0 : -1}
            className="rapido__aba"
            onClick={() => setAba(a.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const outra = abas[(n + 1) % abas.length]!;
              setAba(outra.id);
              document.getElementById(`aba-${outra.id}`)?.focus();
            }}
          >
            {a.texto}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="painel-catalogo" aria-labelledby="aba-catalogo" hidden={aba !== "catalogo"}>
        {catalogo ? (
          <AbaCatalogo catalogo={catalogo} areas={areas} unidadesBase={unidadesBase} unidades={unidades} nomeDaArea={nomeDaArea} aoGravar={depoisDeGravar} />
        ) : (
          !erroCatalogo && <p>Carregando o catálogo...</p>
        )}
      </div>
      <div role="tabpanel" id="painel-lista" aria-labelledby="aba-lista" hidden={aba !== "lista"}>
        <AbaLista
          jaCadastrados={catalogo?.jaCadastrados ?? []}
          areas={areas}
          unidadesBase={unidadesBase}
          unidades={unidades}
          nomeDaArea={nomeDaArea}
          aoGravar={depoisDeGravar}
        />
      </div>
    </Cartao>
  );
}

// ---------- aba 1: catálogo pronto ----------

function AbaCatalogo({
  catalogo,
  areas,
  unidadesBase,
  unidades,
  nomeDaArea,
  aoGravar,
}: {
  catalogo: CatalogoApi;
  areas: Opcao[];
  unidadesBase: Opcao[];
  unidades: UnidadePadrao[];
  nomeDaArea: (a: string) => string;
  aoGravar: () => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("");
  /** Marcados, pelo nome do catálogo, já com o que a pessoa ajustou. */
  const [marcados, setMarcados] = useState<Record<string, ItemEditavel>>({});
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [gravando, setGravando] = useState(false);

  const visiveis = useMemo(() => {
    const achados = busca.trim().length >= 2 ? new Set(buscarNoCatalogo(busca, 300).map((i) => i.nome)) : null;
    return catalogo.itens.filter((i) => (!achados || achados.has(i.nome)) && (!grupo || i.grupo === grupo));
  }, [catalogo, busca, grupo]);
  const secoes = useMemo(
    () => catalogo.grupos.map((g) => ({ grupo: g, itens: visiveis.filter((i) => i.grupo === g) })).filter((s) => s.itens.length > 0),
    [catalogo.grupos, visiveis],
  );

  const doCatalogo = (i: ItemDaApi): ItemEditavel => ({ nome: i.nome, unidadeBase: i.unidadeBase, area: i.area, embalagens: embalagensDe(i.embalagens) });

  function marcar(i: ItemDaApi, ligado: boolean) {
    setMensagem(null);
    setMarcados((m) => {
      const novo = { ...m };
      if (ligado) novo[i.nome] = doCatalogo(i);
      else delete novo[i.nome];
      return novo;
    });
  }
  function marcarTodos(itens: ItemDaApi[]) {
    setMensagem(null);
    setMarcados((m) => {
      const novo = { ...m };
      for (const i of itens) if (!i.jaCadastrado && !novo[i.nome]) novo[i.nome] = doCatalogo(i);
      return novo;
    });
  }

  const nomes = Object.keys(marcados);
  const faltas = nomes.flatMap((n) => faltaNoItem(marcados[n]!).map((f) => `${n}: ${f}`));

  async function gravar() {
    setMensagem(null);
    if (faltas.length) return setMensagem({ tipo: "perigo", texto: faltas[0]! });
    setGravando(true);
    const r = await chamar<{ criados: number }>("/api/cadastros/ingredientes/lote", "POST", nomes.map((n) => itemParaServidor(marcados[n]!)));
    setGravando(false);
    if (!r.ok || !r.dados) return setMensagem({ tipo: "perigo", texto: r.mensagem });
    setMarcados({});
    setAbertos({});
    await aoGravar();
    setMensagem({ tipo: "sucesso", texto: `${plural(r.dados.criados, "ingrediente gravado", "ingredientes gravados")}.` });
  }

  /** Seções abertas ou fechadas pela pessoa. Sem escolha dela, abrem só com busca ou corredor escolhido. */
  const [secaoAberta, setSecaoAberta] = useState<Record<string, boolean>>({});
  const filtrando = busca.trim().length >= 2 || !!grupo;
  const estaAberta = (g: string) => secaoAberta[g] ?? filtrando;
  const idDaSecao = useId();

  return (
    <div className="rapido__painel">
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      <div className="cadastros__filtros catalogo__busca">
        <Campo
          rotulo="Procurar no catálogo"
          explicacao="Digite parte do nome (sem acento também) ou um apelido para achar o item."
          exemplo="mussarela, muçarela e mucarela dão o mesmo resultado."
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setSecaoAberta({});
          }}
          autoComplete="off"
        />
        <Selecao
          rotulo="Corredor"
          explicacao="Mostra só um tipo de produto, como no mercado. Deixe em Todos para ver tudo."
          exemplo="Escolha Laticínios e ovos para ver queijo, leite e ovo."
          value={grupo}
          onChange={(e) => {
            setGrupo(e.target.value);
            setSecaoAberta({});
          }}
          opcoes={[{ valor: "", texto: "Todos os corredores" }, ...catalogo.grupos.map((g) => ({ valor: g, texto: g }))]}
        />
      </div>
      {secoes.length === 0 && <p>Nada encontrado no catálogo. Tente outra palavra ou use a aba Colar uma lista.</p>}
      {secoes.length > 0 && (
        <Grupo
          legenda="Corredores do catálogo"
          className="rapido__grupo catalogo"
          ajudaNoTopo
          explicacao="Abra um corredor e marque o que a casa usa. Os já cadastrados ficam de fora. Os itens marcados aparecem em Selecionados, onde você pode ajustar unidade, área ou embalagens."
          exemplo="Abra Hortifrúti, marque Tomate e Cebola e aperte Gravar para cadastrar os dois de uma vez."
        >
          {secoes.map((s, n) => {
            const aberta = estaAberta(s.grupo);
            const idPainel = `${idDaSecao}-${n}`;
            const doCorredor = s.itens.filter((i) => marcados[i.nome]).length;
            const faltaMarcar = s.itens.some((i) => !i.jaCadastrado && !marcados[i.nome]);
            return (
              <section key={s.grupo} className="catalogo__secao" data-testid={`corredor-${s.grupo}`}>
                <div className="catalogo__cabeca">
                  <button
                    type="button"
                    className="catalogo__alternar"
                    aria-expanded={aberta}
                    aria-controls={idPainel}
                    onClick={() => setSecaoAberta((a) => ({ ...a, [s.grupo]: !aberta }))}
                  >
                    <span className="catalogo__seta" aria-hidden="true" />
                    <span className="catalogo__nome">{s.grupo}</span>
                  </button>
                  <span className="catalogo__selos">
                    <Selo>{plural(s.itens.length, "item", "itens")}</Selo>
                    {doCorredor > 0 && (
                      <Selo variante="sucesso" icone="ok">
                        {plural(doCorredor, "marcado", "marcados")}
                      </Selo>
                    )}
                  </span>
                  <Botao variante="secundario" aria-label={`Marcar todos de ${s.grupo}`} disabled={!faltaMarcar} onClick={() => marcarTodos(s.itens)}>
                    Marcar todos
                  </Botao>
                </div>
                {aberta && (
                  <ul id={idPainel} className="lista-simples catalogo__grade">
                    {s.itens.map((i) => (
                      <li key={i.nome}>
                        <CartaoDoItem item={i} marcado={!!marcados[i.nome]} nomeDaArea={nomeDaArea} aoMarcar={(ligado) => marcar(i, ligado)} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </Grupo>
      )}
      {nomes.length > 0 && (
        <section className="catalogo__bandeja" aria-label="Itens selecionados">
          <div className="catalogo__bandeja-cabeca">
            <h3>Selecionados ({nomes.length})</h3>
            <Botao variante="secundario" onClick={() => setMarcados({})}>
              Desmarcar tudo
            </Botao>
          </div>
          <ul className="lista-simples catalogo__minis">
            {nomes.map((nome) => {
              const marcado = marcados[nome]!;
              return (
                <li key={nome} className="rapido__item" data-testid={`catalogo-${nome}`}>
                  <div className="rapido__mini" aria-label={`Resumo de ${nome}`} role="group">
                    <h4 className="rapido__nome">{marcado.nome || nome}</h4>
                    <ResumoDoItemEditavel item={marcado} nomeDaArea={nomeDaArea} />
                    <div className="cadastros__botoes">
                      <Botao
                        variante="secundario"
                        aria-expanded={!!abertos[nome]}
                        aria-label={`${abertos[nome] ? "Fechar o ajuste de" : "Ajustar"} ${nome}`}
                        onClick={() => setAbertos((a) => ({ ...a, [nome]: !a[nome] }))}
                      >
                        {abertos[nome] ? "Fechar ajuste" : "Ajustar"}
                      </Botao>
                      <Botao variante="secundario" aria-label={`Desmarcar ${nome}`} onClick={() => marcar({ nome } as ItemDaApi, false)}>
                        Tirar
                      </Botao>
                    </div>
                    {abertos[nome] && (
                      <EditorDeItem item={marcado} areas={areas} unidadesBase={unidadesBase} unidades={unidades} aoMudar={(novo) => setMarcados((m) => ({ ...m, [nome]: novo }))} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="rapido__barra">
        <span>{nomes.length === 0 ? "Nenhum item marcado" : plural(nomes.length, "item marcado", "itens marcados")}</span>
        <Botao disabled={nomes.length === 0 || gravando} onClick={() => void gravar()}>
          {nomes.length === 0 ? "Gravar" : `Gravar ${plural(nomes.length, "item", "itens")}`}
        </Botao>
      </div>
    </div>
  );
}

/** Cartão selecionável de um item do catálogo: checkbox de verdade dentro de um label que cobre o cartão. */
function CartaoDoItem({ item, marcado, nomeDaArea, aoMarcar }: { item: ItemDaApi; marcado: boolean; nomeDaArea: (a: string) => string; aoMarcar: (ligado: boolean) => void }) {
  return (
    <OpcaoDoGrupo
      className={`cartao-sel${marcado ? " cartao-sel--marcado" : ""}${item.jaCadastrado ? " cartao-sel--ja" : ""}`}
      rotulo={item.jaCadastrado ? `${item.nome} (já cadastrado)` : item.nome}
      checked={marcado}
      disabled={item.jaCadastrado}
      onChange={(e) => aoMarcar(e.target.checked)}
      conteudo={
        <>
          <span className="cartao-sel__topo">
            <span className="cartao-sel__nome">{item.nome}</span>
            {marcado && <Icone nome="ok" />}
          </span>
          <span className="cartao-sel__selos">
            {item.jaCadastrado && <Selo icone="info">Já cadastrado</Selo>}
            <Selo variante={varianteDaArea(item.area)}>{nomeDaArea(item.area)}</Selo>
            <span className="erp-chip erp-chip--mini">{unidadePorExtenso(item.unidadeBase)}</span>
          </span>
        </>
      }
    />
  );
}

// ---------- aba 2: colar uma lista ----------

type LinhaDaTela = {
  chave: number;
  original: LinhaLida;
  item: ItemEditavel;
  incluida: boolean;
  tocada: boolean;
  aberta: boolean;
};

const FAIXA_DA_SITUACAO = { pronto: "sucesso", conferir: "alerta", erro: "perigo" } as const;
const TEXTO_DA_SITUACAO = { pronto: "Pronto para gravar", conferir: "Conferir antes de gravar", erro: "Com erro" } as const;

function AbaLista({
  jaCadastrados,
  areas,
  unidadesBase,
  unidades,
  nomeDaArea,
  aoGravar,
}: {
  jaCadastrados: string[];
  areas: Opcao[];
  unidadesBase: Opcao[];
  unidades: UnidadePadrao[];
  nomeDaArea: (a: string) => string;
  aoGravar: () => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [linhas, setLinhas] = useState<LinhaDaTela[] | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const chave = useRef(0);

  const existentes = useMemo(() => new Set(jaCadastrados.map(chaveDeBusca)), [jaCadastrados]);

  async function ler() {
    setMensagem(null);
    setLendo(true);
    const r = await chamar<{ linhas: LinhaLida[] }>("/api/cadastros/lista-colada", "POST", { texto });
    setLendo(false);
    if (!r.ok || !r.dados) return setMensagem({ tipo: "perigo", texto: r.mensagem });
    if (r.dados.linhas.length === 0) {
      setLinhas(null);
      return setMensagem({ tipo: "atencao", texto: "Não achei nenhuma linha. Escreva um ingrediente por linha." });
    }
    setLinhas(
      r.dados.linhas.map((l) => ({
        chave: ++chave.current,
        original: l,
        item: {
          nome: l.nome,
          unidadeBase: l.unidadeBase ?? "",
          area: l.area,
          embalagens: embalagensDe(l.embalagens.map((e) => [e.nome, e.quantidadeBase] as const)),
        },
        incluida: l.situacao !== "erro",
        tocada: false,
        aberta: l.situacao !== "pronto",
      })),
    );
  }

  /** Situação atual da linha, recalculada com o que a pessoa corrigiu. */
  const avaliar = useCallback(
    (l: LinhaDaTela, todas: LinhaDaTela[]) => {
      const erros: string[] = [];
      const faltas: string[] = [];
      if (l.item.nome.trim().length < 2) erros.push("Nome curto demais.");
      if (!l.item.unidadeBase) erros.push("Diga como o estoque conta: g, ml ou un.");
      const k = chaveDeBusca(l.item.nome);
      if (k && existentes.has(k)) erros.push("Já está cadastrado.");
      const igual = todas.find((o) => o.chave !== l.chave && o.incluida && chaveDeBusca(o.item.nome) === k && k);
      if (igual && igual.chave < l.chave) erros.push(`Repetido: igual à linha ${igual.original.numero}.`);
      // Limite e linha longa nunca somem ao editar; os demais erros são recalculados.
      const original = l.original.erros.filter((e) => /no máximo|longa demais/.test(e) || (!l.tocada && !/cadastrado|Repetido|Nome curto|estoque conta/.test(e)));
      erros.push(...original);
      faltas.push(...faltaNasEmbalagens(l.item));
      const situacao: LinhaLida["situacao"] = erros.length ? "erro" : faltas.length || (!l.tocada && l.original.avisos.length) ? "conferir" : "pronto";
      return { erros, faltas, situacao };
    },
    [existentes],
  );

  const avaliadas = useMemo(() => (linhas ?? []).map((l) => ({ l, ...avaliar(l, linhas ?? []) })), [linhas, avaliar]);
  const gravaveis = avaliadas.filter((a) => a.l.incluida && a.situacao !== "erro" && a.faltas.length === 0);
  const contagem = {
    pronto: avaliadas.filter((a) => a.situacao === "pronto").length,
    conferir: avaliadas.filter((a) => a.situacao === "conferir").length,
    erro: avaliadas.filter((a) => a.situacao === "erro").length,
  };

  const mudar = (chaveDaLinha: number, parte: Partial<LinhaDaTela>) =>
    setLinhas((ls) => (ls ?? []).map((l) => (l.chave === chaveDaLinha ? { ...l, ...parte } : l)));

  async function gravar() {
    setMensagem(null);
    if (gravaveis.length === 0) return;
    setGravando(true);
    const r = await chamar<{ criados: number }>("/api/cadastros/ingredientes/lote", "POST", gravaveis.map((a) => itemParaServidor(a.l.item)));
    setGravando(false);
    if (!r.ok || !r.dados) return setMensagem({ tipo: "perigo", texto: r.mensagem });
    const gravadas = new Set(gravaveis.map((a) => a.l.chave));
    const restantes = (linhas ?? []).filter((l) => !gravadas.has(l.chave));
    setLinhas(restantes.length ? restantes : null);
    if (restantes.length === 0) setTexto("");
    await aoGravar();
    setMensagem({
      tipo: "sucesso",
      texto: `${plural(r.dados.criados, "ingrediente gravado", "ingredientes gravados")}.${restantes.length === 0 ? "" : restantes.length === 1 ? " Sobrou 1 linha para corrigir." : ` Sobraram ${restantes.length} linhas para corrigir.`}`,
    });
  }

  return (
    <div className="rapido__painel">
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      <AreaDeTexto
        rotulo="Cole sua lista de ingredientes"
        explicacao="Um ingrediente por linha. Depois do nome, escreva a embalagem se quiser (saco 25 kg, caixa com 30). Aceita lista copiada de planilha, mensagem ou bloco de notas."
        exemplo={"Farinha de trigo - saco 25 kg\nOvo; caixa com 30\nQueijo muçarela 4kg\nRefrigerante lata - fardo 12 latas"}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={8}
        spellCheck={false}
      />
      <div className="cadastros__botoes">
        <Botao disabled={!texto.trim() || lendo} onClick={() => void ler()}>
          Ler a lista
        </Botao>
      </div>
      {linhas && (
        <>
          <div data-testid="resumo-da-lista" aria-live="polite" className="rapido__contadores">
            <Selo variante="sucesso" icone="ok">
              {plural(contagem.pronto, "pronta", "prontas")}
            </Selo>
            <Selo variante="alerta" icone="alerta">
              {plural(contagem.conferir, "para conferir", "para conferir")}
            </Selo>
            <Selo variante="perigo" icone="erro">
              {plural(contagem.erro, "com erro", "com erro")}
            </Selo>
          </div>
          <p className="cadastros__dica">Linha com erro fica de fora até você corrigir (ou desmarque).</p>
          <Grupo
            legenda="Linhas lidas"
            className="rapido__grupo"
            explicacao="Marque as linhas que quer gravar. Toque em Corrigir para mudar nome, unidade, área ou a quantidade de uma embalagem."
            exemplo="Desmarque uma linha que não quer cadastrar agora."
          >
            <ul className="lista-simples" data-testid="linhas-lidas">
              {avaliadas.map(({ l, erros, faltas, situacao }) => (
                <li key={l.chave} className={`rapido__linha rapido__linha--${situacao}`} data-testid={`linha-${l.original.numero}`} data-situacao={situacao}>
                  <Faixa tipo={FAIXA_DA_SITUACAO[situacao]} className="rapido__faixa">
                    {TEXTO_DA_SITUACAO[situacao]}
                  </Faixa>
                  <OpcaoDoGrupo
                    className="cadastros__opcao"
                    rotulo={`Linha ${l.original.numero}`}
                    checked={l.incluida && situacao !== "erro"}
                    disabled={situacao === "erro"}
                    onChange={(e) => mudar(l.chave, { incluida: e.target.checked })}
                  />
                  <h3 className="rapido__nome">{l.item.nome || "Sem nome"}</h3>
                  <Citacao>{l.original.texto}</Citacao>
                  <ResumoDoItemEditavel item={l.item} nomeDaArea={nomeDaArea} />
                  <ListaComIcone tipo="perigo" itens={erros} aria-label="Erros desta linha" />
                  {erros.length === 0 && <ListaComIcone tipo="alerta" itens={[...(l.tocada ? [] : l.original.avisos), ...faltas]} aria-label="Avisos desta linha" />}
                  <Botao
                    variante="secundario"
                    aria-expanded={l.aberta}
                    aria-label={`${l.aberta ? "Fechar a correção da" : "Corrigir a"} linha ${l.original.numero}`}
                    onClick={() => mudar(l.chave, { aberta: !l.aberta })}
                  >
                    {l.aberta ? "Fechar correção" : "Corrigir"}
                  </Botao>
                  {l.aberta && (
                    <EditorDeItem
                      item={l.item}
                      areas={areas}
                      unidadesBase={unidadesBase}
                      unidades={unidades}
                      aoMudar={(novo) => {
                        const antes = l;
                        mudar(l.chave, { item: novo, tocada: true, incluida: antes.tocada ? antes.incluida : antes.incluida || antes.original.situacao === "erro" });
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Grupo>
          <div className="rapido__barra">
            <span>{plural(gravaveis.length, "linha pronta para gravar", "linhas prontas para gravar")}</span>
            <Botao disabled={gravaveis.length === 0 || gravando} onClick={() => void gravar()}>
              {gravaveis.length === 0 ? "Gravar as linhas prontas" : gravaveis.length === 1 ? "Gravar 1 linha pronta" : `Gravar as ${gravaveis.length} linhas prontas`}
            </Botao>
          </div>
        </>
      )}
    </div>
  );
}
