"use client";

/**
 * Peças compartilhadas do cadastro de ingredientes: tipos e regras das embalagens de um item ainda
 * não gravado e o editor de um item (nome, unidade, área e embalagens). Usadas no formulário do
 * ingrediente, no catálogo pronto e na lista colada. As embalagens são escolhidas do catálogo
 * (pasta ./embalagens, bloco EmbalagensDoIngrediente). Todo campo usa os componentes com ajuda.
 */
import { ResumoDoItem } from "./ResumoDoItem";
import { Campo, Selecao } from "../Campo";
import { OPCOES_DE_UNIDADE, baseDaUnidade, opcoesDaBase } from "@erp/dominio/unidades";
import { multiplicarDecimal, type UnidadeBase, type UnidadePadrao } from "./auxiliares";
import { ajustarLinhasParaBase, novaChave } from "./embalagens/contas";
import { EmbalagensDoIngrediente } from "./embalagens/EmbalagensDoIngrediente";

export type Opcao = { valor: string; texto: string };

/** As 6 unidades prontas do campo "Unidade do estoque", por extenso e na ordem combinada. */
export const OPCOES_DA_UNIDADE: Opcao[] = OPCOES_DE_UNIDADE.map((o) => ({ valor: o.codigo, texto: o.nome }));
/** Só as da família do ingrediente já criado (a unidade de dentro não muda): kg/g, L/ml ou un/dz. */
export const opcoesDaFamilia = (base: string): Opcao[] => opcoesDaBase(base).map((o) => ({ valor: o.codigo, texto: o.nome }));
export const EXPLICACAO_DA_UNIDADE =
  "Como você quer ver e informar a quantidade deste item. Por dentro o sistema conta em gramas, mililitros ou unidades, para a conta nunca errar.";
export const EXEMPLO_DA_UNIDADE = "Farinha: Quilos (kg). Ovo: Dúzias (dz) ou Unidades (un). Leite: Litros (L).";
export type LinhaDeEmbalagem = { chave: number; nome: string; quantidade: string; modeloId?: number | null };
export type ItemEditavel = {
  nome: string;
  unidadeBase: UnidadeBase | "";
  /** Como a pessoa vê e informa a quantidade (kg, g, l, ml, un, dz). Vazio até escolher. */
  unidadeExibicao: string;
  area: string;
  embalagens: LinhaDeEmbalagem[];
};

export { novaChave };

export function embalagensDe(lista: readonly (readonly [string, string | null])[]): LinhaDeEmbalagem[] {
  return lista.map(([nome, q]) => ({ chave: novaChave(), nome, quantidade: q ?? "" }));
}

/** Valor decimal positivo? (aceita vírgula). */
export const quantidadeValida = (q: string) => multiplicarDecimal(q, "1") !== null;

/** Embalagens sem nome ou sem quantidade (impedem gravar). */
export function faltaNasEmbalagens(item: ItemEditavel): string[] {
  const faltas: string[] = [];
  for (const e of item.embalagens) {
    if (!e.nome.trim()) faltas.push("Uma embalagem está sem nome.");
    else if (!quantidadeValida(e.quantidade)) faltas.push(`Falta a quantidade da embalagem "${e.nome.trim()}".`);
  }
  return faltas;
}

/** O que falta preencher no item para poder gravar (lista vazia = pronto). */
export function faltaNoItem(item: ItemEditavel): string[] {
  const faltas: string[] = [];
  if (item.nome.trim().length < 2) faltas.push("Falta o nome.");
  if (!item.unidadeBase || !item.unidadeExibicao) faltas.push("Falta dizer como o estoque conta (kg, g, L, ml, un ou dz).");
  return [...faltas, ...faltaNasEmbalagens(item)];
}

/** Corpo que o servidor espera para um item do lote. */
export const itemParaServidor = (i: ItemEditavel, fornecedorId: number | null = null) => ({
  nome: i.nome.trim(),
  unidadeBase: i.unidadeBase,
  unidadeExibicao: i.unidadeExibicao || i.unidadeBase,
  area: i.area,
  fornecedorId,
  embalagens: i.embalagens.map((e) => ({ nome: e.nome.trim(), quantidadeBase: e.quantidade.trim().replace(",", "."), modeloId: e.modeloId ?? null })),
});

/** Resumo visual de um item em edição (unidade, área e chips das embalagens). */
export function ResumoDoItemEditavel({ item, nomeDaArea }: { item: ItemEditavel; nomeDaArea: (a: string) => string }) {
  return (
    <ResumoDoItem
      unidadeBase={item.unidadeBase}
      unidadeExibicao={item.unidadeExibicao}
      area={item.area}
      nomeDaArea={nomeDaArea}
      embalagens={item.embalagens.map((e) => ({ chave: e.chave, nome: e.nome, quantidade: e.quantidade.trim() || null }))}
    />
  );
}

/** Editor completo de um item: nome, unidade, área e as embalagens (bloco recolhido, escolhidas do catálogo). */
export function EditorDeItem({
  item,
  areas,
  unidades,
  aoMudar,
  comNome = true,
  fornecedorId = null,
}: {
  item: ItemEditavel;
  areas: Opcao[];
  unidades: UnidadePadrao[];
  aoMudar: (novo: ItemEditavel) => void;
  comNome?: boolean;
  /** Fornecedor do lote (quando houver): as embalagens padrão dele aparecem primeiro. */
  fornecedorId?: number | null;
}) {
  const base = (item.unidadeBase || "un") as UnidadeBase;
  return (
    <div className="editor-item">
      <div className="cadastros__form-linha">
        {comNome && (
          <Campo
            rotulo="Nome do ingrediente"
            explicacao="Como a equipe chama o ingrediente. Não pode repetir um que já está cadastrado."
            exemplo="Farinha de trigo, Ovo, Leite integral."
            value={item.nome}
            onChange={(e) => aoMudar({ ...item, nome: e.target.value })}
            autoComplete="off"
          />
        )}
        <Selecao
          rotulo="Unidade do estoque"
          explicacao={EXPLICACAO_DA_UNIDADE}
          exemplo={EXEMPLO_DA_UNIDADE}
          value={item.unidadeExibicao}
          onChange={(e) => {
            const codigo = e.target.value;
            const novaBase = (baseDaUnidade(codigo) ?? "") as UnidadeBase | "";
            // Trocou de família (kg para un): as quantidades que saem do nome são refeitas; as digitadas pedem de novo.
            const embalagens = novaBase ? ajustarLinhasParaBase(item.embalagens, base, novaBase, unidades) : item.embalagens;
            aoMudar({ ...item, unidadeExibicao: codigo, unidadeBase: novaBase, embalagens });
          }}
          opcoes={item.unidadeExibicao ? OPCOES_DA_UNIDADE : [{ valor: "", texto: "Escolha a unidade" }, ...OPCOES_DA_UNIDADE]}
        />
        <Selecao
          rotulo="Área do estoque"
          explicacao="O setor onde o ingrediente é usado e guardado."
          exemplo="Cozinha para farinha e ovo. Bar para café em grão."
          value={item.area}
          onChange={(e) => aoMudar({ ...item, area: e.target.value })}
          opcoes={areas}
        />
      </div>
      <EmbalagensDoIngrediente
        modo="local"
        linhas={item.embalagens}
        base={base}
        exibicao={item.unidadeExibicao}
        unidades={unidades}
        fornecedorId={fornecedorId}
        aoMudar={(embalagens) => aoMudar({ ...item, embalagens })}
      />
    </div>
  );
}
