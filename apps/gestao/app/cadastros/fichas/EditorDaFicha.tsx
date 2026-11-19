"use client";

/**
 * Janela que monta a receita INTEIRA de uma ficha e grava em POST /api/fichas.
 * - Ficha nova: escolhe o que ela descreve (produto, tamanho, adicional ou preparo com nome e
 *   unidade do rendimento) e manda sem `id`; o servidor cria a ficha e a versão 1.
 * - Ficha aberta: manda `{ id, versaoBase, receita }`; `versaoBase` é a versão que a pessoa abriu.
 *   Se outra pessoa gravou antes, o servidor recusa (conflito) e a janela oferece abrir a mais nova.
 * Quantidade digitada em kg ou L vira g ou ml por fração exata (`quantidadeNaBase`), nunca float.
 * Quantidade vazia = pendência (o servidor marca a ficha como Incompleta).
 * A tela confere o básico para explicar cedo; quem decide é o servidor (a mensagem dele aparece aqui).
 */
import { useMemo, useState, type FormEvent } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import type { FichaCompleta, PainelDeFichas } from "@erp/dominio";
import {
  EQUIPAMENTOS_POR_FICHA,
  ETAPAS_POR_FICHA,
  ITENS_POR_FICHA,
  NOME_DO_TIPO_DE_FICHA,
  PENDENCIAS_POR_FICHA,
  TIPOS_DE_FICHA,
  UNIDADES_DA_FICHA,
  type TipoDeFicha,
  type UnidadeDaFicha,
} from "@erp/dominio/fichas";
import { nomeComparavel } from "@erp/dominio/produtos";
import { chamar } from "../../chamar";
import { AreaDeTexto, BotaoExemplos, Campo, CampoDoGrupo, Grupo, OpcaoDoGrupo, Selecao, SelecaoDoGrupo } from "../../Campo";
import { BotoesDaLinha, mover } from "../BotoesDaLinha";
import { JanelaModal, usarPedirFechar } from "../JanelaModal";
import { inteiroDoCampo, quantidadeNaBase, quantidadeParaCampo, unidadesParaDigitar, type UnidadeDigitada } from "./contas";
import { TF } from "./textos";

const T = TF.editor;

type LinhaDoItem = {
  chave: number;
  ingredienteId: number | null;
  preparoId: number | null;
  nome: string;
  unidade: UnidadeDaFicha;
  quantidade: string;
  digitada: UnidadeDigitada;
  medida: string;
  opcional: boolean;
  observacao: string | null;
};
type LinhaDeTexto = { chave: number; texto: string };
type LinhaDaEtapa = { chave: number; texto: string; minutos: string };

let proximaChave = 0;
const chave = () => ++proximaChave;

/** O que uma ficha nova descreve, quando a janela já abre com ele escolhido ("Criar ficha" de um produto). */
export type AlvoInicial = { tipo: TipoDeFicha; produtoId?: number };

function BotaoCancelar() {
  const pedirFechar = usarPedirFechar();
  return (
    <Botao variante="secundario" onClick={pedirFechar}>
      {T.cancelar}
    </Botao>
  );
}

export function EditorDaFicha({
  painel,
  ficha,
  alvoInicial,
  aoFechar,
  aoSalvo,
  aoRecarregar,
}: {
  painel: PainelDeFichas;
  /** Sem ela, cria uma ficha nova. */
  ficha?: FichaCompleta;
  alvoInicial?: AlvoInicial;
  aoFechar: () => void;
  aoSalvo: (f: FichaCompleta, criada: boolean) => void;
  /** Depois de um conflito: fecha e abre a versão mais nova. */
  aoRecarregar?: () => void;
}) {
  const v = ficha?.versao ?? null;
  const tipoAtual = ficha?.resumo.tipo;
  const [sujo, setSujo] = useState(false);
  const [tipo, setTipo] = useState<TipoDeFicha>(tipoAtual ?? alvoInicial?.tipo ?? "produto");
  const [produtoId, setProdutoId] = useState(alvoInicial?.produtoId ? String(alvoInicial.produtoId) : "");
  const [produtoDoTamanho, setProdutoDoTamanho] = useState("");
  const [tamanhoId, setTamanhoId] = useState("");
  const [adicionalId, setAdicionalId] = useState("");
  const [nome, setNome] = useState(ficha && ficha.resumo.tipo === "preparo" ? ficha.resumo.nome : "");
  const [unidadeRendimento, setUnidadeRendimento] = useState<UnidadeDaFicha>(ficha?.resumo.unidadeRendimento ?? "g");
  const [rende, setRende] = useState(quantidadeParaCampo(v?.rende ?? (ficha ? null : tipo === "preparo" ? null : "1")));
  const [rendeEm, setRendeEm] = useState<UnidadeDigitada>(ficha?.resumo.unidadeRendimento ?? "g");
  const [porcao, setPorcao] = useState(quantidadeParaCampo(v?.porcaoQuantidade ?? null));
  const [porcaoUnidade, setPorcaoUnidade] = useState<UnidadeDaFicha>(v?.porcaoUnidade ?? "g");
  const [tempo, setTempo] = useState(v?.tempoMin === null || v?.tempoMin === undefined ? "" : String(v.tempoMin));
  const [validade, setValidade] = useState(v?.validadeDias === null || v?.validadeDias === undefined ? "" : String(v.validadeDias));
  const [itens, setItens] = useState<LinhaDoItem[]>(() =>
    (v?.itens ?? []).map((i) => ({
      chave: chave(),
      ingredienteId: i.ingredienteId,
      preparoId: i.preparoId,
      nome: i.nome,
      unidade: i.unidade,
      quantidade: quantidadeParaCampo(i.quantidade),
      digitada: i.unidade,
      medida: i.medidaCaseira ?? "",
      opcional: i.opcional,
      observacao: i.observacao,
    })),
  );
  const [pendencias, setPendencias] = useState<LinhaDeTexto[]>(() => (v?.pendencias ?? []).map((texto) => ({ chave: chave(), texto })));
  const [etapas, setEtapas] = useState<LinhaDaEtapa[]>(() => (v?.etapas ?? []).map((e) => ({ chave: chave(), texto: e.texto, minutos: e.minutos === null ? "" : String(e.minutos) })));
  const [equipamentos, setEquipamentos] = useState<LinhaDeTexto[]>(() => (v?.equipamentos ?? []).map((texto) => ({ chave: chave(), texto })));
  const [observacoes, setObservacoes] = useState(v?.observacoes ?? "");
  const [motivo, setMotivo] = useState("");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [conflito, setConflito] = useState(false);
  const [gravando, setGravando] = useState(false);

  const ehPreparo = tipo === "preparo";
  const unidadeDoPreparo = ficha?.resumo.unidadeRendimento ?? unidadeRendimento;

  // O que uma ficha nova pode descrever: o que está ativo e ainda não tem ficha ativa.
  const comFicha = useMemo(() => {
    const ativas = painel.fichas.filter((f) => f.ativo);
    return {
      tamanhos: new Set(ativas.flatMap((f) => (f.tamanhoId ? [f.tamanhoId] : []))),
      adicionais: new Set(ativas.flatMap((f) => (f.adicionalId ? [f.adicionalId] : []))),
    };
  }, [painel.fichas]);
  const produtosAtivos = new Map(painel.produtos.filter((p) => p.ativo).map((p) => [p.id, p]));
  const tamanhosLivres = painel.tamanhos.filter((t) => t.ativo && produtosAtivos.has(t.produtoId) && !comFicha.tamanhos.has(t.id));
  const produtosComTamanho = [...new Set(tamanhosLivres.map((t) => t.produtoId))].map((id) => produtosAtivos.get(id)!);
  const adicionaisLivres = painel.adicionais.filter((a) => a.ativo && !comFicha.adicionais.has(a.id));

  // Itens que dá para pôr: ingredientes ativos e preparos ativos (nunca a própria ficha), sem repetir.
  const opcoes = useMemo(
    () => [
      ...painel.ingredientes.filter((g) => g.ativo).map((g) => ({ ingredienteId: g.id, preparoId: null, nome: g.nome, unidade: g.unidade, preparo: false })),
      ...painel.fichas
        .filter((f) => f.tipo === "preparo" && f.ativo && f.id !== ficha?.resumo.id && f.unidadeRendimento)
        .map((f) => ({ ingredienteId: null, preparoId: f.id, nome: f.nome, unidade: f.unidadeRendimento!, preparo: true })),
    ],
    [painel, ficha?.resumo.id],
  );
  const jaNaReceita = new Set(itens.map((i) => (i.ingredienteId ? `i${i.ingredienteId}` : `p${i.preparoId}`)));
  const termo = nomeComparavel(busca);
  const achados = termo
    ? opcoes.filter((o) => !jaNaReceita.has(o.ingredienteId ? `i${o.ingredienteId}` : `p${o.preparoId}`) && nomeComparavel(o.nome).includes(termo)).slice(0, 8)
    : [];

  const mexeu = () => setSujo(true);
  const mudarItem = (k: number, m: Partial<LinhaDoItem>) => setItens((l) => l.map((i) => (i.chave === k ? { ...i, ...m } : i)));

  function porItem(o: (typeof opcoes)[number]) {
    setItens((l) => [...l, { chave: chave(), ingredienteId: o.ingredienteId, preparoId: o.preparoId, nome: o.nome, unidade: o.unidade, quantidade: "", digitada: o.unidade, medida: "", opcional: false, observacao: null }]);
    setBusca("");
    mexeu();
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setConflito(false);
    // O que a ficha nova descreve.
    const alvo: Record<string, unknown> = {};
    if (!ficha) {
      alvo.tipo = tipo;
      if (tipo === "produto") {
        if (!produtoId) return setErro(T.erros.alvo);
        alvo.produtoId = Number(produtoId);
      } else if (tipo === "tamanho") {
        if (!tamanhoId) return setErro(T.erros.alvo);
        alvo.tamanhoId = Number(tamanhoId);
      } else if (tipo === "adicional") {
        if (!adicionalId) return setErro(T.erros.alvo);
        alvo.adicionalId = Number(adicionalId);
      } else {
        alvo.unidadeRendimento = unidadeRendimento;
      }
    }
    if (ehPreparo) {
      const n = nome.trim().replace(/\s+/g, " ");
      if (n.length < 2 || n.length > 80) return setErro(T.erros.nome);
      if (!ficha || n !== ficha.resumo.nome) alvo.nome = n;
    }
    let rendeBase: string | null = null;
    if (rende.trim()) {
      rendeBase = quantidadeNaBase(rende, ehPreparo ? rendeEm : "un");
      if (rendeBase === null) return setErro(T.erros.rende);
    }
    let porcaoBase: string | null = null;
    if (porcao.trim()) {
      porcaoBase = quantidadeNaBase(porcao, porcaoUnidade);
      if (porcaoBase === null) return setErro(T.erros.porcao);
    }
    const tempoMin = inteiroDoCampo(tempo, 0, 1440);
    if (tempoMin === undefined) return setErro(T.erros.tempo);
    const validadeDias = inteiroDoCampo(validade, 0, 365);
    if (validadeDias === undefined) return setErro(T.erros.validade);
    const listaDeItens = [];
    for (const i of itens) {
      let quantidade: string | null = null;
      if (i.quantidade.trim()) {
        quantidade = quantidadeNaBase(i.quantidade, i.digitada);
        if (quantidade === null) return setErro(T.erros.quantidade(i.nome));
      }
      listaDeItens.push({
        ...(i.ingredienteId ? { ingredienteId: i.ingredienteId } : { preparoId: i.preparoId! }),
        quantidade,
        opcional: i.opcional,
        medidaCaseira: i.medida.trim() || null,
        observacao: i.observacao,
      });
    }
    const listaDeEtapas = [];
    for (const [k, et] of etapas.entries()) {
      if (!et.texto.trim()) return setErro(T.erros.etapa(k + 1));
      const minutos = inteiroDoCampo(et.minutos, 0, 1440);
      if (minutos === undefined) return setErro(T.erros.minutos(k + 1));
      listaDeEtapas.push({ texto: et.texto.trim(), minutos });
    }
    const listaDeEquipamentos = [];
    for (const [k, eq] of equipamentos.entries()) {
      const t = eq.texto.trim();
      if (t.length < 2 || t.length > 60) return setErro(T.erros.equipamento(k + 1));
      listaDeEquipamentos.push(t);
    }
    const listaDePendencias = [];
    for (const [k, p] of pendencias.entries()) {
      const t = p.texto.trim().replace(/\s+/g, " ");
      if (t.length < 2 || t.length > 200) return setErro(T.erros.pendencia(k + 1));
      listaDePendencias.push(t);
    }
    if (new Set(listaDePendencias).size !== listaDePendencias.length) return setErro(T.erros.pendenciaRepetida);

    setGravando(true);
    const r = await chamar<FichaCompleta>("/api/fichas", "POST", {
      ...(ficha ? { id: ficha.resumo.id, ...(v ? { versaoBase: v.numero } : {}) } : {}),
      ...alvo,
      receita: {
        rende: rendeBase,
        porcaoQuantidade: porcaoBase,
        porcaoUnidade: porcaoBase === null ? null : porcaoUnidade,
        tempoMin,
        validadeDias,
        etapas: listaDeEtapas,
        equipamentos: listaDeEquipamentos,
        observacoes: observacoes.trim() || null,
        motivo: motivo.trim() || null,
        itens: listaDeItens,
        pendencias: listaDePendencias,
      },
    });
    setGravando(false);
    if (!r.ok || !r.dados) {
      setErro(r.mensagem);
      setConflito(r.status === 409 && !!ficha && !!aoRecarregar);
      return;
    }
    aoSalvo(r.dados, !ficha);
  }

  const unidadesDoTipo = UNIDADES_DA_FICHA.map((u) => ({ valor: u, texto: T.unidades[u]! }));

  return (
    <JanelaModal titulo={ficha ? T.editar(ficha.resumo.nome) : T.nova} sujo={sujo} aoMexer={mexeu} aoFechar={aoFechar} data-testid="editor-da-ficha">
      <BotaoExemplos />
      <form className="hor-form fichas-editor" onSubmit={(e) => void salvar(e)} noValidate>
        {!ficha && (
          <section className="fichas-editor__bloco" aria-labelledby="ficha-o-que">
            <h3 id="ficha-o-que" className="fichas-editor__titulo">
              {T.oQue}
            </h3>
            <Selecao
              rotulo={T.tipo}
              explicacao={T.tipoAjuda}
              exemplo={T.tipoExemplo}
              value={tipo}
              onChange={(e) => {
                const t = e.target.value as TipoDeFicha;
                setTipo(t);
                if (t === "preparo" && rende === "1") setRende("");
                if (t !== "preparo" && !rende) setRende("1");
              }}
              opcoes={TIPOS_DE_FICHA.map((t) => ({ valor: t, texto: NOME_DO_TIPO_DE_FICHA[t] }))}
            />
            {tipo === "produto" &&
              (painel.semFicha.length === 0 ? (
                <p className="hor-vazio">{T.nenhumProduto}</p>
              ) : (
                <Selecao
                  rotulo={T.produto}
                  explicacao={T.produtoAjuda}
                  exemplo={T.produtoExemplo}
                  value={produtoId}
                  onChange={(e) => setProdutoId(e.target.value)}
                  opcoes={[{ valor: "", texto: "Escolha o produto" }, ...painel.semFicha.map((p) => ({ valor: String(p.id), texto: `${p.nome} (${p.categoria})` }))]}
                />
              ))}
            {tipo === "tamanho" &&
              (produtosComTamanho.length === 0 ? (
                <p className="hor-vazio">{T.nenhumTamanho}</p>
              ) : (
                <div className="linha-editavel__numeros">
                  <Selecao
                    rotulo={T.produtoDoTamanho}
                    explicacao={T.produtoDoTamanhoAjuda}
                    exemplo={T.produtoDoTamanhoExemplo}
                    value={produtoDoTamanho}
                    onChange={(e) => {
                      setProdutoDoTamanho(e.target.value);
                      setTamanhoId("");
                    }}
                    opcoes={[{ valor: "", texto: "Escolha o produto" }, ...produtosComTamanho.map((p) => ({ valor: String(p.id), texto: p.nome }))]}
                  />
                  {produtoDoTamanho && (
                    <Selecao
                      rotulo={T.tamanho}
                      explicacao={T.tamanhoAjuda}
                      exemplo={T.tamanhoExemplo}
                      value={tamanhoId}
                      onChange={(e) => setTamanhoId(e.target.value)}
                      opcoes={[
                        { valor: "", texto: "Escolha o tamanho" },
                        ...tamanhosLivres.filter((t) => String(t.produtoId) === produtoDoTamanho).map((t) => ({ valor: String(t.id), texto: t.nome })),
                      ]}
                    />
                  )}
                </div>
              ))}
            {tipo === "adicional" &&
              (adicionaisLivres.length === 0 ? (
                <p className="hor-vazio">{T.nenhumAdicional}</p>
              ) : (
                <Selecao
                  rotulo={T.adicional}
                  explicacao={T.adicionalAjuda}
                  exemplo={T.adicionalExemplo}
                  value={adicionalId}
                  onChange={(e) => setAdicionalId(e.target.value)}
                  opcoes={[{ valor: "", texto: "Escolha o adicional" }, ...adicionaisLivres.map((a) => ({ valor: String(a.id), texto: `${a.nome} (${a.grupo})` }))]}
                />
              ))}
            {tipo === "preparo" && (
              <Selecao
                rotulo={T.unidadeRendimento}
                explicacao={T.unidadeRendimentoAjuda}
                exemplo={T.unidadeRendimentoExemplo}
                value={unidadeRendimento}
                onChange={(e) => {
                  const u = e.target.value as UnidadeDaFicha;
                  setUnidadeRendimento(u);
                  setRendeEm(u);
                }}
                opcoes={unidadesDoTipo}
              />
            )}
          </section>
        )}
        {ehPreparo && (
          <Campo rotulo={T.nomePreparo} explicacao={T.nomePreparoAjuda} exemplo={T.nomePreparoExemplo} value={nome} maxLength={80} autoComplete="off" onChange={(e) => setNome(e.target.value)} />
        )}

        <section className="fichas-editor__bloco" aria-labelledby="ficha-rendimento">
          <h3 id="ficha-rendimento" className="fichas-editor__titulo">
            {T.rendimento}
          </h3>
          <div className="linha-editavel__numeros">
            {ehPreparo ? (
              <>
                <Campo rotulo={T.rendePreparo} explicacao={T.rendePreparoAjuda} exemplo={T.rendePreparoExemplo} value={rende} inputMode="decimal" maxLength={16} autoComplete="off" onChange={(e) => setRende(e.target.value)} />
                {unidadesParaDigitar(unidadeDoPreparo).length > 1 && (
                  <Selecao
                    rotulo={T.unidadeDoRende}
                    explicacao={T.unidadeDoRendeAjuda}
                    exemplo={T.unidadeDoRendeExemplo}
                    value={rendeEm}
                    onChange={(e) => setRendeEm(e.target.value as UnidadeDigitada)}
                    opcoes={unidadesParaDigitar(unidadeDoPreparo).map((u) => ({ valor: u, texto: u }))}
                  />
                )}
              </>
            ) : (
              <Campo rotulo={T.rendeProduto} explicacao={T.rendeProdutoAjuda} exemplo={T.rendeProdutoExemplo} value={rende} inputMode="decimal" maxLength={16} autoComplete="off" onChange={(e) => setRende(e.target.value)} />
            )}
          </div>
          <div className="linha-editavel__numeros">
            <Campo rotulo={T.porcao} explicacao={T.porcaoAjuda} exemplo={T.porcaoExemplo} value={porcao} inputMode="decimal" maxLength={16} autoComplete="off" onChange={(e) => setPorcao(e.target.value)} />
            <Selecao rotulo={T.porcaoUnidade} explicacao={T.porcaoUnidadeAjuda} exemplo={T.porcaoUnidadeExemplo} value={porcaoUnidade} onChange={(e) => setPorcaoUnidade(e.target.value as UnidadeDaFicha)} opcoes={unidadesDoTipo} />
          </div>
          <div className="linha-editavel__numeros">
            <Campo rotulo={T.tempo} explicacao={T.tempoAjuda} exemplo={T.tempoExemplo} value={tempo} inputMode="numeric" maxLength={4} autoComplete="off" onChange={(e) => setTempo(e.target.value)} />
            <Campo rotulo={T.validade} explicacao={T.validadeAjuda} exemplo={T.validadeExemplo} value={validade} inputMode="numeric" maxLength={3} autoComplete="off" onChange={(e) => setValidade(e.target.value)} />
          </div>
        </section>

        <Grupo legenda={T.itens} explicacao={T.itensAjuda} exemplo={T.itensExemplo} className="linha-editavel" ajudaNoTopo>
          {itens.length < ITENS_POR_FICHA ? (
            <div className="fichas-editor__busca">
              <Campo rotulo={T.procurar} explicacao={T.procurarAjuda} exemplo={T.procurarExemplo} value={busca} maxLength={60} autoComplete="off" onChange={(e) => setBusca(e.target.value)} />
              {termo && (
                <ul className="fichas-editor__achados" aria-label={T.achados} data-testid="achados">
                  {achados.length === 0 ? (
                    <li className="hor-vazio">{T.nadaAchado}</li>
                  ) : (
                    achados.map((o) => (
                      <li key={o.ingredienteId ? `i${o.ingredienteId}` : `p${o.preparoId}`}>
                        <Botao variante="secundario" onClick={() => porItem(o)}>
                          <Icone nome="mais" />
                          {T.adicionarItem(o.nome, o.unidade)}
                          {o.preparo && <span className="fichas-editor__tipo"> ({TF.ficha.preparo})</span>}
                        </Botao>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          ) : (
            <p className="hor-secao__intro">{T.limiteItens(ITENS_POR_FICHA)}</p>
          )}
          {itens.length === 0 ? (
            <p className="hor-vazio">{T.nenhumItem}</p>
          ) : (
            <ol className="linha-editavel__lista" data-testid="itens-da-ficha">
              {itens.map((i, k) => {
                const unidades = unidadesParaDigitar(i.unidade);
                return (
                  <li key={i.chave} className="linha-editavel__linha" role="group" aria-label={i.nome}>
                    <div className="linha-editavel__campos">
                      <p className="linha-editavel__texto fichas-editor__nome">
                        <span className="linha-editavel__titulo">{i.nome}</span>
                        <span className="linha-editavel__detalhe">{i.preparoId ? `${TF.ficha.preparo}, em ${i.unidade}` : `em ${i.unidade}`}</span>
                      </p>
                      <CampoDoGrupo rotulo={T.quantidade} complemento={T.complemento(i.nome)} className="linha-editavel__numero" value={i.quantidade} inputMode="decimal" maxLength={16} autoComplete="off" onChange={(e) => mudarItem(i.chave, { quantidade: e.target.value })} />
                      {unidades.length > 1 && (
                        <SelecaoDoGrupo
                          rotulo={T.unidadeDigitada}
                          complemento={T.complemento(i.nome)}
                          className="linha-editavel__numero"
                          value={i.digitada}
                          onChange={(e) => mudarItem(i.chave, { digitada: e.target.value as UnidadeDigitada })}
                          opcoes={unidades.map((u) => ({ valor: u, texto: u }))}
                        />
                      )}
                      <CampoDoGrupo rotulo={T.medida} complemento={T.complemento(i.nome)} className="linha-editavel__nome" value={i.medida} placeholder={T.medidaPlaceholder} maxLength={60} autoComplete="off" onChange={(e) => mudarItem(i.chave, { medida: e.target.value })} />
                      <OpcaoDoGrupo rotulo={`${T.opcional} ${T.complemento(i.nome)}`} conteudo={T.opcional} className="cadastros__opcao" checked={i.opcional} onChange={(e) => mudarItem(i.chave, { opcional: e.target.checked })} />
                    </div>
                    <BotoesDaLinha
                      nome={i.nome}
                      indice={k}
                      total={itens.length}
                      aoMover={(passo) => {
                        setItens((l) => mover(l, k, passo));
                        mexeu();
                      }}
                      aoRemover={() => {
                        setItens((l) => l.filter((x) => x.chave !== i.chave));
                        mexeu();
                      }}
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </Grupo>

        <Grupo legenda={T.pendencias} explicacao={T.pendenciasAjuda} exemplo={T.pendenciasExemplo} className="linha-editavel" ajudaNoTopo>
          {pendencias.length === 0 ? (
            <p className="hor-vazio">{T.semPendencias}</p>
          ) : (
            <ol className="linha-editavel__lista" data-testid="pendencias-anotadas">
              {pendencias.map((p, k) => (
                <li key={p.chave} className="linha-editavel__linha">
                  <div className="linha-editavel__campos">
                    <CampoDoGrupo rotulo={`${T.pendencia} ${k + 1}`} className="fichas-editor__texto" value={p.texto} maxLength={200} autoComplete="off" onChange={(e) => setPendencias((l) => l.map((x) => (x.chave === p.chave ? { ...x, texto: e.target.value } : x)))} />
                  </div>
                  <Botao
                    variante="secundario"
                    aria-label={T.removerPendencia(k + 1)}
                    onClick={() => {
                      setPendencias((l) => l.filter((x) => x.chave !== p.chave));
                      mexeu();
                    }}
                  >
                    {T.remover}
                  </Botao>
                </li>
              ))}
            </ol>
          )}
          {pendencias.length < PENDENCIAS_POR_FICHA && (
            <Botao
              variante="secundario"
              className="linha-editavel__adicionar"
              onClick={() => {
                setPendencias((l) => [...l, { chave: chave(), texto: "" }]);
                mexeu();
              }}
            >
              <Icone nome="mais" />
              {T.anotarPendencia}
            </Botao>
          )}
        </Grupo>

        <Grupo legenda={T.etapas} explicacao={T.etapasAjuda} exemplo={T.etapasExemplo} className="linha-editavel" ajudaNoTopo>
          {etapas.length === 0 ? (
            <p className="hor-vazio">{T.semEtapas}</p>
          ) : (
            <ol className="linha-editavel__lista" data-testid="etapas-da-ficha">
              {etapas.map((et, k) => (
                <li key={et.chave} className="linha-editavel__linha" role="group" aria-label={`${T.etapa} ${k + 1}`}>
                  <div className="linha-editavel__campos">
                    <CampoDoGrupo rotulo={`${T.etapa} ${k + 1}`} className="fichas-editor__texto" value={et.texto} maxLength={500} autoComplete="off" onChange={(e) => setEtapas((l) => l.map((x) => (x.chave === et.chave ? { ...x, texto: e.target.value } : x)))} />
                    <CampoDoGrupo rotulo={T.minutos} complemento={`da etapa ${k + 1}`} className="linha-editavel__numero" value={et.minutos} inputMode="numeric" maxLength={4} autoComplete="off" onChange={(e) => setEtapas((l) => l.map((x) => (x.chave === et.chave ? { ...x, minutos: e.target.value } : x)))} />
                  </div>
                  <BotoesDaLinha
                    nome={`${T.etapa} ${k + 1}`}
                    indice={k}
                    total={etapas.length}
                    aoMover={(passo) => {
                      setEtapas((l) => mover(l, k, passo));
                      mexeu();
                    }}
                    aoRemover={() => {
                      setEtapas((l) => l.filter((x) => x.chave !== et.chave));
                      mexeu();
                    }}
                  />
                </li>
              ))}
            </ol>
          )}
          {etapas.length < ETAPAS_POR_FICHA && (
            <Botao
              variante="secundario"
              className="linha-editavel__adicionar"
              onClick={() => {
                setEtapas((l) => [...l, { chave: chave(), texto: "", minutos: "" }]);
                mexeu();
              }}
            >
              <Icone nome="mais" />
              {T.adicionarEtapa}
            </Botao>
          )}
        </Grupo>

        <Grupo legenda={T.equipamentos} explicacao={T.equipamentosAjuda} exemplo={T.equipamentosExemplo} className="linha-editavel" ajudaNoTopo>
          {equipamentos.length === 0 ? (
            <p className="hor-vazio">{T.semEquipamentos}</p>
          ) : (
            <ol className="linha-editavel__lista">
              {equipamentos.map((eq, k) => (
                <li key={eq.chave} className="linha-editavel__linha">
                  <div className="linha-editavel__campos">
                    <CampoDoGrupo rotulo={`${T.equipamento} ${k + 1}`} className="linha-editavel__nome" value={eq.texto} maxLength={60} autoComplete="off" onChange={(e) => setEquipamentos((l) => l.map((x) => (x.chave === eq.chave ? { ...x, texto: e.target.value } : x)))} />
                  </div>
                  <Botao
                    variante="secundario"
                    aria-label={T.removerEquipamento(k + 1)}
                    onClick={() => {
                      setEquipamentos((l) => l.filter((x) => x.chave !== eq.chave));
                      mexeu();
                    }}
                  >
                    {T.remover}
                  </Botao>
                </li>
              ))}
            </ol>
          )}
          {equipamentos.length < EQUIPAMENTOS_POR_FICHA && (
            <Botao
              variante="secundario"
              className="linha-editavel__adicionar"
              onClick={() => {
                setEquipamentos((l) => [...l, { chave: chave(), texto: "" }]);
                mexeu();
              }}
            >
              <Icone nome="mais" />
              {T.adicionarEquipamento}
            </Botao>
          )}
        </Grupo>

        <AreaDeTexto rotulo={T.observacoes} explicacao={T.observacoesAjuda} exemplo={T.observacoesExemplo} value={observacoes} maxLength={2000} rows={3} onChange={(e) => setObservacoes(e.target.value)} />
        {ficha && <Campo rotulo={T.motivo} explicacao={T.motivoAjuda} exemplo={T.motivoExemplo} value={motivo} maxLength={200} autoComplete="off" onChange={(e) => setMotivo(e.target.value)} />}

        <div aria-live="polite">
          {erro && (
            <Aviso tipo="perigo">
              {erro}
              {conflito && (
                <>
                  {" "}
                  <Botao variante="secundario" onClick={aoRecarregar}>
                    {T.recarregar}
                  </Botao>
                </>
              )}
            </Aviso>
          )}
        </div>
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={gravando}>
            {ficha ? T.salvar : T.criar}
          </Botao>
          <BotaoCancelar />
        </div>
      </form>
    </JanelaModal>
  );
}
