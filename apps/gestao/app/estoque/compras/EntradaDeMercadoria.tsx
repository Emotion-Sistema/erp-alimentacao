"use client";

/**
 * Entrada de mercadoria (E09 parte 2, decisão 0027): fornecedor da lista, número e data da nota e
 * os itens que chegaram (quantidade na unidade que veio: kg, g, L, ml, un, dz ou uma embalagem do
 * ingrediente), com local, área, validade, lote e, só para quem vê custos, o valor pago. Depois de
 * gravar, oferece anexar a foto da nota. O servidor confere tudo (área, custos, validade).
 */
import { useEffect, useRef, useState } from "react";
import { Aviso, Botao } from "@erp/interface";
import type { Fornecedor, Ingrediente } from "@erp/dominio";
import { centavosDoTexto } from "@erp/dominio/produtos";
import { chamar } from "../../chamar";
import { BotaoExemplos, Campo, Selecao } from "../../Campo";
import { novaChave, unidadesDoItem } from "../comum";
import type { ContextoDoEstoque } from "../contexto";
import { NOME_DO_LOCAL, TE } from "../textos";
import { AnexarFoto } from "./AnexarFoto";

const T = TE.entrada;
type Linha = { id: number; ingredienteId: string; quantidade: string; unidade: string; local: string; area: string; validade: string; lote: string; valor: string };
let proxima = 1;
const linhaVazia = (): Linha => ({ id: proxima++, ingredienteId: "", quantidade: "", unidade: "", local: "guardado", area: "", validade: "", lote: "", valor: "" });

export function EntradaDeMercadoria({ contexto, aoGravar }: { contexto: ContextoDoEstoque; aoGravar: () => void }) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [ingredientes, setIngredientes] = useState<Ingrediente[] | null>(null);
  const [erro, setErro] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>(() => [linhaVazia()]);
  const [chave, setChave] = useState(novaChave);
  const [ocupado, setOcupado] = useState(false);
  const [gravada, setGravada] = useState<{ movimentoId: string; repetido: boolean; itens: number } | null>(null);
  const travado = useRef(false);
  const minhas = contexto.areas.map((a) => a.valor);

  useEffect(() => {
    void (async () => {
      const [f, i] = await Promise.all([chamar<Fornecedor[]>("/api/cadastros/fornecedores"), chamar<{ ingredientes: Ingrediente[] }>("/api/cadastros/ingredientes")]);
      if (f.ok && f.dados) setFornecedores(f.dados.filter((x) => x.ativo));
      else setErro(f.mensagem);
      if (i.ok && i.dados) setIngredientes(i.dados.ingredientes.filter((x) => x.ativo && minhas.includes(x.area)));
      else setErro(i.mensagem);
    })();
  }, []);

  const mudar = (id: number, campo: keyof Linha, valor: string) =>
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l;
        if (campo !== "ingredienteId") return { ...l, [campo]: valor };
        const ing = ingredientes?.find((x) => String(x.id) === valor);
        return { ...l, ingredienteId: valor, unidade: ing ? unidadesDoItem(ing.unidadeBase)[0]!.valor : "", area: ing?.area ?? "" };
      }),
    );

  async function gravar() {
    if (travado.current) return;
    setErro("");
    const itens: Record<string, unknown>[] = [];
    for (const [k, l] of linhas.entries()) {
      let valorCentavos: number | undefined;
      if (contexto.podeVerCusto && l.valor.trim()) {
        const c = centavosDoTexto(l.valor);
        if (c === null) return setErro(`${T.itemN(k + 1)}: valor em reais, como 137,70.`);
        valorCentavos = c;
      }
      itens.push({
        ...(l.ingredienteId ? { ingredienteId: Number(l.ingredienteId) } : {}),
        quantidade: l.quantidade,
        ...(l.unidade ? { unidade: l.unidade } : {}),
        local: l.local,
        ...(l.area ? { area: l.area } : {}),
        ...(l.validade ? { validade: l.validade } : {}),
        ...(l.lote.trim() ? { lote: l.lote } : {}),
        ...(valorCentavos !== undefined ? { valorCentavos } : {}),
      });
    }
    travado.current = true;
    setOcupado(true);
    const r = await chamar<{ movimentoId: string; repetido: boolean }>("/api/estoque/entradas", "POST", {
      chave,
      ...(fornecedorId ? { fornecedorId: Number(fornecedorId) } : {}),
      ...(numero.trim() ? { notaNumero: numero } : {}),
      ...(data ? { notaData: data } : {}),
      itens,
    });
    travado.current = false;
    setOcupado(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setGravada({ ...r.dados, itens: itens.length });
    aoGravar();
  }

  function outra() {
    setGravada(null);
    setFornecedorId("");
    setNumero("");
    setData("");
    setLinhas([linhaVazia()]);
    setChave(novaChave());
    setErro("");
  }

  if (gravada)
    return (
      <div className="est-contagens">
        <Aviso tipo="sucesso" data-testid="entrada-gravada">
          {gravada.repetido ? T.repetida : T.gravada(gravada.itens)}
        </Aviso>
        <AnexarFoto movimentoId={gravada.movimentoId} />
        <div className="hor-secao__botoes">
          <Botao onClick={outra}>{T.outra}</Botao>
        </div>
      </div>
    );

  const unidadesDe = (l: Linha) => {
    const ing = ingredientes?.find((x) => String(x.id) === l.ingredienteId);
    return ing ? unidadesDoItem(ing.unidadeBase, ing.conversoes.filter((c) => c.ativo).map((c) => c.nome)) : [];
  };

  return (
    <form
      className="est-contagens"
      data-testid="form-entrada"
      onSubmit={(e) => {
        e.preventDefault();
        void gravar();
      }}
    >
      <BotaoExemplos />
      <section className="hor-secao" aria-labelledby="est-nota">
        <h2 id="est-nota">{T.nota}</h2>
        <Selecao
          rotulo={T.fornecedor}
          explicacao={T.fornecedorAjuda}
          exemplo={T.fornecedorExemplo}
          value={fornecedorId}
          onChange={(e) => setFornecedorId(e.target.value)}
          opcoes={[{ valor: "", texto: T.semFornecedor }, ...fornecedores.map((f) => ({ valor: String(f.id), texto: f.nome }))]}
        />
        <div className="est-form__linha">
          <Campo rotulo={T.numero} explicacao={T.numeroAjuda} exemplo={T.numeroExemplo} value={numero} maxLength={60} onChange={(e) => setNumero(e.target.value)} />
          <Campo rotulo={T.data} explicacao={T.dataAjuda} exemplo={T.dataExemplo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
      </section>
      <section className="hor-secao" aria-labelledby="est-itens-da-nota">
        <h2 id="est-itens-da-nota">{T.itens}</h2>
        {!ingredientes && !erro && <p>{TE.carregando}</p>}
        <ol className="est-lista">
          {linhas.map((l, k) => (
            <li key={l.id} className="est-linha est-entrada" data-testid={`linha-da-entrada-${k + 1}`}>
              <fieldset className="est-entrada__campos">
                <legend>{T.itemN(k + 1)}</legend>
                <Selecao
                  rotulo={T.item}
                  explicacao={T.itemAjuda}
                  exemplo={T.itemExemplo}
                  value={l.ingredienteId}
                  onChange={(e) => mudar(l.id, "ingredienteId", e.target.value)}
                  opcoes={[{ valor: "", texto: T.escolhaItem }, ...(ingredientes ?? []).map((i) => ({ valor: String(i.id), texto: i.nome }))]}
                />
                <div className="est-form__linha">
                  <Campo rotulo={TE.form.quantidade} explicacao={TE.form.quantidadeAjuda} exemplo={TE.form.quantidadeExemplo} inputMode="decimal" value={l.quantidade} onChange={(e) => mudar(l.id, "quantidade", e.target.value)} />
                  <Selecao rotulo={TE.form.unidade} explicacao={TE.form.unidadeAjuda} exemplo={TE.form.unidadeExemplo} value={l.unidade} onChange={(e) => mudar(l.id, "unidade", e.target.value)} opcoes={unidadesDe(l).length ? unidadesDe(l) : [{ valor: "", texto: "-" }]} />
                </div>
                <div className="est-form__linha">
                  <Selecao
                    rotulo={TE.form.local}
                    explicacao={TE.form.localAjuda}
                    exemplo={TE.form.localExemplo}
                    value={l.local}
                    onChange={(e) => mudar(l.id, "local", e.target.value)}
                    opcoes={Object.entries(NOME_DO_LOCAL).map(([valor, texto]) => ({ valor, texto }))}
                  />
                  <Selecao rotulo={TE.form.area} explicacao={TE.form.areaAjuda} exemplo={TE.form.areaExemplo} value={l.area} onChange={(e) => mudar(l.id, "area", e.target.value)} opcoes={[{ valor: "", texto: "Área do cadastro" }, ...contexto.areas]} />
                </div>
                <div className="est-form__linha">
                  <Campo rotulo={TE.form.validade} explicacao="Último dia em que pode ser usado. Vazia: sem validade." exemplo={TE.form.validadeExemplo} type="date" value={l.validade} onChange={(e) => mudar(l.id, "validade", e.target.value)} />
                  <Campo rotulo={TE.form.codigoLote} explicacao={TE.form.codigoLoteAjuda} exemplo={TE.form.codigoLoteExemplo} value={l.lote} maxLength={60} onChange={(e) => mudar(l.id, "lote", e.target.value)} />
                </div>
                {contexto.podeVerCusto && <Campo rotulo={T.valor} explicacao={T.valorAjuda} exemplo={T.valorExemplo} inputMode="decimal" value={l.valor} maxLength={20} onChange={(e) => mudar(l.id, "valor", e.target.value)} />}
              </fieldset>
              {linhas.length > 1 && (
                <Botao variante="secundario" onClick={() => setLinhas((ls) => ls.filter((x) => x.id !== l.id))}>
                  {T.tirarItem(k + 1)}
                </Botao>
              )}
            </li>
          ))}
        </ol>
        <div className="hor-secao__botoes">
          <Botao variante="secundario" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}>
            {T.adicionarItem}
          </Botao>
        </div>
      </section>
      {erro && (
        <Aviso tipo="perigo" data-testid="erro-da-entrada">
          {erro}
        </Aviso>
      )}
      <div className="hor-secao__botoes">
        <Botao type="submit" disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? TE.form.gravando : T.gravar(linhas.length)}
        </Botao>
      </div>
    </form>
  );
}
