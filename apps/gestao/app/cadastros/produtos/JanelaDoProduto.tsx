"use client";

/**
 * Janela para criar ou editar um produto (nome, categoria, preço, preço no delivery, tamanhos,
 * grupos de adicionais, prévia "Quanto fica", tipo de produção, tempo de preparo, descrição e
 * posição na categoria). Grava em /api/cadastros/produtos.
 * O preço é digitado em reais ("12,50") e vai em centavos inteiros (`centavosDoTexto`, nunca float).
 * Tamanhos e grupos vão SEMPRE com a lista completa, na ordem (o que não vier fica inativo), e os
 * tamanhos que já existiam levam o `id` (decisão 0021).
 * Combo (decisão 0023): "É um combo?" marcado esconde o tipo, o tempo e os tamanhos (vão
 * `tipoProducaoId: null` e `tamanhos: []`) e mostra "Partes do combo" (`PartesDoCombo.tsx`); vai a
 * lista completa de partes e opções, com os ids que já existiam. Desmarcar manda `combo: null`.
 * A foto (decisão 0022) fica em `FotoDoProduto.tsx`: no produto que já existe vai na hora; no novo,
 * vai logo depois de criar. Se a foto falhar, o produto fica criado e a janela continua aberta,
 * com o erro e "Tentar de novo" (salvar de novo altera o mesmo produto, não cria outro).
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao } from "@erp/interface";
import {
  centavosDoTexto,
  PRECO_MAXIMO_CENTAVOS,
  TEMPO_DE_PREPARO_MAXIMO,
  textoDosCentavos,
  type GrupoDeAdicionais,
  type Produto,
  type Tamanho,
} from "@erp/dominio/produtos";
import { NOME_DA_AREA_DE_PRODUCAO, type TipoDeProducao } from "@erp/dominio/tipos-producao";
import { chamar } from "../../chamar";
import { AreaDeTexto, BotaoExemplos, Campo, Grupo, Marcador, OpcaoDoGrupo, Selecao } from "../../Campo";
import { PosicaoNaLista } from "../PosicaoNaLista";
import { JanelaModal, usarPedirFechar } from "../JanelaModal";
import type { Categoria } from "../horarios/contas";
import { AdicionaisDoProduto } from "./AdicionaisDoProduto";
import { FotoDoProduto } from "./FotoDoProduto";
import { nomeDaOpcao, nomeDaParte, novaChaveDoCombo, opcaoForaDeVenda, PartesDoCombo, type LinhaDaParte } from "./PartesDoCombo";
import { PreviaDoPreco } from "./PreviaDoPreco";
import { nomeDoTamanho, novaChaveDeTamanho, TamanhosDoProduto, type LinhaDoTamanho } from "./TamanhosDoProduto";
import { TP } from "./textos";

/** Valor da opção "não passa pela produção" (o tipo vai nulo). */
const SEM_PRODUCAO = "sem";

const reais = (centavos: number) => textoDosCentavos(centavos).replace("R$ ", "");

/** Reais digitados -> centavos de 0 (ou `minimo`) até o máximo; null se inválido. */
function dinheiro(texto: string, minimo = 0): number | null {
  const c = centavosDoTexto(texto);
  return c === null || c < minimo || c > PRECO_MAXIMO_CENTAVOS ? null : c;
}

function BotaoCancelar() {
  const pedirFechar = usarPedirFechar();
  return (
    <Botao variante="secundario" onClick={pedirFechar}>
      {TP.janela.cancelar}
    </Botao>
  );
}

export function JanelaDoProduto({
  produto,
  produtos,
  categorias,
  tipos,
  grupos,
  podeGerenciar,
  aoFechar,
  aoSalvo,
  aoMudouSemFechar,
}: {
  /** Sem ele, cria um novo. */
  produto?: Produto;
  /** Todos os produtos, na ordem do cardápio (para a posição dentro da categoria). */
  produtos: Produto[];
  /** Todas as categorias, na ordem do cardápio. */
  categorias: Categoria[];
  /** Todos os tipos de produção. */
  tipos: TipoDeProducao[];
  /** Todos os grupos de adicionais (para escolher e para a prévia do preço). */
  grupos: GrupoDeAdicionais[];
  /** `cadastros.gerenciar`: sem ela, a foto aparece sem botões (o servidor confere de novo). */
  podeGerenciar: boolean;
  aoFechar: () => void;
  aoSalvo: (p: Produto, criado: boolean) => void;
  /** Algo foi gravado e a janela continua aberta (foto trocada, ou produto criado com a foto falhando). */
  aoMudouSemFechar: () => void;
}) {
  const [sujo, setSujo] = useState(false);
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [categoriaId, setCategoriaId] = useState<number | null>(produto?.categoriaId ?? null);
  const [preco, setPreco] = useState(produto ? textoDosCentavos(produto.precoCentavos).replace("R$ ", "") : "");
  const [tipo, setTipo] = useState(produto ? (produto.tipoProducaoId === null ? SEM_PRODUCAO : String(produto.tipoProducaoId)) : "");
  const [tempo, setTempo] = useState(produto?.tempoPreparoMin != null ? String(produto.tempoPreparoMin) : "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [mesmoPreco, setMesmoPreco] = useState(produto?.precoDeliveryCentavos == null);
  const [precoDelivery, setPrecoDelivery] = useState(produto?.precoDeliveryCentavos != null ? reais(produto.precoDeliveryCentavos) : "");
  const [tamanhos, setTamanhos] = useState<LinhaDoTamanho[]>(() =>
    (produto?.tamanhos ?? []).map((t) => ({
      chave: novaChaveDeTamanho(),
      id: t.id,
      nome: t.nome,
      acrescimo: reais(t.acrescimoCentavos),
      delivery: t.acrescimoDeliveryCentavos === null ? "" : reais(t.acrescimoDeliveryCentavos),
    })),
  );
  const [acrescimoDiferente, setAcrescimoDiferente] = useState((produto?.tamanhos ?? []).some((t) => t.acrescimoDeliveryCentavos !== null));
  const [gruposLigados, setGruposLigados] = useState<number[]>(produto?.gruposAdicionais ?? []);
  const [eCombo, setECombo] = useState(produto?.combo != null);
  const [confirmandoDesfazerCombo, setConfirmandoDesfazerCombo] = useState(false);
  const [partes, setPartes] = useState<LinhaDaParte[]>(() =>
    (produto?.combo?.partes ?? []).map((p) => ({
      chave: novaChaveDoCombo(),
      id: p.id,
      nome: p.nome,
      opcoes: p.opcoes.map((o) => ({
        chave: novaChaveDoCombo(),
        id: o.id,
        produtoId: String(o.produtoId),
        tamanhoId: o.tamanhoId === null ? "" : String(o.tamanhoId),
        acrescimo: reais(o.acrescimoCentavos),
        delivery: o.acrescimoDeliveryCentavos === null ? "" : reais(o.acrescimoDeliveryCentavos),
      })),
    })),
  );
  const [acrescimoDiferenteCombo, setAcrescimoDiferenteCombo] = useState((produto?.combo?.partes ?? []).some((p) => p.opcoes.some((o) => o.acrescimoDeliveryCentavos !== null)));

  // Produto novo já criado, esperando a foto ir (ou tendo falhado).
  const [criado, setCriado] = useState<Produto | null>(null);
  const [temFotoPendente, setTemFotoPendente] = useState(false);
  const [pedidoDeEnvio, setPedidoDeEnvio] = useState(0);
  const idGravado = produto?.id ?? criado?.id ?? null;

  // Os produtos ativos de uma categoria, na ordem (para escolher a posição).
  const daCategoria = (id: number | null) => (id === null ? [] : produtos.filter((p) => p.ativo && p.categoriaId === id).map((p) => ({ id: p.id, nome: p.nome })));
  const fimDa = (id: number | null) => daCategoria(id).filter((i) => i.id !== idGravado).length + 1;
  const indice = produto ? daCategoria(produto.categoriaId).findIndex((i) => i.id === produto.id) : -1;
  const posicaoInicial = indice >= 0 ? indice + 1 : fimDa(produto?.categoriaId ?? null);
  const [posicao, setPosicao] = useState(posicaoInicial);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  const passaPelaProducao = !eCombo && tipo !== "" && tipo !== SEM_PRODUCAO;
  const deliveryNosTamanhos = !mesmoPreco || acrescimoDiferente;
  const deliveryNasOpcoes = !mesmoPreco || acrescimoDiferenteCombo;
  const porId = new Map(produtos.map((p) => [p.id, p]));

  // Botões das listas (subir, descer, remover, adicionar) não disparam input: marcam "mexido" aqui.
  const mudarTamanhos = (l: LinhaDoTamanho[]) => {
    setTamanhos(l);
    setSujo(true);
  };
  const mudarGrupos = (l: number[]) => {
    setGruposLigados(l);
    setSujo(true);
  };
  const mudarPartes = (l: LinhaDaParte[]) => {
    setPartes(l);
    setSujo(true);
  };
  function marcarCombo(marcado: boolean) {
    if (marcado) {
      setECombo(true);
      // Combo começa com uma parte vazia, pronta para preencher.
      if (partes.length === 0) setPartes([{ chave: novaChaveDoCombo(), nome: "", opcoes: [{ chave: novaChaveDoCombo(), produtoId: "", tamanhoId: "", acrescimo: "0,00", delivery: "" }] }]);
      return;
    }
    // Já há partes: pergunta antes (desmontar o combo tira as partes ao salvar).
    if (partes.length > 0) return setConfirmandoDesfazerCombo(true);
    desfazerCombo();
  }
  function desfazerCombo() {
    setConfirmandoDesfazerCombo(false);
    setECombo(false);
    setPartes([]);
    setSujo(true);
    // Era combo e fica sem tipo: a pessoa escolhe de novo se passa pela produção.
    if (produto?.combo && tipo === SEM_PRODUCAO) setTipo("");
  }

  /**
   * Partes como estão na janela, com ids provisórios (para a prévia) ou nulo se alguma opção ainda
   * não tem produto, tamanho ou acréscimo válido.
   */
  function comboDaJanela(): { combo: NonNullable<Produto["combo"]> | null; motivo: string } {
    if (partes.length === 0 || partes.some((p) => p.opcoes.length === 0)) return { combo: null, motivo: TP.janela.previaFaltaParte };
    let n = 0;
    const lista = [];
    for (const [k, p] of partes.entries()) {
      const opcoes = [];
      for (const [j, o] of p.opcoes.entries()) {
        const prod = o.produtoId ? porId.get(Number(o.produtoId)) : undefined;
        if (!o.produtoId || (prod && prod.tamanhos.length > 0 && !o.tamanhoId && !opcaoForaDeVenda(o, porId, idGravado))) return { combo: null, motivo: TP.janela.previaFaltaOpcao };
        const acrescimo = dinheiro(o.acrescimo);
        const noDelivery = deliveryNasOpcoes && o.delivery.trim() ? dinheiro(o.delivery) : null;
        if (acrescimo === null || (deliveryNasOpcoes && o.delivery.trim() && noDelivery === null)) return { combo: null, motivo: TP.janela.previaConfira };
        opcoes.push({ id: ++n, produtoId: Number(o.produtoId), tamanhoId: o.tamanhoId ? Number(o.tamanhoId) : null, acrescimoCentavos: acrescimo, acrescimoDeliveryCentavos: noDelivery, ordem: j });
      }
      lista.push({ id: k + 1, nome: nomeDaParte(p, k), ordem: k, opcoes });
    }
    return { combo: { partes: lista }, motivo: "" };
  }

  // Produto como está na janela, para a prévia (tamanhos com ids provisórios). Nulo se falta algo.
  function produtoDaJanela(): { produto: Produto | null; motivo: string } {
    const base = dinheiro(preco, 1);
    if (base === null) return { produto: null, motivo: TP.janela.previaFaltaPreco };
    const delivery = mesmoPreco ? null : dinheiro(precoDelivery, 1);
    if (!mesmoPreco && delivery === null) return { produto: null, motivo: TP.janela.previaConfira };
    const lista: Tamanho[] = [];
    let combo: Produto["combo"] = null;
    if (eCombo) {
      const c = comboDaJanela();
      if (!c.combo) return { produto: null, motivo: c.motivo };
      combo = c.combo;
    } else for (const [k, t] of tamanhos.entries()) {
      const acrescimo = dinheiro(t.acrescimo);
      const noDelivery = deliveryNosTamanhos && t.delivery.trim() ? dinheiro(t.delivery) : null;
      if (acrescimo === null || (deliveryNosTamanhos && t.delivery.trim() && noDelivery === null)) return { produto: null, motivo: TP.janela.previaConfira };
      lista.push({ id: k + 1, nome: nomeDoTamanho(t, k), acrescimoCentavos: acrescimo, acrescimoDeliveryCentavos: noDelivery, ordem: k });
    }
    return {
      produto: {
        id: produto?.id ?? 0,
        fotoId: null,
        combo,
        nome: nome.trim() || TP.janela.novo,
        descricao: null,
        categoriaId: categoriaId ?? 0,
        tipoProducaoId: null,
        precoCentavos: base,
        tempoPreparoMin: null,
        precoDeliveryCentavos: delivery,
        ordem: 0,
        ativo: true,
        tamanhos: lista,
        gruposAdicionais: gruposLigados,
      },
      motivo: "",
    };
  }
  const previa = produtoDaJanela();

  // Só as ativas (e a atual, se foi desativada depois: o produto continua nela).
  const opcoesDeCategoria = [
    ...(categoriaId === null ? [{ valor: "", texto: TP.janela.escolhaCategoria }] : []),
    ...categorias
      .filter((c) => c.ativo || c.id === produto?.categoriaId)
      .map((c) => ({ valor: String(c.id), texto: c.ativo ? c.nome : TP.janela.categoriaDesativada(c.nome) })),
  ];
  const opcoesDeTipo = [
    ...(tipo === "" ? [{ valor: "", texto: TP.janela.escolhaTipo }] : []),
    { valor: SEM_PRODUCAO, texto: TP.janela.semProducao },
    ...tipos
      .filter((t) => t.ativo || t.id === produto?.tipoProducaoId)
      .map((t) => {
        const texto = TP.janela.opcaoTipo(t.nome, NOME_DA_AREA_DE_PRODUCAO[t.area]);
        return { valor: String(t.id), texto: t.ativo ? texto : TP.janela.tipoDesativado(texto) };
      }),
  ];

  function mudarCategoria(valor: string) {
    const nova = valor ? Number(valor) : null;
    setCategoriaId(nova);
    // Na categoria nova, o padrão é "no fim"; voltando para a de antes, o lugar de antes.
    setPosicao(produto && nova === produto.categoriaId ? posicaoInicial : fimDa(nova));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 2) return setErro(TP.janela.faltaNome);
    if (categoriaId === null) return setErro(TP.janela.faltaCategoria);
    const centavos = centavosDoTexto(preco);
    if (centavos === null) return setErro(TP.janela.precoInvalido);
    if (centavos < 1 || centavos > PRECO_MAXIMO_CENTAVOS) return setErro(TP.janela.precoForaDoLimite(textoDosCentavos(PRECO_MAXIMO_CENTAVOS)));
    let centavosDelivery: number | null = null;
    if (!mesmoPreco) {
      centavosDelivery = centavosDoTexto(precoDelivery);
      if (centavosDelivery === null) return setErro(TP.janela.precoDeliveryInvalido);
      if (centavosDelivery < 1 || centavosDelivery > PRECO_MAXIMO_CENTAVOS) return setErro(TP.janela.precoDeliveryForaDoLimite(textoDosCentavos(PRECO_MAXIMO_CENTAVOS)));
    }
    const listaDeTamanhos = [];
    for (const [k, t] of (eCombo ? [] : tamanhos).entries()) {
      if (!t.nome.trim()) return setErro(TP.janela.faltaNomeTamanho(k + 1));
      const acrescimo = dinheiro(t.acrescimo);
      if (acrescimo === null) return setErro(TP.janela.acrescimoInvalido(t.nome.trim()));
      let noDelivery: number | null = null;
      if (deliveryNosTamanhos && t.delivery.trim()) {
        noDelivery = dinheiro(t.delivery);
        if (noDelivery === null) return setErro(TP.janela.acrescimoDeliveryInvalido(t.nome.trim()));
      }
      listaDeTamanhos.push({ ...(t.id ? { id: t.id } : {}), nome: t.nome.trim(), acrescimoCentavos: acrescimo, acrescimoDeliveryCentavos: noDelivery });
    }
    // Combo: a lista completa de partes e opções, na ordem, com os ids que já existiam.
    let combo: unknown = undefined;
    if (eCombo) {
      if (partes.length === 0) return setErro(TP.janela.faltaParte);
      const listaDePartes = [];
      for (const [k, p] of partes.entries()) {
        const nomeP = p.nome.trim();
        if (!nomeP) return setErro(TP.janela.faltaNomeParte(k + 1));
        if (p.opcoes.length === 0) return setErro(TP.janela.faltaOpcao(nomeP));
        const opcoes = [];
        for (const [j, o] of p.opcoes.entries()) {
          if (!o.produtoId) return setErro(TP.janela.faltaProdutoOpcao(nomeP, j + 1));
          if (opcaoForaDeVenda(o, porId, idGravado)) return setErro(TP.janela.opcaoForaDeVenda(nomeP, nomeDaOpcao(o, j, porId)));
          const prod = porId.get(Number(o.produtoId));
          if (prod && prod.tamanhos.length > 0 && !o.tamanhoId) return setErro(TP.janela.faltaTamanhoOpcao(nomeP, prod.nome));
          const acrescimo = dinheiro(o.acrescimo);
          if (acrescimo === null) return setErro(TP.janela.acrescimoOpcaoInvalido(nomeP, j + 1));
          let noDelivery: number | null = null;
          if (deliveryNasOpcoes && o.delivery.trim()) {
            noDelivery = dinheiro(o.delivery);
            if (noDelivery === null) return setErro(TP.janela.acrescimoDeliveryOpcaoInvalido(nomeP, j + 1));
          }
          opcoes.push({
            ...(o.id ? { id: o.id } : {}),
            produtoId: Number(o.produtoId),
            tamanhoId: o.tamanhoId ? Number(o.tamanhoId) : null,
            acrescimoCentavos: acrescimo,
            acrescimoDeliveryCentavos: noDelivery,
          });
        }
        listaDePartes.push({ ...(p.id ? { id: p.id } : {}), nome: nomeP, opcoes });
      }
      combo = { partes: listaDePartes };
    } else if (produto?.combo) combo = null; // desmonta o combo
    if (!eCombo && tipo === "") return setErro(TP.janela.faltaTipo);
    const min = tempo.trim();
    if (passaPelaProducao && (!/^\d{1,3}$/.test(min) || Number(min) < 1 || Number(min) > TEMPO_DE_PREPARO_MAXIMO)) return setErro(TP.janela.tempoInvalido(TEMPO_DE_PREPARO_MAXIMO));
    const mudouDeCategoria = !!produto && categoriaId !== produto.categoriaId;
    setGravando(true);
    const r = await chamar<Produto>("/api/cadastros/produtos", "POST", {
      ...(idGravado !== null ? { id: idGravado } : {}),
      nome: nome.trim(),
      categoriaId,
      precoCentavos: centavos,
      // Nulo = o delivery cobra o mesmo preço da loja.
      precoDeliveryCentavos: centavosDelivery,
      // Sempre a lista completa, na ordem: o que não vier fica inativo no servidor.
      tamanhos: listaDeTamanhos,
      gruposAdicionais: gruposLigados,
      // Sem tipo, o servidor tira o tempo junto.
      // Combo: nunca passa pela produção como um todo (cada opção vai para a tela dela).
      ...(passaPelaProducao ? { tipoProducaoId: Number(tipo), tempoPreparoMin: Number(min) } : { tipoProducaoId: null }),
      ...(combo !== undefined ? { combo } : {}),
      descricao: descricao.trim() || null,
      // Produto desativado não entra na lista: a posição só vale para os ativos.
      // Só manda a posição se é novo, se a pessoa mudou o lugar ou se mudou a categoria:
      // editar o preço não desfaz a ordem que outra pessoa mudou.
      ...(!produto || (produto.ativo && (mudouDeCategoria || posicao !== posicaoInicial)) ? { posicao } : {}),
    });
    setGravando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    if (!produto && temFotoPendente) {
      // Produto criado: agora a foto vai. Fechar a janela daqui em diante não perde o produto.
      setCriado(r.dados);
      setSujo(false);
      setPedidoDeEnvio((n) => n + 1);
      aoMudouSemFechar();
      return;
    }
    aoSalvo(r.dados, !produto);
  }

  function fotoGravada() {
    // Produto novo: a foto foi, agora sim fecha. Produto que já existe: a lista atualiza a miniatura.
    if (criado) return aoSalvo(criado, true);
    aoMudouSemFechar();
  }

  return (
    <JanelaModal titulo={produto ? TP.janela.editar(produto.nome) : TP.janela.novo} sujo={sujo} aoMexer={() => setSujo(true)} aoFechar={aoFechar} data-testid="janela-produto">
      <BotaoExemplos />
      <form className="hor-form" onSubmit={(e) => void salvar(e)} noValidate>
        <Campo rotulo={TP.janela.nome} explicacao={TP.janela.nomeAjuda} exemplo={TP.janela.nomeExemplo} value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} required autoComplete="off" />
        <FotoDoProduto
          nomeDoProduto={nome}
          produtoId={idGravado}
          fotoId={produto?.fotoId ?? null}
          podeGerenciar={podeGerenciar}
          pedidoDeEnvio={pedidoDeEnvio}
          aoMudarPendente={(tem) => {
            setTemFotoPendente(tem);
            if (tem && idGravado === null) setSujo(true);
          }}
          aoGravada={fotoGravada}
        />
        <Selecao rotulo={TP.janela.categoria} explicacao={TP.janela.categoriaAjuda} exemplo={TP.janela.categoriaExemplo} opcoes={opcoesDeCategoria} value={categoriaId === null ? "" : String(categoriaId)} onChange={(e) => mudarCategoria(e.target.value)} />
        <Campo rotulo={TP.janela.preco} explicacao={TP.janela.precoAjuda} exemplo={TP.janela.precoExemplo} value={preco} inputMode="decimal" maxLength={14} onChange={(e) => setPreco(e.target.value)} autoComplete="off" />
        <Grupo legenda={TP.janela.delivery} explicacao={TP.janela.deliveryAjuda} exemplo={TP.janela.deliveryExemplo} className="linha-editavel" ajudaNoTopo>
          <OpcaoDoGrupo rotulo={TP.janela.mesmoPreco} className="cadastros__opcao" checked={mesmoPreco} onChange={(e) => setMesmoPreco(e.target.checked)} />
          {!mesmoPreco && (
            <Campo rotulo={TP.janela.precoDelivery} explicacao={TP.janela.precoDeliveryAjuda} exemplo={TP.janela.precoDeliveryExemplo} value={precoDelivery} inputMode="decimal" maxLength={14} onChange={(e) => setPrecoDelivery(e.target.value)} autoComplete="off" />
          )}
        </Grupo>
        <Marcador rotulo={TP.janela.eCombo} explicacao={TP.janela.eComboAjuda} exemplo={TP.janela.eComboExemplo} checked={eCombo} onChange={(e) => marcarCombo(e.target.checked)} />
        {confirmandoDesfazerCombo && (
          <div className="hor-confirmar" role="alertdialog" aria-label={TP.janela.deixarDeSerCombo}>
            <p>{TP.janela.deixarDeSerCombo}</p>
            <div className="cadastros__botoes">
              <Botao variante="perigo" onClick={desfazerCombo}>
                {TP.janela.simDeixar}
              </Botao>
              <Botao variante="secundario" onClick={() => setConfirmandoDesfazerCombo(false)}>
                {TP.janela.naoDeixar}
              </Botao>
            </div>
          </div>
        )}
        {eCombo ? (
          <PartesDoCombo
            partes={partes}
            aoMudar={mudarPartes}
            produtos={produtos}
            categorias={categorias}
            comboId={idGravado}
            precoProprioNoDelivery={!mesmoPreco}
            acrescimoDiferente={acrescimoDiferenteCombo}
            aoMudarAcrescimoDiferente={setAcrescimoDiferenteCombo}
          />
        ) : (
          <>
            <Selecao rotulo={TP.janela.tipo} explicacao={TP.janela.tipoAjuda} exemplo={TP.janela.tipoExemplo} opcoes={opcoesDeTipo} value={tipo} onChange={(e) => setTipo(e.target.value)} />
            {passaPelaProducao && (
              <Campo rotulo={TP.janela.tempo} explicacao={TP.janela.tempoAjuda(TEMPO_DE_PREPARO_MAXIMO)} exemplo={TP.janela.tempoExemplo} value={tempo} inputMode="numeric" maxLength={3} onChange={(e) => setTempo(e.target.value)} autoComplete="off" />
            )}
            <TamanhosDoProduto tamanhos={tamanhos} aoMudar={mudarTamanhos} precoProprioNoDelivery={!mesmoPreco} acrescimoDiferente={acrescimoDiferente} aoMudarAcrescimoDiferente={setAcrescimoDiferente} />
          </>
        )}
        <AdicionaisDoProduto ligados={gruposLigados} grupos={grupos} aoMudar={mudarGrupos} />
        <PreviaDoPreco produto={previa.produto} motivo={previa.motivo} grupos={grupos} produtos={produtos} />
        <AreaDeTexto rotulo={TP.janela.descricao} explicacao={TP.janela.descricaoAjuda} exemplo={TP.janela.descricaoExemplo} value={descricao} maxLength={300} rows={2} onChange={(e) => setDescricao(e.target.value)} />
        {categoriaId !== null && (!produto || produto.ativo) && (
          <PosicaoNaLista key={categoriaId} rotulo={TP.janela.posicao} itens={daCategoria(categoriaId)} atualId={idGravado ?? undefined} nomeDoAtual={nome.trim()} posicao={posicao} aoMudar={setPosicao} />
        )}
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={gravando}>
            {produto ? TP.janela.salvar : TP.janela.criar}
          </Botao>
          <BotaoCancelar />
        </div>
      </form>
    </JanelaModal>
  );
}
