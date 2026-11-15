"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aviso, Botao, Cartao, ChipDeEmbalagem, GrupoDeChips, ItemDeLista } from "@erp/interface";
import { ContaDaEmbalagem, ResumoDoItem } from "./ResumoDoItem";
import { chaveDeBusca, type ItemDoCatalogo } from "@erp/dominio/catalogo";
import { BotaoExemplos, Campo, Marcador, Selecao } from "../Campo";
import { chamar } from "../chamar";
import { baseDaUnidade } from "@erp/dominio/unidades";
import { equivalenciaNaUnidade, unidadePorExtenso, type UnidadeBase, type UnidadePadrao } from "./auxiliares";
import { CadastroRapido } from "./CadastroRapido";
import { CampoNomeComSugestao } from "./CampoNomeComSugestao";
import { OPCOES_DA_UNIDADE, EXEMPLO_DA_UNIDADE, EXPLICACAO_DA_UNIDADE, opcoesDaFamilia, ConstrutorDeEmbalagem, LinhasDeEmbalagem, embalagensDe, faltaNasEmbalagens, itemParaServidor, novaChave, type LinhaDeEmbalagem } from "./Embalagens";

type Opcao = { valor: string; texto: string };
type Conversao = { id: number; nome: string; quantidadeBase: string; ativo: boolean };
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

/** "12.5" vira "12,5" (como a pessoa escreve). */
const aparecer = (v: string) => v.replace(".", ",");
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
  const nomeDaArea = (a: string) => areas.find((x) => x.valor === a)?.texto ?? a;

  const carregar = useCallback(async () => {
    const [i, f] = await Promise.all([chamar<Lista>("/api/cadastros/ingredientes"), chamar<Fornecedor[]>("/api/cadastros/fornecedores")]);
    if (i.ok && i.dados) setDados(i.dados);
    else setMensagem({ tipo: "perigo", texto: i.mensagem });
    if (f.ok && f.dados) setFornecedores(f.dados);
  }, []);
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
    <>
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
          aoGravar={carregar}
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
          aoMudarConversao={carregar}
          aoFechar={() => {
            setModelo(null);
            setEditando(null);
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
            <p>Para caixa, saco, pacote e outras unidades de compra, cadastre a conversão do ingrediente.</p>
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
    </>
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
            onChange={(e) => setUnidadeExibicao(e.target.value)}
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
          <section aria-label="Embalagens de compra">
            <h3>Embalagens de compra</h3>
            <p className="cadastros__dica">
              Opcional. Como o ingrediente vem do fornecedor (caixa, saco, pacote) e quanto vem em cada uma. Por dentro o estoque conta em {unidadeBase}; a quantidade de cada embalagem é escrita em {unidadeBase}.
            </p>
            <LinhasDeEmbalagem embalagens={embalagens} base={unidadeBase} exibicao={unidadeExibicao} aoMudar={setEmbalagens} />
            <ConstrutorDeEmbalagem
              key={unidadeExibicao}
              base={unidadeBase as UnidadeBase}
              exibicao={unidadeExibicao}
              unidades={unidades}
              aoMontar={(e) => setEmbalagens((l) => [...l, { chave: novaChave(), nome: e.nome, quantidade: e.quantidadeBase }])}
            />
          </section>
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
      {ingrediente && <Conversoes ingrediente={ingrediente} unidades={unidades} aoMudar={aoMudarConversao} />}
    </Cartao>
  );
}

function Conversoes({ ingrediente, unidades, aoMudar }: { ingrediente: Ingrediente; unidades: UnidadePadrao[]; aoMudar: () => Promise<void> }) {
  /** "nova" = adicionar; número = id da conversão em edição. */
  const [alvo, setAlvo] = useState<"nova" | number | null>(null);
  const [nome, setNome] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  function abrir(c?: Conversao) {
    setErro("");
    setOk("");
    setAlvo(c ? c.id : "nova");
    setNome(c?.nome ?? "");
    setQuantidade(c ? aparecer(c.quantidadeBase) : "");
    setAtivo(c?.ativo ?? true);
  }

  async function gravar(corpo: { id?: number; nome: string; quantidadeBase: string; ativo: boolean }, texto: string): Promise<boolean> {
    setErro("");
    setOk("");
    const r = await chamar(`/api/cadastros/ingredientes/${ingrediente.id}/conversoes`, "POST", corpo);
    if (!r.ok) {
      setErro(r.mensagem);
      return false;
    }
    setOk(texto);
    await aoMudar();
    return true;
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const feito = await gravar(
      { id: typeof alvo === "number" ? alvo : undefined, nome, quantidadeBase: quantidade, ativo },
      alvo === "nova" ? "Conversão adicionada." : "Conversão salva.",
    );
    if (feito) setAlvo(null);
  }

  return (
    <section aria-label="Conversões de compra">
      <h3>Conversões de compra</h3>
      <p className="cadastros__dica">
        Diz quanto vem em cada unidade de compra: 1 [nome] = [quantidade] {ingrediente.unidadeBase}. O estoque sempre conta em {ingrediente.unidadeBase}.
      </p>
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {ingrediente.conversoes.length === 0 ? (
        <p>Nenhuma conversão cadastrada.</p>
      ) : (
        <ul className="lista-simples" data-testid="conversoes-do-ingrediente">
          {ingrediente.conversoes.map((c) => (
            <li key={c.id} className="acoes__linha">
              <GrupoDeChips rotulo={`Conversão ${c.nome}`}>
                <ChipDeEmbalagem nome={c.nome} quantidade={c.quantidadeBase} unidade={ingrediente.unidadeBase} equivalencia={equivalenciaNaUnidade(c.quantidadeBase, ingrediente.unidadeBase, ingrediente.unidadeExibicao)} inativa={!c.ativo} />
              </GrupoDeChips>
              <span className="cadastros__botoes">
                <Botao variante="secundario" aria-label={`Editar a conversão ${c.nome}`} onClick={() => abrir(c)}>
                  Editar
                </Botao>
                <Botao
                  variante="secundario"
                  aria-label={`${c.ativo ? "Desativar" : "Ativar"} a conversão ${c.nome}`}
                  onClick={() =>
                    void gravar(
                      { id: c.id, nome: c.nome, quantidadeBase: c.quantidadeBase, ativo: !c.ativo },
                      c.ativo ? "Conversão desativada." : "Conversão ativada.",
                    )
                  }
                >
                  {c.ativo ? "Desativar" : "Ativar"}
                </Botao>
              </span>
            </li>
          ))}
        </ul>
      )}
      {alvo === null ? (
        <Botao variante="secundario" onClick={() => abrir()}>
          Adicionar conversão
        </Botao>
      ) : (
        <form onSubmit={enviar} noValidate aria-label="Conversão">
          <div className="cadastros__form-linha">
            <Campo
              rotulo="Unidade de compra (ex.: caixa)"
              explicacao="Como o ingrediente vem do fornecedor: o nome da embalagem."
              exemplo="caixa, saco, pacote, fardo."
              value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" required />
            <Campo
              rotulo={`Quantidade em ${ingrediente.unidadeBase} (aceita vírgula)`}
              explicacao={`Quantas ${ingrediente.unidadeBase} cabem em 1 unidade de compra. O estoque conta sempre em ${ingrediente.unidadeBase}.`}
              exemplo="caixa = 30 (1 caixa tem 30 ovos, estoque em un). Saco de 25 kg = 25000 (estoque em g)."
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              required
            />
          </div>
          <ConstrutorDeEmbalagem
            key={ingrediente.unidadeBase}
            base={ingrediente.unidadeBase as UnidadeBase}
            exibicao={ingrediente.unidadeExibicao}
            unidades={unidades}
            rotuloDoBotao="Usar esta embalagem nos campos acima"
            aoMontar={(e) => {
              setNome(e.nome);
              setQuantidade(aparecer(e.quantidadeBase));
            }}
          />
          <ContaDaEmbalagem nome={nome} quantidade={quantidade} base={ingrediente.unidadeBase} exibicao={ingrediente.unidadeExibicao} data-testid="ajuda-conversao" />
          <div className="cadastros__botoes">
            <Botao type="submit">{alvo === "nova" ? "Adicionar conversão" : "Salvar conversão"}</Botao>
            <Botao variante="secundario" onClick={() => setAlvo(null)}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}
    </section>
  );
}
