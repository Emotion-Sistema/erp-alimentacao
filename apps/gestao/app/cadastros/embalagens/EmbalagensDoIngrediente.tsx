"use client";

/**
 * Bloco "Embalagens de compra (opcional)" do ingrediente, recolhido por padrão (abre sozinho só
 * quando falta a quantidade de alguma). Aberto: as embalagens colocadas + "Escolher do catálogo"
 * + "Criar nova embalagem" (o mesmo painel da aba Embalagens, com o fornecedor do item já escolhido).
 *
 * Dois modos:
 * - "local" (ingrediente novo, cadastro rápido, lista colada): só mexe na lista da tela, que vai
 *   ao servidor no lote como { nome, quantidadeBase, modeloId } (o lote grava tudo ou nada).
 * - "servidor" (ingrediente já gravado): cada escolha vai na hora por
 *   POST /api/cadastros/ingredientes/{id}/conversoes { modeloId, quantidadeBase? }; desativar,
 *   reativar e corrigir a quantidade usam a forma antiga { id, nome, quantidadeBase, ativo }.
 */
import { useId, useMemo, useState } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import { chamar } from "../../chamar";
import type { UnidadeBase, UnidadePadrao } from "../auxiliares";
import { chaveDoNome, novaChave, quantidadeDigitada, quantidadePeloNome, resumoDasEmbalagens, type LinhaLocal, type ModeloDeEmbalagem } from "./contas";
import { CartaoDaColocada } from "./CartaoDaColocada";
import { EscolhaDoCatalogo, type Escolhida, type Ocupados } from "./EscolhaDoCatalogo";
import { PainelDoModelo } from "./PainelDoModelo";
import { ResumoRecolhido } from "./ResumoRecolhido";
import { useCatalogoCompartilhado } from "./usarCatalogo";
import { T } from "./textos";

export type ConversaoGravada = { id: number; nome: string; quantidadeBase: string; ativo: boolean; modeloId?: number | null };

type Comum = {
  base: UnidadeBase;
  exibicao?: string;
  unidades: UnidadePadrao[];
  /** Fornecedor do item: as embalagens padrão dele vêm primeiro e a nova já nasce com ele. */
  fornecedorId: number | null;
  /** Começa aberto (ex.: o gerente tocou em "Adicionar embalagem" na lista). */
  abertoNoInicio?: boolean;
};
type ModoLocal = Comum & { modo: "local"; linhas: LinhaLocal[]; aoMudar: (linhas: LinhaLocal[]) => void };
type ModoServidor = Comum & { modo: "servidor"; ingredienteId: number; conversoes: ConversaoGravada[]; aoMudar: () => Promise<void> };

export function EmbalagensDoIngrediente(props: ModoLocal | ModoServidor) {
  const { base, exibicao, unidades, fornecedorId } = props;
  const catalogo = useCatalogoCompartilhado();
  const idConteudo = useId();

  const colocadas = props.modo === "local" ? props.linhas : props.conversoes.filter((c) => c.ativo);
  const faltam = props.modo === "local" ? props.linhas.filter((l) => !quantidadeDigitada(l.quantidade)).length : 0;
  const [aberto, setAberto] = useState(!!props.abertoNoInicio || faltam > 0);
  const [escolhendo, setEscolhendo] = useState(false);
  const [painel, setPainel] = useState(false);
  const [preSelecionar, setPreSelecionar] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "perigo"; texto: string } | null>(null);

  const ocupados: Ocupados = useMemo(() => {
    const mapa: Ocupados = new Map();
    if (props.modo === "local") for (const l of props.linhas) mapa.set(chaveDoNome(l.nome), "colocada");
    else for (const c of props.conversoes) if (!mapa.has(chaveDoNome(c.nome)) || c.ativo) mapa.set(chaveDoNome(c.nome), c.ativo ? "colocada" : "desativada");
    return mapa;
  }, [props]);

  // ---------- modo servidor: chamadas ----------
  async function gravarConversao(corpo: object, ok: string): Promise<boolean> {
    if (props.modo !== "servidor") return false;
    setMensagem(null);
    const r = await chamar(`/api/cadastros/ingredientes/${props.ingredienteId}/conversoes`, "POST", corpo);
    if (!r.ok) {
      setMensagem({ tipo: "perigo", texto: r.mensagem });
      return false;
    }
    setMensagem({ tipo: "sucesso", texto: ok });
    await props.aoMudar();
    return true;
  }

  async function adicionar(escolhidas: Escolhida[]): Promise<{ id: number; motivo: string }[]> {
    setMensagem(null);
    if (props.modo === "local") {
      props.aoMudar([
        ...props.linhas,
        ...escolhidas.map((e) => ({ chave: novaChave(), nome: e.modelo.nome, quantidade: e.quantidadeBase, modeloId: e.modelo.id })),
      ]);
      setMensagem({ tipo: "sucesso", texto: T.ingrediente.embalagemAdicionada(escolhidas.length) });
      setEscolhendo(false);
      return [];
    }
    const falhas: { id: number; motivo: string }[] = [];
    // Uma por vez, na ordem marcada: se uma falhar, as outras seguem e a pessoa vê qual e por quê.
    for (const e of escolhidas) {
      const corpo = e.calculada ? { modeloId: e.modelo.id } : { modeloId: e.modelo.id, quantidadeBase: e.quantidadeBase };
      const r = await chamar(`/api/cadastros/ingredientes/${props.ingredienteId}/conversoes`, "POST", corpo);
      if (!r.ok) falhas.push({ id: e.modelo.id, motivo: r.mensagem });
    }
    const feitas = escolhidas.length - falhas.length;
    if (feitas > 0) {
      await props.aoMudar();
      void catalogo.recarregar();
    }
    if (falhas.length === 0) {
      setMensagem({ tipo: "sucesso", texto: T.ingrediente.embalagemAdicionada(feitas) });
      setEscolhendo(false);
    } else if (feitas > 0) setMensagem({ tipo: "sucesso", texto: T.ingrediente.embalagemAdicionada(feitas) });
    return falhas;
  }

  const nomesColocados = colocadas.map((c) => c.nome);
  const alerta = faltam > 0 ? T.ingrediente.faltaQuantidade(faltam) : null;

  return (
    <section className={["emb-bloco", alerta && "emb-bloco--atencao"].filter(Boolean).join(" ")} aria-label={T.ingrediente.titulo} data-testid="bloco-embalagens">
      <ResumoRecolhido
        titulo={T.ingrediente.titulo}
        resumo={resumoDasEmbalagens(nomesColocados)}
        alerta={alerta}
        aberto={aberto}
        idConteudo={idConteudo}
        aoAlternar={() => setAberto(!aberto)}
      />
      <div id={idConteudo} className="emb-bloco__conteudo" hidden={!aberto}>
        {aberto && (
          <>
            <p className="emb-bloco__explicacao">{T.ingrediente.explicacao}</p>
            <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
            {props.modo === "local" ? (
              props.linhas.length === 0 ? (
                <p className="erp-vazio">{T.ingrediente.vazio}</p>
              ) : (
                <ul className="emb-colocadas" aria-label={T.ingrediente.colocadas}>
                  {props.linhas.map((l) => (
                    <CartaoDaColocada
                      key={l.chave}
                      nome={l.nome}
                      quantidade={l.quantidade}
                      calculada={quantidadePeloNome(l.nome, base, unidades) !== null}
                      base={base}
                      exibicao={exibicao}
                      aoMudarQuantidade={(q) => props.aoMudar(props.linhas.map((x) => (x.chave === l.chave ? { ...x, quantidade: q } : x)))}
                      acoes={
                        <Botao variante="secundario" aria-label={T.ingrediente.tirar(l.nome)} onClick={() => props.aoMudar(props.linhas.filter((x) => x.chave !== l.chave))}>
                          Tirar
                        </Botao>
                      }
                    />
                  ))}
                </ul>
              )
            ) : props.conversoes.length === 0 ? (
              <p className="erp-vazio">{T.ingrediente.vazio}</p>
            ) : (
              <ul className="emb-colocadas" aria-label={T.ingrediente.colocadas} data-testid="conversoes-do-ingrediente">
                {[...props.conversoes]
                  .sort((a, b) => Number(b.ativo) - Number(a.ativo))
                  .map((c) => (
                    <CartaoDaColocada
                      key={c.id}
                      nome={c.nome}
                      quantidade={c.quantidadeBase}
                      calculada={quantidadePeloNome(c.nome, base, unidades) !== null}
                      base={base}
                      exibicao={exibicao}
                      inativa={!c.ativo}
                      salvarQuantidade={(q) => gravarConversao({ id: c.id, nome: c.nome, quantidadeBase: q, ativo: c.ativo }, T.ingrediente.quantidadeOk)}
                      acoes={
                        <Botao
                          variante="secundario"
                          aria-label={c.ativo ? T.ingrediente.desativar(c.nome) : T.ingrediente.reativar(c.nome)}
                          onClick={() =>
                            void gravarConversao(
                              { id: c.id, nome: c.nome, quantidadeBase: c.quantidadeBase, ativo: !c.ativo },
                              c.ativo ? T.ingrediente.desativadaOk : T.ingrediente.reativadaOk,
                            )
                          }
                        >
                          {c.ativo ? "Desativar" : "Reativar"}
                        </Botao>
                      }
                    />
                  ))}
              </ul>
            )}
            {escolhendo ? (
              <EscolhaDoCatalogo
                modelos={catalogo.modelos}
                unidades={unidades}
                base={base}
                exibicao={exibicao}
                fornecedorId={fornecedorId}
                ocupados={ocupados}
                preSelecionar={preSelecionar}
                podeCriar
                aoCriarNova={() => setPainel(true)}
                aoAdicionar={adicionar}
                aoFechar={() => setEscolhendo(false)}
              />
            ) : (
              <div className="emb-bloco__botoes">
                <Botao
                  onClick={() => {
                    setMensagem(null);
                    setEscolhendo(true);
                  }}
                >
                  <Icone nome="busca" />
                  {T.ingrediente.escolher}
                </Botao>
                <Botao variante="secundario" onClick={() => setPainel(true)}>
                  <Icone nome="mais" />
                  {T.ingrediente.criarNova}
                </Botao>
              </div>
            )}
          </>
        )}
      </div>
      {painel && (
        <PainelDoModelo
          catalogo={{ ...catalogo, unidades }}
          inicio={{ inicial: { fornecedorId } }}
          aoFechar={() => setPainel(false)}
          aoSalvo={(m: ModeloDeEmbalagem) => {
            setPainel(false);
            setEscolhendo(true);
            setPreSelecionar(m.id);
          }}
        />
      )}
    </section>
  );
}
