"use client";

/**
 * Bloco "Alergênicos" da janela de um ingrediente (S1, decisão 0026). Para cada alergênico do
 * catálogo (GET /api/cadastros/alergenicos): Não contém / Contém / Pode conter traços. O botão
 * "Conferido" grava a lista inteira (POST /api/cadastros/ingredientes/[id]/alergenicos) e o servidor
 * marca quem conferiu e quando. Até lá, o ingrediente aparece como "Ainda não conferido" e os pratos
 * com ele ficam "em conferência". Um alergênico desativado no catálogo só aparece se o ingrediente
 * já o tem (o aviso não some). O servidor confere a permissão e as regras de novo.
 * As mudanças deste bloco não contam como "mexeu no formulário" de cima: ele avisa à janela pelo
 * `aoSujo` (fechar pergunta antes de perder o que não foi conferido).
 */
import { useEffect, useId, useState } from "react";
import { Aviso, Botao, Selo } from "@erp/interface";
import type { Alergenico } from "@erp/dominio";
import { NOME_DO_TIPO_DE_ALERGENICO, type TipoDeAlergenico } from "@erp/dominio/fichas";
import { Grupo, SelecaoDoGrupo } from "../Campo";
import { chamar } from "../chamar";
import { quando } from "./fichas/contas";
import { TF } from "./fichas/textos";

const A = TF.alergenicos;
type Escolha = TipoDeAlergenico | "nao";
const OPCOES = (["nao", "contem", "tracos"] as const).map((v) => ({ valor: v, texto: NOME_DO_TIPO_DE_ALERGENICO[v] }));

export type MarcasDoIngrediente = {
  id: number;
  nome: string;
  alergenicos: { codigo: string; tipo: TipoDeAlergenico }[];
  alergenicosConferidosEm: string | null;
  alergenicosConferidosPor: string | null;
};

const escolhasDe = (i: MarcasDoIngrediente) => new Map<string, Escolha>(i.alergenicos.map((a) => [a.codigo, a.tipo]));

export function AlergenicosDoIngrediente({
  ingrediente,
  aoGravado,
  aoSujo,
}: {
  ingrediente: MarcasDoIngrediente;
  /** Gravou: a lista de ingredientes recarrega (com quem conferiu). */
  aoGravado: (texto: string) => Promise<void> | void;
  aoSujo: (sujo: boolean) => void;
}) {
  const titulo = useId();
  const [catalogo, setCatalogo] = useState<Alergenico[] | null>(null);
  const [escolhas, setEscolhas] = useState(() => escolhasDe(ingrediente));
  const [mudou, setMudou] = useState(false);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void chamar<Alergenico[]>("/api/cadastros/alergenicos").then((r) => {
      if (!vivo) return;
      if (r.ok && r.dados) setCatalogo(r.dados);
      else setErro(r.mensagem);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const jaTem = new Set(ingrediente.alergenicos.map((a) => a.codigo));
  const visiveis = (catalogo ?? []).filter((a) => a.ativo || jaTem.has(a.codigo));

  function escolher(codigo: string, valor: Escolha) {
    setEscolhas((m) => new Map(m).set(codigo, valor));
    setMudou(true);
    aoSujo(true);
  }

  async function conferir() {
    setErro("");
    const lista = [...escolhas].filter(([c]) => visiveis.some((a) => a.codigo === c));
    setGravando(true);
    const r = await chamar(`/api/cadastros/ingredientes/${ingrediente.id}/alergenicos`, "POST", {
      contem: lista.filter(([, v]) => v === "contem").map(([c]) => c),
      tracos: lista.filter(([, v]) => v === "tracos").map(([c]) => c),
    });
    setGravando(false);
    if (!r.ok) return setErro(r.mensagem);
    setMudou(false);
    aoSujo(false);
    await aoGravado(A.gravado);
  }

  return (
    <section
      className="ingrediente-alergenicos"
      aria-labelledby={titulo}
      id="alergenicos-do-ingrediente"
      data-testid="alergenicos-do-ingrediente"
      // Não conta como mexer no formulário de cima (este bloco grava sozinho).
      onChange={(e) => e.stopPropagation()}
      onInput={(e) => e.stopPropagation()}
    >
      <h3 id={titulo} tabIndex={-1}>
        {A.titulo}
      </h3>
      {ingrediente.alergenicosConferidosEm ? (
        <p>
          <Selo variante="sucesso" icone="ok" data-testid="situacao-alergenicos">
            {A.conferidoPor(ingrediente.alergenicosConferidosPor ?? "?", quando(ingrediente.alergenicosConferidosEm))}
          </Selo>
        </p>
      ) : (
        <Aviso tipo="atencao" data-testid="situacao-alergenicos">
          <strong>{A.naoConferido}.</strong> {A.naoConferidoExplicacao}
        </Aviso>
      )}
      {!catalogo ? (
        !erro && <p aria-live="polite">{A.carregando}</p>
      ) : (
        <Grupo legenda={A.doIngrediente} explicacao={A.doIngredienteAjuda} exemplo={A.doIngredienteExemplo} ajudaNoTopo>
          <div className="ingrediente-alergenicos__grade">
            {visiveis.map((a) => (
              <SelecaoDoGrupo
                key={a.codigo}
                rotulo={a.ativo ? a.nome : `${a.nome} ${A.desativadoNoCatalogo}`}
                value={escolhas.get(a.codigo) ?? "nao"}
                onChange={(e) => escolher(a.codigo, e.target.value as Escolha)}
                opcoes={OPCOES}
              />
            ))}
          </div>
        </Grupo>
      )}
      <div aria-live="polite">
        {erro && <Aviso tipo="perigo">{erro}</Aviso>}
        {mudou && !erro && <p className="fichas-tabela__nota">{A.mudouSemGravar}</p>}
      </div>
      <div className="cadastros__botoes">
        <Botao variante={mudou || !ingrediente.alergenicosConferidosEm ? "primario" : "secundario"} disabled={gravando || !catalogo} onClick={() => void conferir()}>
          {A.botaoConferido}
        </Botao>
      </div>
    </section>
  );
}
