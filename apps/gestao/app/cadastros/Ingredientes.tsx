"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso, Botao, Campo, Cartao, Etiqueta, Selecao } from "@erp/interface";
import { chamar } from "../chamar";

type Opcao = { valor: string; texto: string };
type Conversao = { id: number; nome: string; quantidadeBase: string; ativo: boolean };
type Ingrediente = {
  id: number;
  nome: string;
  unidadeBase: string;
  area: string;
  fornecedorId: number | null;
  fornecedor: string | null;
  ativo: boolean;
  conversoes: Conversao[];
};
type UnidadePadrao = { codigo: string; nome: string; grandeza: string; fator: string };
type Lista = { ingredientes: Ingrediente[]; unidades: UnidadePadrao[] };
type Fornecedor = { id: number; nome: string; ativo: boolean };
type Mensagem = { tipo: "sucesso" | "perigo"; texto: string } | null;

type Props = { areas: Opcao[]; unidadesBase: Opcao[]; podeGerenciar: boolean };

/** "12.5" vira "12,5" (como a pessoa escreve). */
const aparecer = (v: string) => v.replace(".", ",");
const BASE_DA_GRANDEZA: Record<string, string> = { massa: "g", volume: "ml", contagem: "un" };

export function Ingredientes({ areas, unidadesBase, podeGerenciar }: Props) {
  const [dados, setDados] = useState<Lista | null>(null);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [areaFiltro, setAreaFiltro] = useState("");
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  /** "novo" = formulário de criação; número = id do ingrediente em edição. */
  const [editando, setEditando] = useState<"novo" | number | null>(null);
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
    .map((u) => `1 ${u.codigo} = ${aparecer(u.fator)} ${BASE_DA_GRANDEZA[u.grandeza] ?? ""}`)
    .join(", ");

  const emEdicao = typeof editando === "number" ? dados?.ingredientes.find((i) => i.id === editando) : undefined;

  return (
    <>
      <h1>Ingredientes</h1>
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      {podeGerenciar && editando === null && (
        <p>
          <Botao
            onClick={() => {
              setMensagem(null);
              setEditando("novo");
            }}
          >
            Novo ingrediente
          </Botao>
        </p>
      )}
      {podeGerenciar && editando !== null && (editando === "novo" || emEdicao) && (
        <FormularioIngrediente
          key={editando === "novo" ? "novo" : emEdicao!.id}
          ingrediente={emEdicao}
          areas={areas}
          unidadesBase={unidadesBase}
          fornecedores={fornecedores}
          aoSalvar={async (id, texto) => {
            await carregar();
            setMensagem({ tipo: "sucesso", texto });
            setEditando(id);
          }}
          aoMudarConversao={carregar}
          aoFechar={() => setEditando(null)}
          unidadeDoEstoque={emEdicao?.unidadeBase}
        />
      )}
      <Cartao>
        <div className="cadastros__filtros">
          <Campo rotulo="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
          <Selecao
            rotulo="Filtrar por área"
            value={areaFiltro}
            onChange={(e) => setAreaFiltro(e.target.value)}
            opcoes={[{ valor: "", texto: "Todas as áreas" }, ...areas]}
          />
        </div>
        {dica && (
          <p className="cadastros__dica">
            Estas unidades já convertem sozinhas, não precisa cadastrar: {dica}. Para caixa, saco, pacote e outras unidades de compra, cadastre a conversão do ingrediente.
          </p>
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
              <Cartao>
                <h2>
                  {i.nome} {!i.ativo && <Etiqueta>inativo</Etiqueta>}
                </h2>
                <p>
                  Estoque em <strong>{i.unidadeBase}</strong> · {nomeDaArea(i.area)} · Fornecedor: {i.fornecedor ?? "sem fornecedor"}
                </p>
                {i.conversoes.filter((c) => c.ativo).length > 0 && (
                  <ul className="cadastros__conversoes" aria-label={`Conversões de ${i.nome}`}>
                    {i.conversoes
                      .filter((c) => c.ativo)
                      .map((c) => (
                        <li key={c.id}>
                          1 {c.nome} = {aparecer(c.quantidadeBase)} {i.unidadeBase}
                        </li>
                      ))}
                  </ul>
                )}
                {podeGerenciar && (
                  <p>
                    <Botao
                      variante="secundario"
                      aria-label={`Editar ${i.nome}`}
                      onClick={() => {
                        setMensagem(null);
                        setEditando(i.id);
                      }}
                    >
                      Editar
                    </Botao>
                  </p>
                )}
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FormularioIngrediente({
  ingrediente,
  areas,
  unidadesBase,
  fornecedores,
  unidadeDoEstoque,
  aoSalvar,
  aoMudarConversao,
  aoFechar,
}: {
  ingrediente?: Ingrediente;
  areas: Opcao[];
  unidadesBase: Opcao[];
  fornecedores: Fornecedor[];
  unidadeDoEstoque?: string;
  aoSalvar: (id: number, texto: string) => Promise<void>;
  aoMudarConversao: () => Promise<void>;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(ingrediente?.nome ?? "");
  const [unidadeBase, setUnidadeBase] = useState(ingrediente?.unidadeBase ?? unidadesBase[0]?.valor ?? "g");
  const [area, setArea] = useState(ingrediente?.area ?? areas[0]?.valor ?? "cozinha");
  const [fornecedorId, setFornecedorId] = useState(ingrediente?.fornecedorId ? String(ingrediente.fornecedorId) : "");
  const [ativo, setAtivo] = useState(ingrediente?.ativo ?? true);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Só fornecedores ativos; o do próprio ingrediente continua aparecendo se foi desativado depois.
  const opcoesFornecedor: Opcao[] = [
    { valor: "", texto: "Sem fornecedor" },
    ...fornecedores
      .filter((f) => f.ativo || f.id === ingrediente?.fornecedorId)
      .map((f) => ({ valor: String(f.id), texto: f.ativo ? f.nome : `${f.nome} (inativo)` })),
  ];

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const r = await chamar<{ id: number }>("/api/cadastros/ingredientes", "POST", {
      id: ingrediente?.id,
      nome,
      unidadeBase: ingrediente ? undefined : unidadeBase,
      area,
      fornecedorId: fornecedorId ? Number(fornecedorId) : null,
      ativo,
    });
    setEnviando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    await aoSalvar(r.dados.id, ingrediente ? "Ingrediente salvo." : "Ingrediente criado. Agora você pode cadastrar as conversões de compra (caixa, saco...).");
  }

  return (
    <Cartao>
      <h2>{ingrediente ? `Editar ${ingrediente.nome}` : "Novo ingrediente"}</h2>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <form onSubmit={enviar} noValidate>
        <div className="cadastros__form-linha">
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" required />
          {ingrediente ? (
            <div>
              <p className="cadastros__travado">
                Unidade do estoque: <strong>{unidadeDoEstoque}</strong> (não muda depois de criada)
              </p>
            </div>
          ) : (
            <Selecao rotulo="Unidade do estoque" value={unidadeBase} onChange={(e) => setUnidadeBase(e.target.value)} opcoes={unidadesBase} />
          )}
          <Selecao rotulo="Área" value={area} onChange={(e) => setArea(e.target.value)} opcoes={areas} />
          <Selecao rotulo="Fornecedor" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} opcoes={opcoesFornecedor} />
        </div>
        {ingrediente && (
          <label className="cadastros__opcao">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativo (desmarque para tirar de uso; nada é apagado)
          </label>
        )}
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={enviando}>
            {ingrediente ? "Salvar ingrediente" : "Criar ingrediente"}
          </Botao>
          <Botao variante="secundario" onClick={aoFechar}>
            {ingrediente ? "Fechar" : "Cancelar"}
          </Botao>
        </div>
      </form>
      {ingrediente && <Conversoes ingrediente={ingrediente} aoMudar={aoMudarConversao} />}
    </Cartao>
  );
}

function Conversoes({ ingrediente, aoMudar }: { ingrediente: Ingrediente; aoMudar: () => Promise<void> }) {
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
              <span>
                1 {c.nome} = {aparecer(c.quantidadeBase)} {ingrediente.unidadeBase} {!c.ativo && <Etiqueta>inativa</Etiqueta>}
              </span>
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
            <Campo rotulo="Unidade de compra (ex.: caixa)" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" required />
            <Campo
              rotulo={`Quantidade em ${ingrediente.unidadeBase} (aceita vírgula)`}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              required
            />
          </div>
          <p className="cadastros__dica" data-testid="ajuda-conversao">
            1 {nome.trim() || "[nome]"} = {quantidade.trim() || "[quantidade]"} {ingrediente.unidadeBase}
          </p>
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
