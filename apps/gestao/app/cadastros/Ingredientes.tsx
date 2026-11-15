"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aviso, Botao, Cartao, ChipDeEmbalagem, GrupoDeChips, ItemDeLista } from "@erp/interface";
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
};
type Lista = { ingredientes: Ingrediente[]; unidades: UnidadePadrao[] };
type Fornecedor = { id: number; nome: string; ativo: boolean };
type Mensagem = { tipo: "sucesso" | "perigo"; texto: string } | null;

/** Valores com que o formulário de novo ingrediente abre (ao duplicar). */
type Modelo = { nome: string; unidadeExibicao: string; area: string; fornecedorId: number | null; embalagens: (readonly [string, string])[] };

type Props = { areas: Opcao[]; podeGerenciar: boolean };

const BASE_DA_GRANDEZA: Record<string, string> = { massa: "g", volume: "ml", contagem: "un" };

export function Ingredientes({ areas, podeGerenciar }: Props) {
  const [dados, setDados] = useState<Lista | null>(null);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [areaFiltro, setAreaFiltro] = useState("");
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  /** "novo" = formulário de criação; número = id do ingrediente em edição. */
  const [editando, setEditando] = useState<"novo" | number | null>(null);
  /** Painel do cadastro rápido (catálogo pronto e lista colada). */
  const [rapido, setRapido] = useState(false);
  /** Ingrediente copiado para o formulário de novo (botão Duplicar). */
  const [modelo, setModelo] = useState<{ valores: Modelo; numero: number } | null>(null);
  /** Abrir o ingrediente já com o bloco de embalagens aberto (botão "Adicionar embalagem" da lista). */
  const [abrirEmbalagens, setAbrirEmbalagens] = useState(false);
  /** Catálogo de embalagens, compartilhado por todos os blocos desta tela (formulário e cadastro rápido). */
  const catalogo = usarCatalogo();
  const recarregarCatalogo = catalogo.recarregar;
  const nomeDaArea = (a: string) => areas.find((x) => x.valor === a)?.texto ?? a;

  const carregar = useCallback(async () => {
    const [i, f] = await Promise.all([chamar<Lista>("/api/cadastros/ingredientes"), chamar<Fornecedor[]>("/api/cadastros/fornecedores")]);
    if (i.ok && i.dados) setDados(i.dados);
    else setMensagem({ tipo: "perigo", texto: i.mensagem });
    if (f.ok && f.dados) setFornecedores(f.dados);
  }, []);
  /** Depois de mexer nas embalagens de um ingrediente: a lista e o "em uso" do catálogo mudam. */
  const carregarTudo = useCallback(async () => {
    await Promise.all([carregar(), recarregarCatalogo()]);
  }, [carregar, recarregarCatalogo]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

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

  const emEdicao = typeof editando === "number" ? dados?.ingredientes.find((i) => i.id === editando) : undefined;

  return (
    <ProvedorDoCatalogo catalogo={catalogo}>
      <h1>Ingredientes</h1>
      <BotaoExemplos />
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      {podeGerenciar && editando === null && !rapido && (
        <p className="cadastros__botoes">
          <Botao
            onClick={() => {
              setMensagem(null);
              setRapido(true);
            }}
          >
            Cadastro rápido
          </Botao>
          <Botao
            variante="secundario"
            onClick={() => {
              setMensagem(null);
              setModelo(null);
              setEditando("novo");
            }}
          >
            Novo ingrediente
          </Botao>
        </p>
      )}
      {podeGerenciar && rapido && editando === null && (
        <CadastroRapido
          areas={areas}
          unidades={dados?.unidades ?? []}
          aoGravar={carregarTudo}
          aoFechar={() => setRapido(false)}
        />
      )}
      {podeGerenciar && editando !== null && (editando === "novo" || emEdicao) && (
        <FormularioIngrediente
          key={editando === "novo" ? `novo-${modelo?.numero ?? 0}` : emEdicao!.id}
          ingrediente={emEdicao}
          modelo={editando === "novo" ? modelo?.valores : undefined}
          areas={areas}
          unidades={dados?.unidades ?? []}
          fornecedores={fornecedores}
          nomesExistentes={nomesExistentes}
          aoSalvar={async (id, texto) => {
            await carregar();
            setMensagem({ tipo: "sucesso", texto });
            setEditando(id);
          }}
          aoSalvarEProximo={async (texto) => {
            await carregar();
            setMensagem({ tipo: "sucesso", texto });
          }}
          aoMudarConversao={carregarTudo}
          abrirEmbalagens={abrirEmbalagens}
          aoFechar={() => {
            setModelo(null);
            setEditando(null);
            setAbrirEmbalagens(false);
          }}
          unidadeDoEstoque={emEdicao ? { base: emEdicao.unidadeBase, exibicao: emEdicao.unidadeExibicao } : undefined}
        />
      )}
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
        {dica.length > 0 && (
          <div className="cadastros__dica">
            <p>Estas unidades já convertem sozinhas, não precisa cadastrar:</p>
            <GrupoDeChips rotulo="Unidades que já convertem sozinhas">
              {dica.map((u) => (
                <ChipDeEmbalagem key={u.codigo} nome={`1 ${u.codigo}`} quantidade={u.fator} unidade={u.base} />
              ))}
            </GrupoDeChips>
            <p>Para caixa, saco, pacote e outras embalagens de compra, use o bloco Embalagens de compra do ingrediente (o catálogo fica em Cadastros, Embalagens).</p>
          </div>
        )}
      </Cartao>
      {!dados ? (
        !mensagem && <p>Carregando...</p>
      ) : visiveis.length === 0 ? (
        <p>Nenhum ingrediente encontrado.</p>
      ) : (
        <ul className="lista-simples" data-testid="lista-ingredientes" aria-label="Ingredientes">
          {visiveis.map((i) => (
            <li key={i.id} data-testid={`ingrediente-${i.nome}`}>
              <ItemDeLista
                titulo={i.nome}
                ativo={i.ativo}
                acoes={
                  podeGerenciar && (
                    <>
                      <Botao
                        variante="secundario"
                        aria-label={`Editar ${i.nome}`}
                        onClick={() => {
                          setMensagem(null);
                          setRapido(false);
                          setAbrirEmbalagens(false);
                          setEditando(i.id);
                        }}
                      >
                        Editar
                      </Botao>
                      <Botao
                        variante="secundario"
                        aria-label={`Duplicar ${i.nome}`}
                        onClick={() => {
                          setMensagem(null);
                          setRapido(false);
                          setModelo({
                            numero: (modelo?.numero ?? 0) + 1,
                            valores: {
                              nome: `${i.nome} (cópia)`,
                              unidadeExibicao: i.unidadeExibicao,
                              area: i.area,
                              fornecedorId: i.fornecedorId,
                              embalagens: i.conversoes.filter((c) => c.ativo).map((c) => [c.nome, c.quantidadeBase] as const),
                            },
                          });
                          setEditando("novo");
                        }}
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
                          onClick={() => {
                            setMensagem(null);
                            setRapido(false);
                            setAbrirEmbalagens(true);
                            setEditando(i.id);
                          }}
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
  abrirEmbalagens,
  aoFechar,
}: {
  ingrediente?: Ingrediente;
  modelo?: Modelo;
  areas: Opcao[];
  unidades: UnidadePadrao[];
  fornecedores: Fornecedor[];
  nomesExistentes: ReadonlySet<string>;
  unidadeDoEstoque?: { base: string; exibicao: string };
  aoSalvar: (id: number, texto: string) => Promise<void>;
  aoSalvarEProximo: (texto: string) => Promise<void>;
  aoMudarConversao: () => Promise<void>;
  abrirEmbalagens?: boolean;
  aoFechar: () => void;
}) {
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
  const montado = useRef(false);

  // Cópia de outro ingrediente: o nome já vem selecionado para a pessoa só digitar por cima.
  useEffect(() => {
    if (montado.current) return;
    montado.current = true;
    if (!modelo) return;
    const campo = document.getElementById(ID_NOME) as HTMLInputElement | null;
    campo?.focus();
    campo?.select();
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
    if (!proximo) return aoSalvar(id, "Ingrediente criado. Agora você pode cadastrar as conversões de compra (caixa, saco...).");
    // Salvar e cadastrar o próximo: limpa o que é de cada ingrediente, mantém unidade e área.
    const gravado = nome.trim();
    setNome("");
    setEmbalagens([]);
    setFornecedorId("");
    setSugerido("");
    await aoSalvarEProximo(`Ingrediente "${gravado}" criado. Pode cadastrar o próximo.`);
    document.getElementById(ID_NOME)?.focus();
  }

  return (
    <Cartao>
      <h2>{ingrediente ? `Editar ${ingrediente.nome}` : "Novo ingrediente"}</h2>
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
          <Botao variante="secundario" onClick={aoFechar}>
            {ingrediente ? "Fechar" : "Cancelar"}
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
    </Cartao>
  );
}
