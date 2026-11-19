"use client";

/**
 * Aba "Custos" (só aparece para quem vê custo; o servidor confere de novo):
 * - Limite do alerta, em % do preço (POST /api/fichas/limite, em pontos-base: 35% = 3500).
 * - Custo de referência de cada ingrediente ativo: "R$ 45,90 por 1 kg". A tela converte kg -> g,
 *   L -> ml (fração exata) e reais -> centavos (`centavosDoTexto`), nada de float, e grava em
 *   POST /api/fichas/custo `{ ingredienteId, custoCentavos, quantidade }`. "Sem preço" manda nulo.
 * Quem só vê custo (sem `cadastros.gerenciar`) vê a lista sem os botões.
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao, Selo } from "@erp/interface";
import type { PainelDeFichas } from "@erp/dominio";
import { centavosDoTexto, PRECO_MAXIMO_CENTAVOS, textoDosCentavos } from "@erp/dominio/produtos";
import { chamar } from "../../chamar";
import { Campo, Selecao } from "../../Campo";
import { pbDoTexto, quantidadeAmigavel, quantidadeNaBase, quantidadeParaCampo, textoDoPb, unidadesParaDigitar, type UnidadeDigitada } from "./contas";
import { TF } from "./textos";

const T = TF.custos;
type Ingrediente = PainelDeFichas["ingredientes"][number];

function EditarPreco({ ingrediente, aoFechar, aoSalvo }: { ingrediente: Ingrediente; aoFechar: () => void; aoSalvo: (texto: string) => void }) {
  const g = ingrediente;
  const unidades = unidadesParaDigitar(g.unidade);
  const [preco, setPreco] = useState(g.custoCentavos === null ? "" : textoDosCentavos(g.custoCentavos).replace("R$ ", ""));
  // Novo: "1" na unidade maior (kg, L); já com preço: a quantidade gravada, na unidade do ingrediente.
  const [quantidade, setQuantidade] = useState(g.custoQuantidade === null ? "1" : quantidadeParaCampo(g.custoQuantidade));
  const [unidade, setUnidade] = useState<UnidadeDigitada>(g.custoQuantidade === null ? unidades[unidades.length - 1]! : g.unidade);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  async function gravar(corpo: { custoCentavos: number | null; quantidade?: string }, texto: string) {
    setGravando(true);
    const r = await chamar("/api/fichas/custo", "POST", { ingredienteId: g.id, ...corpo });
    setGravando(false);
    if (!r.ok) return setErro(r.mensagem);
    aoSalvo(texto);
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const c = centavosDoTexto(preco);
    if (c === null || c > PRECO_MAXIMO_CENTAVOS) return setErro(T.precoInvalido);
    const q = quantidadeNaBase(quantidade, unidade);
    if (q === null) return setErro(T.quantidadeInvalida);
    void gravar({ custoCentavos: c, quantidade: q }, T.salvo(g.nome));
  }

  return (
    <form className="fichas-preco__form" onSubmit={salvar} noValidate data-testid={`editar-preco-${g.nome}`}>
      <div className="linha-editavel__numeros">
        <Campo rotulo={T.preco} explicacao={T.precoAjuda} exemplo={T.precoExemplo} value={preco} inputMode="decimal" maxLength={14} autoComplete="off" onChange={(e) => setPreco(e.target.value)} />
        <Campo rotulo={T.quantidade} explicacao={T.quantidadeAjuda} exemplo={T.quantidadeExemplo} value={quantidade} inputMode="decimal" maxLength={16} autoComplete="off" onChange={(e) => setQuantidade(e.target.value)} />
        <Selecao rotulo={T.unidade} explicacao={T.unidadeAjuda} exemplo={T.unidadeExemplo} value={unidade} onChange={(e) => setUnidade(e.target.value as UnidadeDigitada)} opcoes={unidades.map((u) => ({ valor: u, texto: u }))} />
      </div>
      <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
      <div className="cadastros__botoes">
        <Botao type="submit" disabled={gravando}>
          {T.salvar}
        </Botao>
        {g.custoCentavos !== null && (
          <Botao variante="secundario" disabled={gravando} aria-label={T.apagarDe(g.nome)} onClick={() => void gravar({ custoCentavos: null }, T.apagado(g.nome))}>
            {T.apagar}
          </Botao>
        )}
        <Botao variante="secundario" onClick={aoFechar}>
          {T.cancelar}
        </Botao>
      </div>
    </form>
  );
}

function Limite({ atual, aoSalvo }: { atual: number; aoSalvo: (texto: string) => void }) {
  const [texto, setTexto] = useState(textoDoPb(atual).replace("%", ""));
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const pb = pbDoTexto(texto);
    if (pb === null) return setErro(T.limiteInvalido);
    setGravando(true);
    const r = await chamar<{ limiteCustoPb: number }>("/api/fichas/limite", "POST", { limiteCustoPb: pb });
    setGravando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    aoSalvo(T.limiteSalvo(textoDoPb(r.dados.limiteCustoPb)));
  }
  return (
    <form className="fichas-preco__form" onSubmit={(e) => void salvar(e)} noValidate>
      <Campo rotulo={T.limite} explicacao={T.limiteAjuda} exemplo={T.limiteExemplo} value={texto} inputMode="decimal" maxLength={6} autoComplete="off" onChange={(e) => setTexto(e.target.value)} />
      <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
      <div className="cadastros__botoes">
        <Botao type="submit" disabled={gravando}>
          {T.salvarLimite}
        </Botao>
      </div>
    </form>
  );
}

export function CustosDeReferencia({
  painel,
  podeGerenciar,
  aoMudar,
}: {
  painel: PainelDeFichas;
  podeGerenciar: boolean;
  /** Depois de gravar: recarrega o painel (os custos das fichas mudam) e mostra o aviso. */
  aoMudar: (texto: string) => void;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const ativos = painel.ingredientes.filter((g) => g.ativo);
  return (
    <div className="fichas-custos">
      <section className="hor-secao" aria-labelledby="fichas-limite">
        <h2 id="fichas-limite">{T.limiteTitulo}</h2>
        <p className="hor-secao__intro" data-testid="limite-atual">
          {T.limiteAtual(textoDoPb(painel.limiteCustoPb))}
        </p>
        {podeGerenciar && <Limite key={painel.limiteCustoPb} atual={painel.limiteCustoPb} aoSalvo={aoMudar} />}
      </section>
      <section className="hor-secao" aria-labelledby="fichas-precos">
        <h2 id="fichas-precos">{T.titulo}</h2>
        <p className="hor-secao__intro">{T.intro}</p>
        {ativos.length === 0 ? (
          <p className="hor-vazio">{T.nenhum}</p>
        ) : (
          <ul className="fichas-precos" aria-label={T.lista}>
            {ativos.map((g) => (
              <li key={g.id} className="fichas-preco" data-testid={`preco-${g.nome}`}>
                <div className="fichas-preco__linha">
                  <span className="fichas-preco__nome">{g.nome}</span>
                  {g.custoCentavos !== null && g.custoQuantidade !== null ? (
                    <span className="fichas-preco__valor" data-testid="preco-atual">
                      {T.por(textoDosCentavos(g.custoCentavos), quantidadeAmigavel(g.custoQuantidade, g.unidade))}
                    </span>
                  ) : (
                    <Selo variante="alerta" icone="alerta" data-testid="preco-atual">
                      {T.semPreco}
                    </Selo>
                  )}
                  {podeGerenciar && editando !== g.id && (
                    <Botao variante="secundario" aria-label={T.editar(g.nome)} onClick={() => setEditando(g.id)}>
                      {T.editarCurto}
                    </Botao>
                  )}
                </div>
                {editando === g.id && (
                  <EditarPreco
                    ingrediente={g}
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
        )}
      </section>
    </div>
  );
}
