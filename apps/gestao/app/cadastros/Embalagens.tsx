"use client";

/**
 * Peças compartilhadas do cadastro de ingredientes: embalagens de compra (lista e bloco para
 * adicionar ou editar) e o editor de um item (nome, unidade, área e embalagens). Usadas no formulário do
 * ingrediente, no catálogo pronto e na lista colada. Todo campo usa os componentes com ajuda.
 */
import { useState } from "react";
import { BlocoDeConfirmacao, Botao, Icone, Selo } from "@erp/interface";
import { ContaDaEmbalagem, ResumoDoItem } from "./ResumoDoItem";
import { Campo, Selecao } from "../Campo";
import { OPCOES_DE_UNIDADE, baseDaUnidade, opcoesDaBase } from "@erp/dominio/unidades";
import { GRANDEZA_DA_BASE, TIPOS_DE_EMBALAGEM, comVirgula, equivalenciaNaUnidade, montarEmbalagem, multiplicarDecimal, type UnidadeBase, type UnidadePadrao } from "./auxiliares";

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

/** Chave de comparação de nomes, igual à do servidor (sem acento, caixa ou pontuação). */
const chaveDoNome = (n: string) =>
  n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const OUTRO = "__outro";

/**
 * Desmonta o nome de uma embalagem já colocada ("saco 25 kg") em tipo, tamanho e unidade, para
 * "Editar" carregar tudo no bloco. Nome que não segue o desenho vai inteiro em "Outro nome".
 */
function lerNomeDaEmbalagem(nome: string, unidades: UnidadePadrao[]): { tipo: string; outro: string; tamanho: string; codigo?: string } {
  const n = nome.trim();
  const tipos: readonly string[] = TIPOS_DE_EMBALAGEM;
  const m = /^(.*?)\s*([0-9]+(?:[.,][0-9]+)?)\s*([^0-9\s.,]+)\.?\s*$/.exec(n);
  if (m) {
    const u = unidades.find((x) => x.codigo.toLowerCase() === m[3]!.toLowerCase());
    const t = m[1]!.trim().toLowerCase();
    if (u && tipos.includes(t)) return { tipo: t, outro: "", tamanho: m[2]!, codigo: u.codigo };
    if (u && t) return { tipo: OUTRO, outro: m[1]!.trim(), tamanho: m[2]!, codigo: u.codigo };
  }
  if (tipos.includes(n.toLowerCase())) return { tipo: n.toLowerCase(), outro: "", tamanho: "" };
  return { tipo: OUTRO, outro: n, tamanho: "" };
}

/**
 * O nome já diz o tamanho ("saco 25 kg")? Então a quantidade tem de bater (mesma regra do servidor).
 * Devolve a mensagem de erro, ou nulo quando está tudo certo (ou o nome não diz tamanho).
 */
function conferirTamanhoNoNome(nome: string, quantidade: string, base: UnidadeBase, unidades: UnidadePadrao[]): string | null {
  const m = /([0-9]+(?:[.,][0-9]+)?)\s*([^0-9\s.,]+)\.?\s*$/.exec(nome.trim().toLowerCase());
  if (!m) return null;
  const u = unidades.find((x) => x.codigo.toLowerCase() === m[2]);
  if (!u || u.grandeza !== GRANDEZA_DA_BASE[base]) return null;
  const esperado = multiplicarDecimal(m[1]!, u.fator);
  const atual = multiplicarDecimal(quantidade, "1");
  if (!esperado || !atual || esperado === atual) return null;
  return `O nome diz ${m[1]} ${u.codigo}, que dá ${comVirgula(esperado)} ${base}, mas a quantidade é ${comVirgula(atual)} ${base}. Acerte um dos dois.`;
}

/**
 * Bloco "Adicionar embalagem": uma frase que se lê sozinha ("1 [tipo] com [tamanho] [unidade]"),
 * o resultado ao vivo e o botão. Serve também para editar (carrega a embalagem escolhida).
 * A conta é feita sozinha quando a unidade do tamanho é da mesma família do estoque.
 */
export function ConstrutorDeEmbalagem({
  base,
  exibicao,
  unidades,
  titulo = "Adicionar embalagem",
  rotuloDoBotao = "Adicionar embalagem",
  inicial = null,
  nomesUsados = [],
  aoMontar,
  aoCancelar,
}: {
  base: UnidadeBase;
  exibicao?: string;
  unidades: UnidadePadrao[];
  titulo?: string;
  rotuloDoBotao?: string;
  /** Embalagem a editar: carrega tipo, tamanho e unidade neste mesmo bloco. */
  inicial?: { nome: string; quantidade: string } | null;
  /** Nomes que já estão na lista (sem a que está sendo editada), para barrar repetido. */
  nomesUsados?: string[];
  aoMontar: (e: { nome: string; quantidadeBase: string }) => void;
  aoCancelar?: () => void;
}) {
  const lido = inicial ? lerNomeDaEmbalagem(inicial.nome, unidades) : null;
  const [tipo, setTipo] = useState(lido?.tipo ?? "");
  const [outro, setOutro] = useState(lido?.outro ?? "");
  const [tamanho, setTamanho] = useState(lido?.tamanho ?? "");
  const [codigo, setCodigo] = useState(lido?.codigo ?? UNIDADE_PADRAO_DO_TAMANHO[base]);
  const [quantidade, setQuantidade] = useState(inicial ? inicial.quantidade : "");

  const unidade = unidades.find((u) => u.codigo === codigo);
  const nomeDoTipo = tipo === OUTRO ? outro.trim() : tipo;
  const montada = nomeDoTipo ? montarEmbalagem(nomeDoTipo, tamanho, unidade, base) : null;
  const quantidadeFinal = montada ? (montada.precisaQuantidade ? quantidade : (montada.quantidadeBase ?? "")) : "";

  // O que impede de adicionar (a primeira coisa que falta), dito em linguagem simples.
  let bloqueio: string | null = null;
  if (!tipo) bloqueio = "Escolha o tipo da embalagem (caixa, saco, pacote...).";
  else if (!nomeDoTipo) bloqueio = "Escreva o nome da embalagem.";
  else if (!montada) bloqueio = "Confira o tamanho: use só números (ex.: 25 ou 2,5).";
  else if (!quantidadeValida(quantidadeFinal)) bloqueio = `Diga quantas ${base} vêm em 1 ${montada.nome}.`;
  else if (nomesUsados.some((n) => chaveDoNome(n) === chaveDoNome(montada.nome))) bloqueio = `Já existe uma embalagem chamada "${montada.nome}". Mude o tipo ou o tamanho.`;
  else bloqueio = conferirTamanhoNoNome(montada.nome, quantidadeFinal, base, unidades);

  function adicionar() {
    if (bloqueio || !montada) return;
    aoMontar({ nome: montada.nome, quantidadeBase: quantidadeFinal.trim().replace(",", ".") });
    if (!inicial) {
      setTipo("");
      setOutro("");
      setTamanho("");
      setQuantidade("");
    }
  }

  return (
    <section
      className={["embalagem", inicial && "embalagem--editando"].filter(Boolean).join(" ")}
      aria-label={titulo}
      onKeyDown={(e) => {
        // Enter num campo daqui adiciona a embalagem (e não envia o formulário de trás).
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          adicionar();
        }
      }}
    >
      <h4 className="embalagem__titulo">
        <Icone nome="caixa" />
        {titulo}
        {inicial && <Selo variante="info">editando</Selo>}
      </h4>
      <fieldset className="embalagem__tipos">
        <legend>
          <span className="embalagem__passo">1</span> Que embalagem é? Toque no tipo.
        </legend>
        {TIPOS_DE_EMBALAGEM.map((t) => (
          <button key={t} type="button" className="embalagem__tipo" aria-pressed={tipo === t} onClick={() => setTipo(tipo === t ? "" : t)}>
            {t}
          </button>
        ))}
        <button type="button" className="embalagem__tipo embalagem__tipo--outro" aria-pressed={tipo === OUTRO} onClick={() => setTipo(tipo === OUTRO ? "" : OUTRO)}>
          Outro nome
        </button>
      </fieldset>
      {tipo === OUTRO && (
        <Campo
          rotulo="Nome da embalagem"
          explicacao="Escreva como a embalagem vem do fornecedor, só o tipo (sem o tamanho, que vai abaixo)."
          exemplo="tonel, engradado, cartela."
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          autoComplete="off"
        />
      )}
      <div className="embalagem__medida" role="group" aria-label="Quanto vem dentro">
        <p className="embalagem__frase">
          <span className="embalagem__passo">2</span> Com quanto dentro? <span className="embalagem__opcional">Opcional.</span>
        </p>
        <Campo
          rotulo="Tamanho da embalagem"
          explicacao="Quanto vem dentro de 1 embalagem. Aceita vírgula. Pode deixar vazio."
          exemplo="25 (e escolha kg ao lado) para um saco de 25 kg."
          value={tamanho}
          onChange={(e) => setTamanho(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
        />
        <Selecao
          rotulo="Unidade do tamanho"
          explicacao="A medida do tamanho ao lado. Se for da mesma família do estoque, a quantidade é calculada sozinha."
          exemplo="kg para saco de 25 kg; l para galão de 5 l; un para caixa com 30 un."
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          opcoes={unidades.map((u) => ({ valor: u.codigo, texto: `${u.codigo} (${u.nome})` }))}
        />
      </div>
      {montada?.precisaQuantidade && (
        <Campo
          rotulo={`Quantas ${base} vêm em 1 ${montada.nome}?`}
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
        {!nomeDoTipo ? (
          <BlocoDeConfirmacao vazio>Escolha um tipo para ver a conta.</BlocoDeConfirmacao>
        ) : !montada ? (
          <BlocoDeConfirmacao vazio>Confira o tamanho: use só números (ex.: 25 ou 2,5).</BlocoDeConfirmacao>
        ) : (
          <ContaDaEmbalagem nome={montada.nome} quantidade={quantidadeFinal} base={base} exibicao={exibicao} />
        )}
      </div>
      {bloqueio && (
        <p className="embalagem__bloqueio" role="status" data-testid="bloqueio-embalagem">
          <Icone nome="alerta" />
          <span>{bloqueio}</span>
        </p>
      )}
      <div className="cadastros__botoes">
        <Botao variante={inicial ? "primario" : "secundario"} disabled={!!bloqueio} onClick={adicionar}>
          {rotuloDoBotao}
        </Botao>
        {aoCancelar && (
          <Botao variante="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
        )}
      </div>
    </section>
  );
}

/**
 * Embalagens de compra num fluxo só: em cima as já colocadas (só leitura, com Editar e Tirar),
 * embaixo o bloco para adicionar ou, ao editar, para salvar a alteração.
 */
export function EmbalagensDeCompra({
  embalagens,
  base,
  exibicao,
  unidades,
  aoMudar,
}: {
  embalagens: LinhaDeEmbalagem[];
  base: UnidadeBase;
  exibicao?: string;
  unidades: UnidadePadrao[];
  aoMudar: (novas: LinhaDeEmbalagem[]) => void;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const alvo = embalagens.find((e) => e.chave === editando) ?? null;
  return (
    <div className="embalagem__fluxo">
      {embalagens.length === 0 ? (
        <p className="erp-vazio">Nenhuma embalagem ainda. É opcional.</p>
      ) : (
        <ul className="embalagem__lista" aria-label="Embalagens colocadas">
          {embalagens.map((e) => {
            const equivalencia = equivalenciaNaUnidade(e.quantidade, base, exibicao);
            return (
              <li key={e.chave} className={["embalagem__cartao", e.chave === editando && "embalagem__cartao--editando"].filter(Boolean).join(" ")}>
                <Icone nome="caixa" />
                <span className="embalagem__nome">{e.nome.trim() || "Sem nome"}</span>
                {equivalencia ? (
                  <span className="embalagem__equivalencia">= {equivalencia}</span>
                ) : (
                  <span className="erp-chip__falta">
                    <Icone nome="alerta" />
                    falta a quantidade
                  </span>
                )}
                <span className="embalagem__acoes">
                  <Botao variante="secundario" aria-label={`Editar embalagem ${e.nome.trim()}`} onClick={() => setEditando(e.chave)}>
                    Editar
                  </Botao>
                  <Botao
                    variante="secundario"
                    aria-label={`Tirar embalagem ${e.nome.trim()}`}
                    onClick={() => {
                      if (editando === e.chave) setEditando(null);
                      aoMudar(embalagens.filter((x) => x.chave !== e.chave));
                    }}
                  >
                    Tirar
                  </Botao>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <ConstrutorDeEmbalagem
        key={`${base}-${editando ?? "novo"}`}
        base={base}
        exibicao={exibicao}
        unidades={unidades}
        titulo={alvo ? "Editar embalagem" : "Adicionar embalagem"}
        rotuloDoBotao={alvo ? "Salvar alteração" : "Adicionar embalagem"}
        inicial={alvo ? { nome: alvo.nome, quantidade: alvo.quantidade } : null}
        nomesUsados={embalagens.filter((e) => e.chave !== editando).map((e) => e.nome)}
        aoCancelar={alvo ? () => setEditando(null) : undefined}
        aoMontar={(m) => {
          if (alvo) {
            aoMudar(embalagens.map((e) => (e.chave === alvo.chave ? { ...e, nome: m.nome, quantidade: m.quantidadeBase } : e)));
            setEditando(null);
          } else {
            aoMudar([...embalagens, { chave: novaChave(), nome: m.nome, quantidade: m.quantidadeBase }]);
          }
        }}
      />
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
      <EmbalagensDeCompra embalagens={item.embalagens} base={base} exibicao={item.unidadeExibicao} unidades={unidades} aoMudar={(embalagens) => aoMudar({ ...item, embalagens })} />
    </div>
  );
}
