"use client";

import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Campo, Cartao, Etiqueta } from "@erp/interface";
import { chamar } from "../../chamar";

type Fornecedor = {
  id: number;
  nome: string;
  documento: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  prazoEntregaDias: number | null;
  observacao: string | null;
  ativo: boolean;
};
type Mensagem = { tipo: "sucesso" | "perigo"; texto: string } | null;

export function Fornecedores({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [lista, setLista] = useState<Fornecedor[] | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  /** "novo" = criação; número = id em edição. */
  const [editando, setEditando] = useState<"novo" | number | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamar<Fornecedor[]>("/api/cadastros/fornecedores");
    if (r.ok && r.dados) setLista(r.dados);
    else setMensagem({ tipo: "perigo", texto: r.mensagem });
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const emEdicao = typeof editando === "number" ? lista?.find((f) => f.id === editando) : undefined;

  return (
    <>
      <h1>Fornecedores</h1>
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      {podeGerenciar && editando === null && (
        <p>
          <Botao
            onClick={() => {
              setMensagem(null);
              setEditando("novo");
            }}
          >
            Novo fornecedor
          </Botao>
        </p>
      )}
      {podeGerenciar && editando !== null && (editando === "novo" || emEdicao) && (
        <FormularioFornecedor
          key={editando === "novo" ? "novo" : emEdicao!.id}
          fornecedor={emEdicao}
          aoSalvar={async (texto) => {
            await carregar();
            setMensagem({ tipo: "sucesso", texto });
            setEditando(null);
          }}
          aoFechar={() => setEditando(null)}
        />
      )}
      {!lista ? (
        !mensagem && <p>Carregando...</p>
      ) : lista.length === 0 ? (
        <p>Nenhum fornecedor cadastrado.</p>
      ) : (
        <ul className="lista-simples" data-testid="lista-fornecedores" aria-label="Fornecedores">
          {lista.map((f) => (
            <li key={f.id} data-testid={`fornecedor-${f.nome}`}>
              <Cartao>
                <h2>
                  {f.nome} {!f.ativo && <Etiqueta>inativo</Etiqueta>}
                </h2>
                <p>
                  {[f.contato, f.telefone, f.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
                  {f.prazoEntregaDias !== null && ` · Entrega em ${f.prazoEntregaDias} ${f.prazoEntregaDias === 1 ? "dia" : "dias"}`}
                </p>
                {f.documento && <p>CPF/CNPJ: {f.documento}</p>}
                {f.observacao && <p className="cadastros__dica">{f.observacao}</p>}
                {podeGerenciar && (
                  <p>
                    <Botao
                      variante="secundario"
                      aria-label={`Editar ${f.nome}`}
                      onClick={() => {
                        setMensagem(null);
                        setEditando(f.id);
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

function FormularioFornecedor({
  fornecedor,
  aoSalvar,
  aoFechar,
}: {
  fornecedor?: Fornecedor;
  aoSalvar: (texto: string) => Promise<void>;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(fornecedor?.nome ?? "");
  const [documento, setDocumento] = useState(fornecedor?.documento ?? "");
  const [contato, setContato] = useState(fornecedor?.contato ?? "");
  const [telefone, setTelefone] = useState(fornecedor?.telefone ?? "");
  const [email, setEmail] = useState(fornecedor?.email ?? "");
  const [prazo, setPrazo] = useState(fornecedor?.prazoEntregaDias !== null && fornecedor ? String(fornecedor.prazoEntregaDias) : "");
  const [observacao, setObservacao] = useState(fornecedor?.observacao ?? "");
  const [ativo, setAtivo] = useState(fornecedor?.ativo ?? true);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (prazo.trim() !== "" && !/^\d+$/.test(prazo.trim())) return setErro("O prazo de entrega é um número de dias (0 a 90).");
    setEnviando(true);
    const r = await chamar("/api/cadastros/fornecedores", "POST", {
      id: fornecedor?.id,
      nome,
      documento: documento.trim() || null,
      contato,
      telefone,
      email,
      prazoEntregaDias: prazo.trim() === "" ? null : Number(prazo),
      observacao,
      ativo,
    });
    setEnviando(false);
    if (!r.ok) return setErro(r.mensagem);
    await aoSalvar(fornecedor ? "Fornecedor salvo." : "Fornecedor criado.");
  }

  return (
    <Cartao>
      <h2>{fornecedor ? `Editar ${fornecedor.nome}` : "Novo fornecedor"}</h2>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <form onSubmit={enviar} noValidate>
        <div className="cadastros__form-linha">
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" required />
          <Campo rotulo="CPF ou CNPJ" value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" autoComplete="off" />
          <Campo rotulo="Contato (pessoa)" value={contato} onChange={(e) => setContato(e.target.value)} autoComplete="off" />
          <Campo rotulo="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} type="tel" autoComplete="off" />
          <Campo rotulo="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" />
          <Campo rotulo="Prazo de entrega (dias)" value={prazo} onChange={(e) => setPrazo(e.target.value)} inputMode="numeric" autoComplete="off" />
        </div>
        <Campo rotulo="Observação" value={observacao} onChange={(e) => setObservacao(e.target.value)} autoComplete="off" />
        {fornecedor && (
          <label className="cadastros__opcao">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativo (desmarque para tirar de uso; nada é apagado)
          </label>
        )}
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={enviando}>
            {fornecedor ? "Salvar fornecedor" : "Criar fornecedor"}
          </Botao>
          <Botao variante="secundario" onClick={aoFechar}>
            {fornecedor ? "Fechar" : "Cancelar"}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}
