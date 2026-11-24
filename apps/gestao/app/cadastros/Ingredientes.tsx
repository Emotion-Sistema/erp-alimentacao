"use client";

/**
 * Tela de Ingredientes (E07): a lista vem primeiro, com busca e filtro. Quem tem cadastros.gerenciar
 * vê o botão "Adicionar ingrediente" (atalho: tecla A), que abre uma janela por cima da tela com
 * duas abas: Rápido (catálogo pronto e lista colada, vários de uma vez) e Comum (um ingrediente por
 * vez). Editar, Duplicar e "Adicionar embalagem" abrem a mesma janela, no formulário Comum.
 * Ao gravar, a lista atualiza e os ingredientes novos ou salvos ficam em destaque.
 * Na janela de editar, o bloco "Alergênicos" (S1) marca e confere os alergênicos do ingrediente.
 * "?ingrediente=ID" (link "Conferir" das fichas) abre direto a janela daquele ingrediente.
 * A tela só esconde botões: o servidor confere a permissão em cada chamada.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aviso, Botao, Cartao, ChipDeEmbalagem, GrupoDeChips, Icone, ItemDeLista } from "@erp/interface";
import { ResumoDoItem } from "./ResumoDoItem";
import { chaveDeBusca, type ItemDoCatalogo } from "@erp/dominio/catalogo";
import { BotaoExemplos, Campo, Marcador, Selecao } from "../Campo";
import { chamar } from "../chamar";
import { baseDaUnidade } from "@erp/dominio/unidades";
import { unidadePorExtenso, type UnidadeBase, type UnidadePadrao } from "./auxiliares";
import { CadastroRapido } from "./CadastroRapido";
import { CampoNomeComSugestao } from "./CampoNomeComSugestao";
import { OPCOES_DA_UNIDADE, EXEMPLO_DA_UNIDADE, EXPLICACAO_DA_UNIDADE, opcoesDaFamilia, embalagensDe, faltaNasEmbalagens, itemParaServidor, type LinhaDeEmbalagem } from "./Embalagens";
import { ajustarLinhasParaBase } from "./embalagens/contas";
import { EmbalagensDoIngrediente } from "./embalagens/EmbalagensDoIngrediente";
import { ProvedorDoCatalogo, usarCatalogo } from "./embalagens/usarCatalogo";
import { JanelaModal, usarPedirFechar } from "./JanelaModal";
import { AlergenicosDoIngrediente } from "./AlergenicosDoIngrediente";

type Opcao = { valor: string; texto: string };
type Conversao = { id: number; nome: string; quantidadeBase: string; ativo: boolean; modeloId?: number | null };
type Ingrediente = {
  id: number;
  nome: string;
  unidadeBase: string;
  unidadeExibicao: string;
  area: string;
  fornecedorId: number | null;
  fornecedor: string | null;
  ativo: boolean;
  conversoes: Conversao[];
  alergenicos: { codigo: string; tipo: "contem" | "tracos" }[];
  alergenicosConferidosEm: string | null;
  alergenicosConferidosPor: string | null;
  alergenicosNovosNaLista: string[];
};
type Lista = { ingredientes: Ingrediente[]; unidades: UnidadePadrao[] };
type Fornecedor = { id: number; nome: string; ativo: boolean };
type Mensagem = { tipo: "sucesso" | "perigo"; texto: string } | null;

/** Valores com que o formulário de novo ingrediente abre (ao duplicar). */
type Modelo = { nome: string; unidadeExibicao: string; area: string; fornecedorId: number | null; embalagens: (readonly [string, string])[] };

type Aba = "rapido" | "comum";
/** O que a janela mostra: adicionar (abas Rápido e Comum) ou editar um ingrediente que já existe. */
type Janela = { modo: "novo"; aba: Aba; modelo?: Modelo } | { modo: "editar"; id: number; abrirEmbalagens: boolean };

type Props = { areas: Opcao[]; podeGerenciar: boolean };

const BASE_DA_GRANDEZA: Record<string, string> = { massa: "g", volume: "ml", contagem: "un" };
/** Última aba usada na janela (só uma comodidade deste aparelho). */
const CHAVE_DA_ABA = "erp.ingredientes.aba";
const ABAS: { id: Aba; nome: string; texto: string }[] = [
  { id: "rapido", nome: "Rápido", texto: "Vários de uma vez, do catálogo pronto ou de uma lista colada." },
  { id: "comum", nome: "Comum", texto: "Um ingrediente por vez, digitando cada campo." },
];
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function lerAbaGuardada(): Aba {
  try {
    return window.localStorage.getItem(CHAVE_DA_ABA) === "comum" ? "comum" : "rapido";
  } catch {
    return "rapido";
  }
}
function guardarAba(aba: Aba) {
  try {
    window.localStorage.setItem(CHAVE_DA_ABA, aba);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/** Tecla de atalho só vale fora de campo de texto, sem modificador e sem janela aberta. */
function atalhoLivre(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (document.querySelector("dialog[open]")) return false;
  const alvo = e.target as HTMLElement | null;
  if (!alvo) return true;
  return !(alvo.isContentEditable || alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement);
}

export function Ingredientes({ areas, podeGerenciar }: Props) {
  const [dados, setDados] = useState<Lista | null>(null);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [areaFiltro, setAreaFiltro] = useState("");
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [janela, setJanela] = useState<Janela | null>(null);
  /** Abas da janela já abertas desta vez: continuam montadas (escondidas) para não perder o que foi digitado. */
  const [visitadas, setVisitadas] = useState<ReadonlySet<Aba>>(new Set());
  /** Há algo digitado na janela e ainda não gravado (fechar pergunta antes). */
  const [sujo, setSujo] = useState(false);
  /** O bloco de alergênicos mudou e ainda não foi conferido (fechar pergunta antes). */
  const [sujoAlergenicos, setSujoAlergenicos] = useState(false);
  /** "?ingrediente=ID" já foi atendido (abre a janela uma vez só). */
  const pedidoDoEndereco = useRef(false);
  /** Aviso dentro da janela (ex.: "salvar e cadastrar o próximo"). */
  const [avisoDaJanela, setAvisoDaJanela] = useState<Mensagem>(null);
  /** Ingredientes em destaque na lista (os novos ou o que acabou de ser salvo). */
  const [realce, setRealce] = useState<ReadonlySet<number>>(new Set());
  const conhecidos = useRef<Set<number> | null>(null);
  const novosNaJanela = useRef(0);
  /** Catálogo de embalagens, compartilhado por todos os blocos desta tela (formulário e cadastro rápido). */
  const catalogo = usarCatalogo();
  const recarregarCatalogo = catalogo.recarregar;
  const nomeDaArea = (a: string) => areas.find((x) => x.valor === a)?.texto ?? a;

  const carregar = useCallback(async () => {
    const [i, f] = await Promise.all([chamar<Lista>("/api/cadastros/ingredientes"), chamar<Fornecedor[]>("/api/cadastros/fornecedores")]);
    if (i.ok && i.dados) {
      // Quem apareceu agora (cadastrado na janela) fica em destaque na lista.
      const ids = i.dados.ingredientes.map((x) => x.id);
      const antes = conhecidos.current;
      const novos = antes ? ids.filter((id) => !antes.has(id)) : [];
      conhecidos.current = new Set(ids);
      setDados(i.dados);
      if (novos.length) {
        setRealce(new Set(novos));
        novosNaJanela.current += novos.length;
      }
    } else setMensagem({ tipo: "perigo", texto: i.mensagem });
    if (f.ok && f.dados) setFornecedores(f.dados);
  }, []);
  /** Depois de mexer nas embalagens de um ingrediente: a lista e o "em uso" do catálogo mudam. */
  const carregarTudo = useCallback(async () => {
    await Promise.all([carregar(), recarregarCatalogo()]);
  }, [carregar, recarregarCatalogo]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrir = useCallback((nova: Janela) => {
    setMensagem(null);
    setAvisoDaJanela(null);
    setSujo(false);
    setSujoAlergenicos(false);
    setRealce(new Set());
    novosNaJanela.current = 0;
    setVisitadas(new Set(nova.modo === "novo" ? [nova.aba] : []));
    setJanela(nova);
  }, []);
  const abrirNovo = useCallback(() => abrir({ modo: "novo", aba: lerAbaGuardada() }), [abrir]);

  /** Fecha a janela de vez. Sem texto próprio, avisa quantos ingredientes novos entraram na lista. */
  const fechar = useCallback((texto?: string) => {
    const novos = novosNaJanela.current;
    novosNaJanela.current = 0;
    setJanela(null);
    setSujo(false);
    setSujoAlergenicos(false);
    setAvisoDaJanela(null);
    if (texto) setMensagem({ tipo: "sucesso", texto });
    else if (novos > 0) setMensagem({ tipo: "sucesso", texto: `${plural(novos, "ingrediente novo", "ingredientes novos")} na lista, em destaque.` });
  }, []);

  function trocarAba(aba: Aba) {
    guardarAba(aba);
    setVisitadas((v) => new Set([...v, aba]));
    setJanela((j) => (j?.modo === "novo" ? { ...j, aba } : j));
  }

  // Atalho: tecla A abre a janela de adicionar (só quem pode gerenciar).
  useEffect(() => {
    if (!podeGerenciar) return;
    function aoTeclar(e: KeyboardEvent) {
      if (!atalhoLivre(e) || (e.key !== "a" && e.key !== "A")) return;
      e.preventDefault();
      abrirNovo();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [podeGerenciar, abrirNovo]);

  // "?ingrediente=ID" (vindo de "Conferir" numa ficha): abre a janela dele no bloco de alergênicos.
  // Quem só vê cadastros ganha o ingrediente em destaque na lista.
  useEffect(() => {
    if (!dados || pedidoDoEndereco.current) return;
    pedidoDoEndereco.current = true;
    let pedido: number;
    try {
      pedido = Number(new URLSearchParams(window.location.search).get("ingrediente"));
    } catch {
      return;
    }
    if (!Number.isSafeInteger(pedido) || pedido <= 0 || !dados.ingredientes.some((i) => i.id === pedido)) return;
    if (podeGerenciar) {
      abrir({ modo: "editar", id: pedido, abrirEmbalagens: false });
      window.setTimeout(() => {
        const bloco = document.getElementById("alergenicos-do-ingrediente");
        bloco?.scrollIntoView({ block: "start" });
        bloco?.querySelector<HTMLElement>("h3")?.focus();
      }, 50);
    } else setRealce(new Set([pedido]));
  }, [dados, podeGerenciar, abrir]);

  // Com a janela fechada, o primeiro destacado aparece na tela.
  useEffect(() => {
    if (janela || realce.size === 0) return;
    const primeiro = document.querySelector<HTMLElement>('[data-realce="sim"]');
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    primeiro?.scrollIntoView({ block: "nearest", behavior: calmo ? "auto" : "smooth" });
  }, [janela, realce]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados?.ingredientes ?? []).filter(
      (i) => (!termo || i.nome.toLowerCase().includes(termo)) && (!areaFiltro || i.area === areaFiltro),
    );
  }, [dados, busca, areaFiltro]);

  const dica = (dados?.unidades ?? [])
    .filter((u) => u.fator !== "1")
    .map((u) => ({ codigo: u.codigo, fator: u.fator, base: BASE_DA_GRANDEZA[u.grandeza] ?? "" }));

  const nomesExistentes = useMemo(() => new Set((dados?.ingredientes ?? []).filter((i) => i.ativo).map((i) => chaveDeBusca(i.nome))), [dados]);

  const emEdicao = janela?.modo === "editar" ? dados?.ingredientes.find((i) => i.id === janela.id) : undefined;

  const formulario = (ingrediente?: Ingrediente, modelo?: Modelo, abrirEmbalagens = false) => (
    <FormularioIngrediente
      ingrediente={ingrediente}
      modelo={modelo}
      areas={areas}
      unidades={dados?.unidades ?? []}
      fornecedores={fornecedores}
      nomesExistentes={nomesExistentes}
      aoSalvar={async (id, texto) => {
        await carregar();
        setRealce(new Set([id]));
        fechar(texto);
      }}
      aoSalvarEProximo={async (texto) => {
        await carregar();
        setSujo(false);
        setAvisoDaJanela({ tipo: "sucesso", texto });
      }}
      aoMudarConversao={carregarTudo}
      aoGravarAlergenicos={async (texto) => {
        await carregar();
        setAvisoDaJanela({ tipo: "sucesso", texto });
      }}
      aoSujoAlergenicos={setSujoAlergenicos}
      abrirEmbalagens={abrirEmbalagens}
      unidadeDoEstoque={ingrediente ? { base: ingrediente.unidadeBase, exibicao: ingrediente.unidadeExibicao } : undefined}
    />
  );

  return (
    <ProvedorDoCatalogo catalogo={catalogo}>
      <div className="ingredientes__topo">
        <h1>Ingredientes</h1>
        {podeGerenciar && (
          <div className="ingredientes__acoes">
            <Link className="erp-botao erp-botao--secundario" href="/cadastros/importar?tipo=ingredientes">
              <Icone nome="documento" />
              Importar planilha
            </Link>
            <Botao className="ingredientes__adicionar" aria-keyshortcuts="A" title="Atalho: tecla A" onClick={abrirNovo}>
              <Icone nome="mais" />
              Adicionar ingrediente
            </Botao>
          </div>
        )}
      </div>
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      <BotaoExemplos />
      <Cartao>
        <div className="cadastros__filtros">
          <Campo
            rotulo="Buscar por nome"
            explicacao="Digite uma parte do nome para achar o ingrediente na lista."
            exemplo="Digite fari e aparece Farinha de trigo."
            value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
          <Selecao
            rotulo="Filtrar por área"
            explicacao="Mostra só os ingredientes de um setor da casa. Deixe em Todas as áreas para ver tudo."
            exemplo="Escolha Cozinha para esconder o que é do bar ou da cafeteria."
            value={areaFiltro}
            onChange={(e) => setAreaFiltro(e.target.value)}
            opcoes={[{ valor: "", texto: "Todas as áreas" }, ...areas]}
          />
        </div>
      </Cartao>
      {!dados ? (
        !mensagem && <p>Carregando...</p>
      ) : visiveis.length === 0 ? (
        <p>Nenhum ingrediente encontrado.</p>
      ) : (
        <ul className="lista-simples" data-testid="lista-ingredientes" aria-label="Ingredientes">
          {visiveis.map((i) => (
            <li
              key={i.id}
              data-testid={`ingrediente-${i.nome}`}
              data-realce={realce.has(i.id) ? "sim" : undefined}
              className={realce.has(i.id) ? "ingredientes__realce" : undefined}
            >
              <ItemDeLista
                titulo={i.nome}
                ativo={i.ativo}
                acoes={
                  podeGerenciar && (
                    <>
                      <Botao variante="secundario" aria-label={`Editar ${i.nome}`} onClick={() => abrir({ modo: "editar", id: i.id, abrirEmbalagens: false })}>
                        Editar
                      </Botao>
                      <Botao
                        variante="secundario"
                        aria-label={`Duplicar ${i.nome}`}
                        onClick={() =>
                          abrir({
                            modo: "novo",
                            aba: "comum",
                            modelo: {
                              nome: `${i.nome} (cópia)`,
                              unidadeExibicao: i.unidadeExibicao,
                              area: i.area,
                              fornecedorId: i.fornecedorId,
                              embalagens: i.conversoes.filter((c) => c.ativo).map((c) => [c.nome, c.quantidadeBase] as const),
                            },
                          })
                        }
                      >
                        Duplicar
                      </Botao>
                    </>
                  )
                }
              >
                <ResumoDoItem
                  unidadeBase={i.unidadeBase}
                  unidadeExibicao={i.unidadeExibicao}
                  area={i.area}
                  nomeDaArea={nomeDaArea}
                  fornecedor={i.fornecedor}
                  mostrarFornecedor
                  embalagens={i.conversoes.filter((c) => c.ativo).map((c) => ({ chave: c.id, nome: c.nome, quantidade: c.quantidadeBase }))}
                  acaoDasEmbalagens={
                    podeGerenciar && i.conversoes.filter((c) => c.ativo).length === 0 ? (
                      <div>
                        <Botao
                          variante="secundario"
                          aria-label={`Adicionar embalagem a ${i.nome}`}
                          onClick={() => abrir({ modo: "editar", id: i.id, abrirEmbalagens: true })}
                        >
                          Adicionar embalagem
                        </Botao>
                      </div>
                    ) : undefined
                  }
                />
              </ItemDeLista>
            </li>
          ))}
        </ul>
      )}
      {dica.length > 0 && (
        <Cartao>
          <div className="cadastros__dica">
            <p>Estas unidades já convertem sozinhas, não precisa cadastrar:</p>
            <GrupoDeChips rotulo="Unidades que já convertem sozinhas">
              {dica.map((u) => (
                <ChipDeEmbalagem key={u.codigo} nome={`1 ${u.codigo}`} quantidade={u.fator} unidade={u.base} />
              ))}
            </GrupoDeChips>
            <p>Para caixa, saco, pacote e outras embalagens de compra, use o bloco Embalagens de compra do ingrediente (o catálogo fica em Cadastros, Embalagens).</p>
          </div>
        </Cartao>
      )}

      {podeGerenciar && janela?.modo === "novo" && (
        <JanelaModal
          titulo="Adicionar ingrediente"
          sujo={sujo}
          aoMexer={() => setSujo(true)}
          aoFechar={() => fechar()}
          data-testid="janela-ingrediente"
          topo={
            <div role="tablist" aria-label="Jeito de adicionar" className="janela__abas">
              {ABAS.map((a, n) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  id={`janela-aba-${a.id}`}
                  aria-selected={janela.aba === a.id}
                  aria-controls={`janela-painel-${a.id}`}
                  aria-labelledby={`janela-aba-${a.id}-nome`}
                  aria-describedby={`janela-aba-${a.id}-texto`}
                  tabIndex={janela.aba === a.id ? 0 : -1}
                  className="janela__aba"
                  onClick={() => trocarAba(a.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    const outra = ABAS[(n + 1) % ABAS.length]!;
                    trocarAba(outra.id);
                    document.getElementById(`janela-aba-${outra.id}`)?.focus();
                  }}
                >
                  <span id={`janela-aba-${a.id}-nome`} className="janela__aba-nome">
                    {a.nome}
                  </span>
                  <span id={`janela-aba-${a.id}-texto`} className="janela__aba-texto">
                    {a.texto}
                  </span>
                </button>
              ))}
            </div>
          }
        >
          <BotaoExemplos />
          <div role="tabpanel" id="janela-painel-rapido" aria-labelledby="janela-aba-rapido" hidden={janela.aba !== "rapido"}>
            {visitadas.has("rapido") && (
              <CadastroRapido
                areas={areas}
                unidades={dados?.unidades ?? []}
                aoGravar={async () => {
                  await carregarTudo();
                  setSujo(false);
                }}
              />
            )}
          </div>
          <div role="tabpanel" id="janela-painel-comum" aria-labelledby="janela-aba-comum" hidden={janela.aba !== "comum"}>
            <div aria-live="polite">{avisoDaJanela && <Aviso tipo={avisoDaJanela.tipo}>{avisoDaJanela.texto}</Aviso>}</div>
            {visitadas.has("comum") && formulario(undefined, janela.modelo)}
          </div>
        </JanelaModal>
      )}
      {podeGerenciar && janela?.modo === "editar" && emEdicao && (
        <JanelaModal titulo={`Editar ${emEdicao.nome}`} sujo={sujo || sujoAlergenicos} aoMexer={() => setSujo(true)} aoFechar={() => fechar()} data-testid="janela-ingrediente">
          <BotaoExemplos />
          <div aria-live="polite">{avisoDaJanela && <Aviso tipo={avisoDaJanela.tipo}>{avisoDaJanela.texto}</Aviso>}</div>
          {formulario(emEdicao, undefined, janela.abrirEmbalagens)}
        </JanelaModal>
      )}
    </ProvedorDoCatalogo>
  );
}

const ID_NOME = "ingrediente-nome";

function FormularioIngrediente({
  ingrediente,
  modelo,
  areas,
  unidades,
  fornecedores,
  nomesExistentes,
  unidadeDoEstoque,
  aoSalvar,
  aoSalvarEProximo,
  aoMudarConversao,
  aoGravarAlergenicos,
  aoSujoAlergenicos,
  abrirEmbalagens,
}: {
  ingrediente?: Ingrediente;
  modelo?: Modelo;
  areas: Opcao[];
  unidades: UnidadePadrao[];
  fornecedores: Fornecedor[];
  nomesExistentes: ReadonlySet<string>;
  unidadeDoEstoque?: { base: string; exibicao: string };
  /** Gravou: a janela fecha e a lista mostra o texto. */
  aoSalvar: (id: number, texto: string) => Promise<void>;
  /** Gravou e a janela continua aberta para o próximo. */
  aoSalvarEProximo: (texto: string) => Promise<void>;
  aoMudarConversao: () => Promise<void>;
  aoGravarAlergenicos: (texto: string) => Promise<void>;
  aoSujoAlergenicos: (sujo: boolean) => void;
  abrirEmbalagens?: boolean;
}) {
  const pedirFechar = usarPedirFechar();
  const [nome, setNome] = useState(ingrediente?.nome ?? modelo?.nome ?? "");
  /** Como a pessoa vê a quantidade (kg, g, l, ml, un, dz); a unidade de dentro sai dela. */
  const [unidadeExibicao, setUnidadeExibicao] = useState(ingrediente?.unidadeExibicao ?? modelo?.unidadeExibicao ?? "kg");
  const unidadeBase = ingrediente?.unidadeBase ?? baseDaUnidade(unidadeExibicao) ?? "g";
  const [area, setArea] = useState(ingrediente?.area ?? modelo?.area ?? areas[0]?.valor ?? "cozinha");
  const [fornecedorId, setFornecedorId] = useState(String(ingrediente?.fornecedorId ?? modelo?.fornecedorId ?? ""));
  const [ativo, setAtivo] = useState(ingrediente?.ativo ?? true);
  /** Embalagens do ingrediente NOVO (no que já existe, as conversões são salvas uma a uma, abaixo). */
  const [embalagens, setEmbalagens] = useState<LinhaDeEmbalagem[]>(() => embalagensDe(modelo?.embalagens ?? []));
  const [sugerido, setSugerido] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Cópia de outro ingrediente: o nome já vem selecionado para a pessoa só digitar por cima.
  useEffect(() => {
    if (!modelo) return;
    // Espera a janela abrir (o campo só pega o foco com ela aberta).
    const espera = window.setTimeout(() => {
      const campo = document.getElementById(ID_NOME) as HTMLInputElement | null;
      campo?.focus();
      campo?.select();
    }, 0);
    return () => window.clearTimeout(espera);
  }, [modelo]);

  // Só fornecedores ativos; o do próprio ingrediente continua aparecendo se foi desativado depois.
  const opcoesFornecedor: Opcao[] = [
    { valor: "", texto: "Sem fornecedor" },
    ...fornecedores
      .filter((f) => f.ativo || f.id === ingrediente?.fornecedorId)
      .map((f) => ({ valor: String(f.id), texto: f.ativo ? f.nome : `${f.nome} (inativo)` })),
  ];
  const nomeDaArea = (a: string) => areas.find((x) => x.valor === a)?.texto ?? a;

  function aplicarSugestao(i: ItemDoCatalogo) {
    setNome(i.nome);
    // Sugestão do catálogo não traz escolha: a exibição é a unidade de dentro (a pessoa pode trocar).
    setUnidadeExibicao(i.unidadeBase);
    setArea(i.area);
    setEmbalagens(embalagensDe(i.embalagens));
    setSugerido(`Sugestão aplicada: ${i.nome}, estoque em ${unidadePorExtenso(i.unidadeBase)}, ${nomeDaArea(i.area)}. Confira a unidade, a área e as embalagens antes de gravar.`);
  }

  async function enviar(proximo: boolean) {
    setErro("");
    if (ingrediente) {
      setEnviando(true);
      const r = await chamar<{ id: number }>("/api/cadastros/ingredientes", "POST", {
        id: ingrediente.id,
        unidadeExibicao,
        nome,
        area,
        fornecedorId: fornecedorId ? Number(fornecedorId) : null,
        ativo,
      });
      setEnviando(false);
      if (!r.ok || !r.dados) return setErro(r.mensagem);
      return aoSalvar(r.dados.id, "Ingrediente salvo.");
    }
    const faltas = faltaNasEmbalagens({ nome, unidadeBase: unidadeBase as UnidadeBase, unidadeExibicao, area, embalagens });
    if (faltas.length) return setErro(faltas[0]!);
    setEnviando(true);
    // Criação sempre pelo cadastro em lote (um item): grava o ingrediente e as embalagens de uma vez, tudo ou nada.
    const r = await chamar<{ criados: number; ids: number[] }>("/api/cadastros/ingredientes/lote", "POST", [
      itemParaServidor({ nome, unidadeBase: unidadeBase as UnidadeBase, unidadeExibicao, area, embalagens }, fornecedorId ? Number(fornecedorId) : null),
    ]);
    setEnviando(false);
    const id = r.dados?.ids?.[0];
    if (!r.ok || id === undefined) return setErro(r.mensagem);
    const gravado = nome.trim();
    if (!proximo) return aoSalvar(id, `Ingrediente criado: ${gravado}. Ele está em destaque na lista.`);
    // Salvar e cadastrar o próximo: limpa o que é de cada ingrediente, mantém unidade e área.
    setNome("");
    setEmbalagens([]);
    setFornecedorId("");
    setSugerido("");
    await aoSalvarEProximo(`Ingrediente "${gravado}" criado. Pode cadastrar o próximo.`);
    document.getElementById(ID_NOME)?.focus();
  }

  return (
    <div className="ingredientes__form">
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {sugerido && !ingrediente && (
        <div aria-live="polite">
          <Aviso tipo="info">{sugerido}</Aviso>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(false);
        }}
        noValidate
      >
        <div className="cadastros__form-linha">
          <CampoNomeComSugestao
            id={ID_NOME}
            valor={nome}
            aoMudar={(v) => {
              setNome(v);
              setSugerido("");
            }}
            aoEscolher={aplicarSugestao}
            jaCadastrados={nomesExistentes}
            nomeDaArea={nomeDaArea}
            ativa={!ingrediente}
          />
          <Selecao
            rotulo="Unidade do estoque"
            explicacao={EXPLICACAO_DA_UNIDADE}
            exemplo={EXEMPLO_DA_UNIDADE}
            value={unidadeExibicao}
            onChange={(e) => {
              const codigo = e.target.value;
              const novaBase = baseDaUnidade(codigo);
              if (!ingrediente && novaBase) setEmbalagens((l) => ajustarLinhasParaBase(l, unidadeBase as UnidadeBase, novaBase, unidades));
              setUnidadeExibicao(codigo);
            }}
            opcoes={unidadeDoEstoque ? opcoesDaFamilia(unidadeDoEstoque.base) : OPCOES_DA_UNIDADE}
          />
          <Selecao
            rotulo="Área"
            explicacao="O setor onde o ingrediente é usado e guardado."
            exemplo="Cozinha para farinha e ovo. Bar para café em grão."
            value={area} onChange={(e) => setArea(e.target.value)} opcoes={areas} />
          <Selecao
            rotulo="Fornecedor"
            explicacao="De quem você costuma comprar. Pode deixar sem fornecedor e escolher depois."
            exemplo="Distribuidora Boa Safra (nome inventado). Cadastre antes em Fornecedores."
            value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} opcoes={opcoesFornecedor} />
        </div>
        {!ingrediente && (
          <EmbalagensDoIngrediente
            modo="local"
            linhas={embalagens}
            aoMudar={setEmbalagens}
            base={unidadeBase as UnidadeBase}
            exibicao={unidadeExibicao}
            unidades={unidades}
            fornecedorId={fornecedorId ? Number(fornecedorId) : null}
          />
        )}
        {ingrediente && (
          <Marcador
            rotulo="Ativo (desmarque para tirar de uso; nada é apagado)"
            explicacao="Marcado, o ingrediente aparece para uso. Desmarcado, deixa de ser usado, mas o histórico fica guardado."
            exemplo="Desmarque um ingrediente que a casa parou de comprar."
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
          />
        )}
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={enviando}>
            {ingrediente ? "Salvar ingrediente" : "Criar ingrediente"}
          </Botao>
          {!ingrediente && (
            <Botao variante="secundario" disabled={enviando} onClick={() => void enviar(true)}>
              Salvar e cadastrar o próximo
            </Botao>
          )}
          <Botao variante="secundario" onClick={pedirFechar}>
            Cancelar
          </Botao>
        </div>
      </form>
      {ingrediente && (
        <EmbalagensDoIngrediente
          modo="servidor"
          ingredienteId={ingrediente.id}
          conversoes={ingrediente.conversoes}
          aoMudar={aoMudarConversao}
          base={ingrediente.unidadeBase as UnidadeBase}
          exibicao={unidadeExibicao}
          unidades={unidades}
          fornecedorId={fornecedorId ? Number(fornecedorId) : null}
          abertoNoInicio={abrirEmbalagens}
        />
      )}
      {ingrediente && <AlergenicosDoIngrediente key={ingrediente.alergenicosConferidosEm ?? "nao"} ingrediente={ingrediente} aoGravado={aoGravarAlergenicos} aoSujo={aoSujoAlergenicos} />}
    </div>
  );
}
