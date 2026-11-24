"use client";

/**
 * Aba "Alergênicos" do painel de fichas (S1, decisão 0026): o catálogo que os ingredientes usam.
 * Quem gerencia cadastros adiciona (o código sai do nome: `codigoDeAlergenico`), edita nome e
 * descrição, desativa e reativa (POST /api/cadastros/alergenicos). Nada se apaga. Quem só vê lê a lista.
 * O servidor confere a permissão de novo em cada gravação.
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao, Selo } from "@erp/interface";
import type { Alergenico } from "@erp/dominio";
import { codigoDeAlergenico } from "@erp/dominio/fichas";
import { chamar } from "../../chamar";
import { Campo } from "../../Campo";
import { TF } from "./textos";

const A = TF.alergenicos;

function Formulario({
  alergenico,
  aoFechar,
  aoSalvo,
}: {
  /** Sem alergênico: adicionar um novo. */
  alergenico?: Alergenico;
  aoFechar?: () => void;
  aoSalvo: (texto: string) => void;
}) {
  const [nome, setNome] = useState(alergenico?.nome ?? "");
  const [descricao, setDescricao] = useState(alergenico?.descricao ?? "");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const codigo = alergenico?.codigo ?? codigoDeAlergenico(nome);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!codigo) return setErro(A.codigoInvalido);
    setGravando(true);
    const r = await chamar<Alergenico>("/api/cadastros/alergenicos", "POST", {
      codigo,
      ...(alergenico ? {} : { novo: true }),
      nome,
      descricao: descricao.trim() ? descricao : null,
    });
    setGravando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    if (!alergenico) {
      setNome("");
      setDescricao("");
    }
    aoSalvo(alergenico ? A.salvo(r.dados.nome) : A.adicionado(r.dados.nome));
  }

  return (
    <form className="fichas-preco__form" onSubmit={(e) => void salvar(e)} noValidate data-testid={alergenico ? `editar-alergenico-${alergenico.codigo}` : "novo-alergenico"}>
      <div className="linha-editavel__numeros">
        <Campo rotulo={A.nome} explicacao={A.nomeAjuda} exemplo={A.nomeExemplo} value={nome} maxLength={60} autoComplete="off" onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo={A.descricao} explicacao={A.descricaoAjuda} exemplo={A.descricaoExemplo} value={descricao} maxLength={300} autoComplete="off" onChange={(e) => setDescricao(e.target.value)} />
      </div>
      {!alergenico && <p className="fichas-tabela__nota">{A.codigo(codigo)}</p>}
      <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
      <div className="cadastros__botoes">
        <Botao type="submit" disabled={gravando}>
          {alergenico ? A.salvar : A.adicionar}
        </Botao>
        {aoFechar && (
          <Botao variante="secundario" onClick={aoFechar}>
            {A.cancelar}
          </Botao>
        )}
      </div>
    </form>
  );
}

export function CatalogoDeAlergenicos({
  catalogo,
  podeGerenciar,
  aoMudar,
}: {
  catalogo: Alergenico[];
  podeGerenciar: boolean;
  /** Depois de gravar: recarrega o painel e mostra o aviso. */
  aoMudar: (texto: string) => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  async function mudarAtivo(a: Alergenico, ativo: boolean) {
    setErro("");
    const r = await chamar<Alergenico>("/api/cadastros/alergenicos", "POST", { codigo: a.codigo, ativo });
    if (!r.ok) return setErro(r.mensagem);
    aoMudar(ativo ? A.reativou(a.nome) : A.desativou(a.nome));
  }

  return (
    <div className="fichas-custos">
      <section className="hor-secao" aria-labelledby="fichas-alergenicos-catalogo">
        <h2 id="fichas-alergenicos-catalogo">{A.titulo}</h2>
        <p className="hor-secao__intro">{A.catalogoIntro}</p>
        {!podeGerenciar && <p className="hor-secao__intro">{A.soLer}</p>}
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        <ul className="fichas-precos" aria-label={A.titulo} data-testid="catalogo-de-alergenicos">
          {catalogo.map((a) => (
            <li key={a.codigo} className="fichas-preco" data-testid={`alergenico-${a.codigo}`}>
              <div className="fichas-preco__linha">
                <span className="fichas-preco__nome">
                  {a.nome}
                  {a.descricao && <span className="fichas-tabela__nota"> {a.descricao}</span>}
                </span>
                {!a.ativo && (
                  <Selo variante="alerta" icone="alerta">
                    {A.desativado}
                  </Selo>
                )}
                {podeGerenciar && editando !== a.codigo && (
                  <>
                    <Botao variante="secundario" aria-label={A.editar(a.nome)} onClick={() => setEditando(a.codigo)}>
                      {A.editarCurto}
                    </Botao>
                    <Botao variante="secundario" aria-label={a.ativo ? A.desativar(a.nome) : A.reativar(a.nome)} onClick={() => void mudarAtivo(a, !a.ativo)}>
                      {a.ativo ? A.desativarCurto : A.reativarCurto}
                    </Botao>
                  </>
                )}
              </div>
              {editando === a.codigo && (
                <Formulario
                  alergenico={a}
                  aoFechar={() => setEditando(null)}
                  aoSalvo={(t) => {
                    setEditando(null);
                    aoMudar(t);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
      {podeGerenciar && (
        <section className="hor-secao" aria-labelledby="fichas-alergenicos-novo">
          <h2 id="fichas-alergenicos-novo">{A.novo}</h2>
          <Formulario aoSalvo={aoMudar} />
        </section>
      )}
    </div>
  );
}
