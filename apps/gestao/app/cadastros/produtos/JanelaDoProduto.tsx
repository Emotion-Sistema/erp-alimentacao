"use client";

/**
 * Janela para criar ou editar um produto (nome, categoria, preço, tipo de produção, tempo de
 * preparo, descrição e posição na categoria). Grava em /api/cadastros/produtos.
 * O preço é digitado em reais ("12,50") e vai em centavos inteiros (`centavosDoTexto`, nunca float).
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao } from "@erp/interface";
import { centavosDoTexto, PRECO_MAXIMO_CENTAVOS, TEMPO_DE_PREPARO_MAXIMO, textoDosCentavos, type Produto } from "@erp/dominio/produtos";
import { NOME_DA_AREA_DE_PRODUCAO, type TipoDeProducao } from "@erp/dominio/tipos-producao";
import { chamar } from "../../chamar";
import { AreaDeTexto, BotaoExemplos, Campo, Selecao } from "../../Campo";
import { PosicaoNaLista } from "../PosicaoNaLista";
import { JanelaModal, usarPedirFechar } from "../JanelaModal";
import type { Categoria } from "../horarios/contas";
import { TP } from "./textos";

/** Valor da opção "não passa pela produção" (o tipo vai nulo). */
const SEM_PRODUCAO = "sem";

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
  aoFechar,
  aoSalvo,
}: {
  /** Sem ele, cria um novo. */
  produto?: Produto;
  /** Todos os produtos, na ordem do cardápio (para a posição dentro da categoria). */
  produtos: Produto[];
  /** Todas as categorias, na ordem do cardápio. */
  categorias: Categoria[];
  /** Todos os tipos de produção. */
  tipos: TipoDeProducao[];
  aoFechar: () => void;
  aoSalvo: (p: Produto, criado: boolean) => void;
}) {
  const [sujo, setSujo] = useState(false);
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [categoriaId, setCategoriaId] = useState<number | null>(produto?.categoriaId ?? null);
  const [preco, setPreco] = useState(produto ? textoDosCentavos(produto.precoCentavos).replace("R$ ", "") : "");
  const [tipo, setTipo] = useState(produto ? (produto.tipoProducaoId === null ? SEM_PRODUCAO : String(produto.tipoProducaoId)) : "");
  const [tempo, setTempo] = useState(produto?.tempoPreparoMin != null ? String(produto.tempoPreparoMin) : "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");

  // Os produtos ativos de uma categoria, na ordem (para escolher a posição).
  const daCategoria = (id: number | null) => (id === null ? [] : produtos.filter((p) => p.ativo && p.categoriaId === id).map((p) => ({ id: p.id, nome: p.nome })));
  const fimDa = (id: number | null) => daCategoria(id).filter((i) => i.id !== produto?.id).length + 1;
  const indice = produto ? daCategoria(produto.categoriaId).findIndex((i) => i.id === produto.id) : -1;
  const posicaoInicial = indice >= 0 ? indice + 1 : fimDa(produto?.categoriaId ?? null);
  const [posicao, setPosicao] = useState(posicaoInicial);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  const passaPelaProducao = tipo !== "" && tipo !== SEM_PRODUCAO;

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
    if (tipo === "") return setErro(TP.janela.faltaTipo);
    const min = tempo.trim();
    if (passaPelaProducao && (!/^\d{1,3}$/.test(min) || Number(min) < 1 || Number(min) > TEMPO_DE_PREPARO_MAXIMO)) return setErro(TP.janela.tempoInvalido(TEMPO_DE_PREPARO_MAXIMO));
    const mudouDeCategoria = !!produto && categoriaId !== produto.categoriaId;
    setGravando(true);
    const r = await chamar<Produto>("/api/cadastros/produtos", "POST", {
      ...(produto ? { id: produto.id } : {}),
      nome: nome.trim(),
      categoriaId,
      precoCentavos: centavos,
      // Sem tipo, o servidor tira o tempo junto.
      ...(passaPelaProducao ? { tipoProducaoId: Number(tipo), tempoPreparoMin: Number(min) } : { tipoProducaoId: null }),
      descricao: descricao.trim() || null,
      // Produto desativado não entra na lista: a posição só vale para os ativos.
      // Só manda a posição se é novo, se a pessoa mudou o lugar ou se mudou a categoria:
      // editar o preço não desfaz a ordem que outra pessoa mudou.
      ...(!produto || (produto.ativo && (mudouDeCategoria || posicao !== posicaoInicial)) ? { posicao } : {}),
    });
    setGravando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    aoSalvo(r.dados, !produto);
  }

  return (
    <JanelaModal titulo={produto ? TP.janela.editar(produto.nome) : TP.janela.novo} sujo={sujo} aoMexer={() => setSujo(true)} aoFechar={aoFechar} data-testid="janela-produto">
      <BotaoExemplos />
      <form className="hor-form" onSubmit={(e) => void salvar(e)} noValidate>
        <Campo rotulo={TP.janela.nome} explicacao={TP.janela.nomeAjuda} exemplo={TP.janela.nomeExemplo} value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} required autoComplete="off" />
        <Selecao rotulo={TP.janela.categoria} explicacao={TP.janela.categoriaAjuda} exemplo={TP.janela.categoriaExemplo} opcoes={opcoesDeCategoria} value={categoriaId === null ? "" : String(categoriaId)} onChange={(e) => mudarCategoria(e.target.value)} />
        <Campo rotulo={TP.janela.preco} explicacao={TP.janela.precoAjuda} exemplo={TP.janela.precoExemplo} value={preco} inputMode="decimal" maxLength={14} onChange={(e) => setPreco(e.target.value)} autoComplete="off" />
        <Selecao rotulo={TP.janela.tipo} explicacao={TP.janela.tipoAjuda} exemplo={TP.janela.tipoExemplo} opcoes={opcoesDeTipo} value={tipo} onChange={(e) => setTipo(e.target.value)} />
        {passaPelaProducao && (
          <Campo rotulo={TP.janela.tempo} explicacao={TP.janela.tempoAjuda(TEMPO_DE_PREPARO_MAXIMO)} exemplo={TP.janela.tempoExemplo} value={tempo} inputMode="numeric" maxLength={3} onChange={(e) => setTempo(e.target.value)} autoComplete="off" />
        )}
        <AreaDeTexto rotulo={TP.janela.descricao} explicacao={TP.janela.descricaoAjuda} exemplo={TP.janela.descricaoExemplo} value={descricao} maxLength={300} rows={2} onChange={(e) => setDescricao(e.target.value)} />
        {categoriaId !== null && (!produto || produto.ativo) && (
          <PosicaoNaLista key={categoriaId} rotulo={TP.janela.posicao} itens={daCategoria(categoriaId)} atualId={produto?.id} nomeDoAtual={nome.trim()} posicao={posicao} aoMudar={setPosicao} />
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
