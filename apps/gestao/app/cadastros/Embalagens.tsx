"use client";

/**
 * Peças compartilhadas do cadastro de ingredientes: embalagem com um toque, linhas de embalagem
 * editáveis e o editor de um item (nome, unidade, área e embalagens). Usadas no formulário do
 * ingrediente, no catálogo pronto e na lista colada. Todo campo usa os componentes com ajuda.
 */
import { useState } from "react";
import { BlocoDeConfirmacao, Botao } from "@erp/interface";
import { ContaDaEmbalagem, ResumoDoItem } from "./ResumoDoItem";
import { Campo, Selecao } from "../Campo";
import { OPCOES_DE_UNIDADE, baseDaUnidade, opcoesDaBase } from "@erp/dominio/unidades";
import { TIPOS_DE_EMBALAGEM, montarEmbalagem, multiplicarDecimal, type UnidadeBase, type UnidadePadrao } from "./auxiliares";

export type Opcao = { valor: string; texto: string };

/** As 6 unidades prontas do campo "Unidade do estoque", por extenso e na ordem combinada. */
export const OPCOES_DA_UNIDADE: Opcao[] = OPCOES_DE_UNIDADE.map((o) => ({ valor: o.codigo, texto: o.nome }));
/** Só as da família do ingrediente já criado (a unidade de dentro não muda): kg/g, L/ml ou un/dz. */
export const opcoesDaFamilia = (base: string): Opcao[] => opcoesDaBase(base).map((o) => ({ valor: o.codigo, texto: o.nome }));
export const EXPLICACAO_DA_UNIDADE =
  "Como você quer ver e informar a quantidade deste item. Por dentro o sistema conta em gramas, mililitros ou unidades, para a conta nunca errar.";
export const EXEMPLO_DA_UNIDADE = "Farinha: Quilos (kg). Ovo: Dúzias (dz) ou Unidades (un). Leite: Litros (L).";
export type LinhaDeEmbalagem = { chave: number; nome: string; quantidade: string };
export type ItemEditavel = {
  nome: string;
  unidadeBase: UnidadeBase | "";
  /** Como a pessoa vê e informa a quantidade (kg, g, l, ml, un, dz). Vazio até escolher. */
  unidadeExibicao: string;
  area: string;
  embalagens: LinhaDeEmbalagem[];
};

let contador = 0;
/** Chave estável para a lista de embalagens na tela. */
export const novaChave = () => ++contador;

export function embalagensDe(lista: readonly (readonly [string, string | null])[]): LinhaDeEmbalagem[] {
  return lista.map(([nome, q]) => ({ chave: novaChave(), nome, quantidade: q ?? "" }));
}

const UNIDADE_PADRAO_DO_TAMANHO: Record<UnidadeBase, string> = { g: "kg", ml: "l", un: "un" };

/** Valor decimal positivo? (aceita vírgula). */
export const quantidadeValida = (q: string) => multiplicarDecimal(q, "1") !== null;

/**
 * Embalagem com um toque: toca no tipo (caixa, saco...), diz o tamanho e a unidade, e a conta
 * é feita sozinha quando é da mesma grandeza do estoque. O campo de digitar livre continua nas linhas.
 */
export function ConstrutorDeEmbalagem({
  base,
  exibicao,
  unidades,
  rotuloDoBotao = "Adicionar esta embalagem",
  aoMontar,
}: {
  base: UnidadeBase;
  exibicao?: string;
  unidades: UnidadePadrao[];
  rotuloDoBotao?: string;
  aoMontar: (e: { nome: string; quantidadeBase: string }) => void;
}) {
  const [tipo, setTipo] = useState("");
  const [tamanho, setTamanho] = useState("");
  const [codigo, setCodigo] = useState(UNIDADE_PADRAO_DO_TAMANHO[base]);
  const [quantidade, setQuantidade] = useState("");

  const unidade = unidades.find((u) => u.codigo === codigo);
  const montada = tipo ? montarEmbalagem(tipo, tamanho, unidade, base) : null;
  const quantidadeFinal = montada ? (montada.precisaQuantidade ? quantidade : (montada.quantidadeBase ?? "")) : "";
  const pronta = !!montada && quantidadeValida(quantidadeFinal);

  function adicionar() {
    if (!montada || !pronta) return;
    aoMontar({ nome: montada.nome, quantidadeBase: quantidadeFinal.trim().replace(",", ".") });
    setTipo("");
    setTamanho("");
    setQuantidade("");
  }

  return (
    <section
      className="embalagem"
      aria-label="Embalagem com um toque"
      onKeyDown={(e) => {
        // Enter num campo daqui adiciona a embalagem (e não envia o formulário de trás).
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          adicionar();
        }
      }}
    >
      <h3>Embalagem com um toque</h3>
      <fieldset className="embalagem__tipos">
        <legend>Toque no tipo de embalagem</legend>
        {TIPOS_DE_EMBALAGEM.map((t) => (
          <button key={t} type="button" className="embalagem__tipo" aria-pressed={tipo === t} onClick={() => setTipo(tipo === t ? "" : t)}>
            {t}
          </button>
        ))}
      </fieldset>
      <div className="cadastros__form-linha">
        <Campo
          rotulo="Tamanho da embalagem"
          explicacao="Opcional. Quanto vem dentro de 1 embalagem. Aceita vírgula."
          exemplo="25 (e escolha kg ao lado) para um saco de 25 kg."
          value={tamanho}
          onChange={(e) => setTamanho(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
        />
        <Selecao
          rotulo="Unidade do tamanho"
          explicacao="A medida do tamanho ao lado. Se for da mesma família da unidade do estoque, a quantidade é calculada sozinha."
          exemplo="kg para saco de 25 kg; l para galão de 5 l; un para caixa com 30 un."
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          opcoes={unidades.map((u) => ({ valor: u.codigo, texto: `${u.codigo} (${u.nome})` }))}
        />
      </div>
      {montada?.precisaQuantidade && (
        <Campo
          rotulo={`Quantas ${base} vêm em 1 ${montada.nome}`}
          explicacao={
            tamanho.trim()
              ? `Esse tamanho é de outra medida que o estoque (${base}): diga quanto dá em ${base}.`
              : `Diga quantas ${base} cabem em 1 ${montada.nome}.`
          }
          exemplo={base === "un" ? "Saco de 3 kg de limão: cerca de 40 un." : "Caixa: 12000 se vierem 12 litros e o estoque for em ml."}
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
        />
      )}
      <div data-testid="previa-embalagem" aria-live="polite">
        {!tipo ? (
          <BlocoDeConfirmacao vazio>Escolha um tipo para ver a conta.</BlocoDeConfirmacao>
        ) : !montada ? (
          <BlocoDeConfirmacao vazio>Confira o tamanho: use só números (ex.: 25 ou 2,5).</BlocoDeConfirmacao>
        ) : (
          <ContaDaEmbalagem nome={montada.nome} quantidade={quantidadeFinal} base={base} exibicao={exibicao} />
        )}
      </div>
      <Botao variante="secundario" disabled={!pronta} onClick={adicionar}>
        {rotuloDoBotao}
      </Botao>
    </section>
  );
}

/** Linhas de embalagem para corrigir à mão (nome e quantidade), com botão de tirar. */
export function LinhasDeEmbalagem({
  embalagens,
  base,
  exibicao,
  prefixo = "Embalagem",
  aoMudar,
}: {
  embalagens: LinhaDeEmbalagem[];
  base: string;
  exibicao?: string;
  prefixo?: string;
  aoMudar: (novas: LinhaDeEmbalagem[]) => void;
}) {
  const trocar = (chave: number, parte: Partial<LinhaDeEmbalagem>) => aoMudar(embalagens.map((e) => (e.chave === chave ? { ...e, ...parte } : e)));
  return (
    <div className="embalagem__linhas">
      {embalagens.length === 0 && <p className="cadastros__dica">Sem embalagens. Se o ingrediente é comprado em caixa, saco ou pacote, acrescente uma abaixo.</p>}
      {embalagens.map((e, n) => (
        <div key={e.chave} className="embalagem__linha" role="group" aria-label={`${prefixo} ${n + 1}`}>
          <div className="cadastros__form-linha">
            <Campo
              rotulo={`${prefixo} ${n + 1}: nome`}
              explicacao="Como a embalagem vem do fornecedor. Se o nome tem o tamanho, ele precisa bater com a quantidade."
              exemplo="saco 25 kg, caixa 30 un, pacote."
              value={e.nome}
              onChange={(ev) => trocar(e.chave, { nome: ev.target.value })}
              autoComplete="off"
            />
            <Campo
              rotulo={`${prefixo} ${n + 1}: quantidade em ${base || "estoque"}`}
              explicacao={`Quantas ${base || "unidades do estoque"} cabem em 1 embalagem. Aceita vírgula.`}
              exemplo="saco 25 kg com estoque em g: 25000."
              value={e.quantidade}
              onChange={(ev) => trocar(e.chave, { quantidade: ev.target.value })}
              inputMode="decimal"
              autoComplete="off"
            />
          </div>
          <ContaDaEmbalagem nome={e.nome} quantidade={e.quantidade} base={base} exibicao={exibicao} />
          <Botao variante="secundario" aria-label={`Tirar ${prefixo.toLowerCase()} ${n + 1}`} onClick={() => aoMudar(embalagens.filter((x) => x.chave !== e.chave))}>
            Tirar
          </Botao>
        </div>
      ))}
    </div>
  );
}

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
  embalagens: i.embalagens.map((e) => ({ nome: e.nome.trim(), quantidadeBase: e.quantidade.trim().replace(",", ".") })),
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

/** Editor completo de um item: nome, unidade, área, embalagens e a embalagem de um toque. */
export function EditorDeItem({
  item,
  areas,
  unidades,
  aoMudar,
  comNome = true,
}: {
  item: ItemEditavel;
  areas: Opcao[];
  unidades: UnidadePadrao[];
  aoMudar: (novo: ItemEditavel) => void;
  comNome?: boolean;
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
            aoMudar({ ...item, unidadeExibicao: codigo, unidadeBase: (baseDaUnidade(codigo) ?? "") as UnidadeBase | "" });
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
      <h4>Embalagens de compra</h4>
      <LinhasDeEmbalagem embalagens={item.embalagens} base={item.unidadeBase} exibicao={item.unidadeExibicao} aoMudar={(embalagens) => aoMudar({ ...item, embalagens })} />
      <ConstrutorDeEmbalagem
        key={base}
        base={base}
        exibicao={item.unidadeExibicao}
        unidades={unidades}
        aoMontar={(e) => aoMudar({ ...item, embalagens: [...item.embalagens, { chave: novaChave(), nome: e.nome, quantidade: e.quantidadeBase }] })}
      />
    </div>
  );
}
