"use client";

/**
 * Janela para criar ou editar um grupo de adicionais: nome, se a escolha é obrigatória (mínimo e
 * máximo de escolhas) e os itens (nome, preço, preço no delivery e vezes por item), na ordem.
 * Grava em POST /api/cadastros/adicionais mandando a lista COMPLETA de itens: o que não vier fica
 * inativo no servidor. Preço digitado em reais e enviado em centavos (`centavosDoTexto`, nunca float).
 * A tela confere o básico para explicar cedo; quem decide é o servidor (a mensagem dele aparece aqui).
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import {
  centavosDoTexto,
  ESCOLHAS_POR_GRUPO,
  ITENS_POR_GRUPO,
  MAXIMO_POR_ITEM,
  PRECO_MAXIMO_CENTAVOS,
  textoDosCentavos,
  type GrupoDeAdicionais,
} from "@erp/dominio/produtos";
import { chamar } from "../../chamar";
import { BotaoExemplos, Campo, CampoDoGrupo, Grupo, Marcador, OpcaoDoGrupo } from "../../Campo";
import { BotoesDaLinha, mover } from "../BotoesDaLinha";
import { JanelaModal, usarPedirFechar } from "../JanelaModal";
import { TA } from "./textos";

type LinhaDoItem = { chave: number; id?: number; nome: string; preco: string; delivery: string; vezes: string };

let proximaChave = 0;
const reais = (centavos: number) => textoDosCentavos(centavos).replace("R$ ", "");

function BotaoCancelar() {
  const pedirFechar = usarPedirFechar();
  return (
    <Botao variante="secundario" onClick={pedirFechar}>
      {TA.janela.cancelar}
    </Botao>
  );
}

export function JanelaDoGrupo({
  grupo,
  aoFechar,
  aoSalvo,
}: {
  /** Sem ele, cria um novo. */
  grupo?: GrupoDeAdicionais;
  aoFechar: () => void;
  aoSalvo: (g: GrupoDeAdicionais, criado: boolean) => void;
}) {
  const ativos = (grupo?.itens ?? []).filter((i) => i.ativo);
  const [sujo, setSujo] = useState(false);
  const [nome, setNome] = useState(grupo?.nome ?? "");
  const [obrigatoria, setObrigatoria] = useState((grupo?.minimo ?? 0) > 0);
  const [minimo, setMinimo] = useState(grupo && grupo.minimo > 0 ? String(grupo.minimo) : "1");
  const [maximo, setMaximo] = useState(String(grupo?.maximo ?? 1));
  const [itens, setItens] = useState<LinhaDoItem[]>(() =>
    ativos.map((i) => ({
      chave: ++proximaChave,
      id: i.id,
      nome: i.nome,
      preco: reais(i.precoCentavos),
      delivery: i.precoDeliveryCentavos === null ? "" : reais(i.precoDeliveryCentavos),
      vezes: String(i.maximoPorItem),
    })),
  );
  const [deliveryDiferente, setDeliveryDiferente] = useState(ativos.some((i) => i.precoDeliveryCentavos !== null));
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  const mudarItem = (chave: number, mudanca: Partial<LinhaDoItem>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  const nomeDaLinha = (i: LinhaDoItem, k: number) => i.nome.trim() || TA.janela.itemSemNome(k + 1);

  function adicionarItem() {
    setItens((l) => [...l, { chave: ++proximaChave, nome: "", preco: "0,00", delivery: "", vezes: "1" }]);
    setSujo(true);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 2) return setErro(TA.janela.faltaNome);
    const max = maximo.trim();
    if (!/^\d{1,2}$/.test(max) || Number(max) < 1 || Number(max) > ESCOLHAS_POR_GRUPO) return setErro(TA.janela.maximoInvalido(ESCOLHAS_POR_GRUPO));
    const min = obrigatoria ? minimo.trim() : "0";
    if (obrigatoria && (!/^\d{1,2}$/.test(min) || Number(min) < 1 || Number(min) > Number(max))) return setErro(TA.janela.minimoInvalido);
    if (obrigatoria && itens.length === 0) return setErro(TA.janela.faltaItem);
    const lista = [];
    for (const [k, i] of itens.entries()) {
      if (!i.nome.trim()) return setErro(TA.janela.itemSemNomeErro(k + 1));
      const n = i.nome.trim();
      const preco = centavosDoTexto(i.preco);
      if (preco === null || preco > PRECO_MAXIMO_CENTAVOS) return setErro(TA.janela.itemPrecoInvalido(n));
      let delivery: number | null = null;
      if (deliveryDiferente && i.delivery.trim()) {
        delivery = centavosDoTexto(i.delivery);
        if (delivery === null || delivery > PRECO_MAXIMO_CENTAVOS) return setErro(TA.janela.itemDeliveryInvalido(n));
      }
      const vezes = i.vezes.trim();
      if (!/^\d{1,2}$/.test(vezes) || Number(vezes) < 1 || Number(vezes) > MAXIMO_POR_ITEM) return setErro(TA.janela.itemVezesInvalido(n, MAXIMO_POR_ITEM));
      lista.push({ ...(i.id ? { id: i.id } : {}), nome: n, precoCentavos: preco, precoDeliveryCentavos: delivery, maximoPorItem: Number(vezes) });
    }
    setGravando(true);
    const r = await chamar<GrupoDeAdicionais>("/api/cadastros/adicionais", "POST", {
      ...(grupo ? { id: grupo.id } : {}),
      nome: nome.trim(),
      minimo: Number(min),
      maximo: Number(max),
      itens: lista,
    });
    setGravando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    aoSalvo(r.dados, !grupo);
  }

  return (
    <JanelaModal titulo={grupo ? TA.janela.editar(grupo.nome) : TA.janela.novo} sujo={sujo} aoMexer={() => setSujo(true)} aoFechar={aoFechar} data-testid="janela-grupo">
      <BotaoExemplos />
      <form className="hor-form" onSubmit={(e) => void salvar(e)} noValidate>
        <Campo rotulo={TA.janela.nome} explicacao={TA.janela.nomeAjuda} exemplo={TA.janela.nomeExemplo} value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} required autoComplete="off" />
        <Marcador rotulo={TA.janela.obrigatoria} explicacao={TA.janela.obrigatoriaAjuda} exemplo={TA.janela.obrigatoriaExemplo} checked={obrigatoria} onChange={(e) => setObrigatoria(e.target.checked)} />
        <div className="linha-editavel__numeros">
          {obrigatoria && (
            <Campo rotulo={TA.janela.minimo} explicacao={TA.janela.minimoAjuda} exemplo={TA.janela.minimoExemplo} value={minimo} inputMode="numeric" maxLength={2} onChange={(e) => setMinimo(e.target.value)} autoComplete="off" className="linha-editavel__numero" />
          )}
          <Campo rotulo={TA.janela.maximo} explicacao={TA.janela.maximoAjuda(ESCOLHAS_POR_GRUPO)} exemplo={TA.janela.maximoExemplo} value={maximo} inputMode="numeric" maxLength={2} onChange={(e) => setMaximo(e.target.value)} autoComplete="off" className="linha-editavel__numero" />
        </div>
        <Grupo legenda={TA.janela.itens} explicacao={TA.janela.itensAjuda} exemplo={TA.janela.itensExemplo} className="linha-editavel" ajudaNoTopo>
          {itens.length === 0 ? (
            <p className="hor-vazio">{TA.janela.nenhumItem}</p>
          ) : (
            <ol className="linha-editavel__lista" data-testid="itens-do-grupo">
              {itens.map((i, k) => {
                const rotulo = nomeDaLinha(i, k);
                return (
                  <li key={i.chave} className="linha-editavel__linha" role="group" aria-label={rotulo}>
                    <div className="linha-editavel__campos">
                      <CampoDoGrupo rotulo={TA.janela.item} complemento={String(k + 1)} className="linha-editavel__nome" value={i.nome} maxLength={40} autoComplete="off" onChange={(e) => mudarItem(i.chave, { nome: e.target.value })} />
                      <CampoDoGrupo rotulo={TA.janela.precoItem} complemento={TA.janela.complemento(k + 1)} className="linha-editavel__dinheiro" value={i.preco} inputMode="decimal" maxLength={14} autoComplete="off" onChange={(e) => mudarItem(i.chave, { preco: e.target.value })} />
                      {deliveryDiferente && (
                        <CampoDoGrupo rotulo={TA.janela.precoDelivery} complemento={TA.janela.complemento(k + 1)} className="linha-editavel__dinheiro" value={i.delivery} placeholder={TA.janela.igualLoja} inputMode="decimal" maxLength={14} autoComplete="off" onChange={(e) => mudarItem(i.chave, { delivery: e.target.value })} />
                      )}
                      <CampoDoGrupo rotulo={TA.janela.vezes} complemento={TA.janela.complemento(k + 1)} className="linha-editavel__numero" value={i.vezes} inputMode="numeric" maxLength={2} autoComplete="off" onChange={(e) => mudarItem(i.chave, { vezes: e.target.value })} />
                    </div>
                    <BotoesDaLinha
                      nome={rotulo}
                      indice={k}
                      total={itens.length}
                      aoMover={(passo) => {
                        setItens((l) => mover(l, k, passo));
                        setSujo(true);
                      }}
                      aoRemover={() => {
                        setItens((l) => l.filter((x) => x.chave !== i.chave));
                        setSujo(true);
                      }}
                    />
                  </li>
                );
              })}
            </ol>
          )}
          {itens.length > 0 && <OpcaoDoGrupo rotulo={TA.janela.deliveryDiferente} className="cadastros__opcao" checked={deliveryDiferente} onChange={(e) => setDeliveryDiferente(e.target.checked)} />}
          {itens.length < ITENS_POR_GRUPO ? (
            <Botao variante="secundario" className="linha-editavel__adicionar" onClick={adicionarItem}>
              <Icone nome="mais" />
              {TA.janela.adicionarItem}
            </Botao>
          ) : (
            <p className="hor-secao__intro">{TA.janela.limiteItens(ITENS_POR_GRUPO)}</p>
          )}
        </Grupo>
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={gravando}>
            {grupo ? TA.janela.salvar : TA.janela.criar}
          </Botao>
          <BotaoCancelar />
        </div>
      </form>
    </JanelaModal>
  );
}
