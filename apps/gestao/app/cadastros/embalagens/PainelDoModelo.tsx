"use client";

/**
 * Painel lateral (no celular, folha que sobe de baixo) para criar ou editar um modelo do
 * catálogo. Usa <dialog> nativo em modo modal: o foco fica dentro, Esc fecha e, ao fechar, o foco
 * volta para quem abriu. Fica num portal no <body> e tem o próprio <form>: Enter aqui nunca envia
 * o formulário do ingrediente que está atrás.
 *
 * Mostra a prévia do cartão ao vivo e avisa na hora se já existe igual. Modelo em uso: tipo e
 * tamanho travados (o servidor também trava); fornecedor e ativa continuam livres.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Aviso, Botao, Faixa, Icone } from "@erp/interface";
import { Campo, Grupo, Marcador, Selecao } from "../../Campo";
import { TIPOS_DE_EMBALAGEM } from "../auxiliares";
import { nomeDoModeloParaMostrar, ordenarTipos, problemaDoRascunho, procurarIgual, siglaDaUnidade, tamanhoNormalizado, type ModeloDeEmbalagem, type Rascunho } from "./contas";
import { CartaoDoModelo } from "./CartaoDoModelo";
import type { Catalogo } from "./usarCatalogo";
import { T } from "./textos";

const OUTRO = "__outro";
const ID_OUTRO = "emb-painel-outro";
const ID_TAMANHO = "emb-painel-tamanho";

export type InicioDoPainel = { modelo?: ModeloDeEmbalagem | null; inicial?: Partial<Rascunho> };

export function PainelDoModelo({
  catalogo,
  inicio,
  aoSalvo,
  aoFechar,
}: {
  catalogo: Pick<Catalogo, "modelos" | "fornecedores" | "unidades" | "salvarModelo">;
  inicio: InicioDoPainel;
  /** Depois de gravar: o modelo como o servidor devolveu e se foi criado agora. */
  aoSalvo: (m: ModeloDeEmbalagem, criado: boolean) => void;
  aoFechar: () => void;
}) {
  const { modelos, fornecedores, unidades, salvarModelo } = catalogo;
  const modelo = inicio.modelo ?? null;
  const base = modelo ?? inicio.inicial ?? {};
  const tiposProntos = useMemo(() => ordenarTipos([...TIPOS_DE_EMBALAGEM, ...modelos.filter((m) => m.ativo).map((m) => m.tipo)]), [modelos]);
  const tipoInicial = (base.tipo ?? "").trim().toLowerCase();
  const [tipo, setTipo] = useState(tipoInicial ? (tiposProntos.includes(tipoInicial) ? tipoInicial : OUTRO) : "");
  const [outro, setOutro] = useState(tipoInicial && !tiposProntos.includes(tipoInicial) ? tipoInicial : "");
  const [tamanho, setTamanho] = useState((base.tamanho ?? "").replace(".", ","));
  const [unidade, setUnidade] = useState(base.unidade || "kg");
  const [fornecedorId, setFornecedorId] = useState(base.fornecedorId ? String(base.fornecedorId) : "");
  const [ativo, setAtivo] = useState(modelo?.ativo ?? true);
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);
  const erroRef = useRef<HTMLDivElement>(null);
  const [montado, setMontado] = useState(false);

  const travado = !!modelo && modelo.emUso > 0;
  const tipoFinal = tipo === OUTRO ? outro.trim() : tipo;
  const fornecedorNum = fornecedorId ? Number(fornecedorId) : null;
  const rascunho: Rascunho = { tipo: tipoFinal, tamanho, unidade, fornecedorId: fornecedorNum };
  const problema = problemaDoRascunho(rascunho, unidades);
  const igual = tipoFinal && !problema ? procurarIgual(rascunho, modelos, modelo?.id) : { ativa: null, desativada: null, geral: null };
  const nomeDoFornecedor = fornecedores.find((f) => f.id === fornecedorNum)?.nome ?? null;
  const tam = tamanhoNormalizado(tamanho);
  const nomePrevia = nomeDoModeloParaMostrar({ tipo: tipoFinal, tamanho: tam || null, unidade: tam ? unidade : null });
  const bloqueado = !!problema || (!!igual.ativa && ativo) || (!!igual.desativada && !modelo);

  // Abre como modal ao montar; foca o primeiro controle; devolve o foco a quem abriu ao fechar.
  useEffect(() => {
    setMontado(true);
  }, []);
  useEffect(() => {
    if (!montado) return;
    const quemAbriu = document.activeElement as HTMLElement | null;
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
    const primeiro =
      d?.querySelector<HTMLElement>('.emb-tipo[aria-pressed="true"]:not(:disabled)') ??
      d?.querySelector<HTMLElement>(".emb-tipo:not(:disabled)") ??
      d?.querySelector<HTMLElement>(".emb-painel__corpo select:not(:disabled)");
    primeiro?.focus();
    return () => {
      if (d?.open) d.close();
      if (quemAbriu?.isConnected) quemAbriu.focus();
    };
  }, [montado]);

  useEffect(() => {
    if (erro) erroRef.current?.focus();
  }, [erro]);

  /** Escolheu o tipo: o foco segue para o próximo campo (tamanho, ou o nome do tipo em "Outro tipo"). */
  function escolherTipo(novo: string) {
    setTipo(novo);
    if (!novo) return;
    window.setTimeout(() => document.getElementById(novo === OUTRO ? ID_OUTRO : ID_TAMANHO)?.focus(), 0);
  }

  async function gravar(corpoExtra?: { id: number; ativo: true }) {
    setTentou(true);
    setErro("");
    if (!corpoExtra && bloqueado) return;
    setGravando(true);
    const alvo = corpoExtra ? igual.desativada! : null;
    const r = await salvarModelo(
      alvo
        ? { id: alvo.id, tipo: alvo.tipo, tamanho: alvo.tamanho, unidade: alvo.unidade, fornecedorId: alvo.fornecedorId, ativo: true }
        : {
            id: modelo?.id,
            tipo: tipoFinal,
            tamanho: tam || null,
            unidade: tam ? unidade : null,
            fornecedorId: fornecedorNum,
            ...(modelo ? { ativo } : {}),
          },
    );
    setGravando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    aoSalvo(r.dados, !modelo && !alvo);
  }

  const opcoesFornecedor = [
    { valor: "", texto: T.painel.fornecedor.qualquer },
    ...fornecedores
      .filter((f) => f.ativo || f.id === modelo?.fornecedorId)
      .map((f) => ({ valor: String(f.id), texto: f.ativo ? f.nome : T.painel.fornecedor.inativo(f.nome) })),
  ];
  const titulo = modelo ? T.painel.tituloEditar(nomeDoModeloParaMostrar(modelo)) : T.painel.tituloNova;

  if (!montado) return null;
  return createPortal(
    <dialog
      ref={dialogo}
      className="emb-painel"
      aria-labelledby="emb-painel-titulo"
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <form
        className="emb-painel__form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void gravar();
        }}
      >
        <header className="emb-painel__cabeca">
          <h2 id="emb-painel-titulo">{titulo}</h2>
          <button type="button" className="emb-painel__fechar" aria-label={T.painel.fechar} onClick={aoFechar}>
            <Icone nome="fechar" />
          </button>
        </header>
        <div className="emb-painel__corpo">
          {travado && <Faixa tipo="info">{T.painel.travado(modelo!.emUso)}</Faixa>}
          <div ref={erroRef} tabIndex={-1} className="emb-painel__erro">
            {erro && <Aviso tipo="perigo">{erro}</Aviso>}
          </div>
          <Grupo legenda={T.painel.tipoLegenda} explicacao={T.painel.tipoExplicacao} exemplo={T.painel.tipoExemplo} className="emb-painel__tipos" ajudaNoTopo>
            <div className="emb-painel__chips">
              {tiposProntos.map((t) => (
                <button key={t} type="button" className="emb-tipo" aria-pressed={tipo === t} disabled={travado} onClick={() => escolherTipo(tipo === t ? "" : t)}>
                  {t}
                </button>
              ))}
              <button type="button" className="emb-tipo emb-tipo--outro" aria-pressed={tipo === OUTRO} disabled={travado} onClick={() => escolherTipo(tipo === OUTRO ? "" : OUTRO)}>
                <Icone nome="mais" />
                {T.painel.outroTipo}
              </button>
            </div>
          </Grupo>
          {tipo === OUTRO && (
            <Campo
              id={ID_OUTRO}
              rotulo={T.painel.outro.rotulo}
              explicacao={T.painel.outro.explicacao}
              exemplo={T.painel.outro.exemplo}
              value={outro}
              onChange={(e) => setOutro(e.target.value)}
              disabled={travado}
              autoComplete="off"
              maxLength={24}
            />
          )}
          <div className="emb-painel__medida">
            <Campo
              id={ID_TAMANHO}
              rotulo={T.painel.tamanho.rotulo}
              explicacao={T.painel.tamanho.explicacao}
              exemplo={T.painel.tamanho.exemplo}
              value={tamanho}
              onChange={(e) => setTamanho(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              disabled={travado}
            />
            <Selecao
              rotulo={T.painel.unidade.rotulo}
              explicacao={T.painel.unidade.explicacao}
              exemplo={T.painel.unidade.exemplo}
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              disabled={travado || !tamanho.trim()}
              opcoes={unidades.map((u) => ({ valor: u.codigo, texto: `${siglaDaUnidade(u.codigo)} (${u.nome})` }))}
            />
          </div>
          <Selecao
            rotulo={T.painel.fornecedor.rotulo}
            explicacao={T.painel.fornecedor.explicacao}
            exemplo={T.painel.fornecedor.exemplo}
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
            opcoes={opcoesFornecedor}
          />
          {modelo && (
            <Marcador rotulo={T.painel.ativa.rotulo} explicacao={T.painel.ativa.explicacao} exemplo={T.painel.ativa.exemplo} checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          )}
        </div>
        <footer className="emb-painel__rodape">
          <section className="emb-painel__previa" aria-live="polite">
            <p className="emb-painel__rotulo">{T.painel.previa}</p>
            {tipoFinal ? (
              <CartaoDoModelo
                previa
                unidades={unidades}
                modelo={{ tipo: tipoFinal, tamanho: tam || null, unidade: tam ? unidade : null, fornecedor: nomeDoFornecedor, ativo, emUso: 0 }}
              />
            ) : (
              <p className="emb-painel__previa-vazia">Escolha um tipo para ver a prévia.</p>
            )}
          </section>
          <div aria-live="polite" data-testid="situacao-do-painel">
            {problema && (tentou || tipo) && (
              <Faixa tipo="alerta" data-testid="problema-do-painel">
                {problema}
              </Faixa>
            )}
            {!problema && igual.ativa && ativo && (
              <Faixa tipo="alerta" data-testid="problema-do-painel">
                {T.painel.repetida(nomePrevia, igual.ativa.fornecedor)}
              </Faixa>
            )}
            {!problema && !igual.ativa && igual.desativada && !modelo && (
              <div className="emb-painel__reativar">
                <Faixa tipo="info" data-testid="problema-do-painel">
                  {T.painel.repetidaDesativada(nomePrevia)}
                </Faixa>
                <Botao variante="secundario" disabled={gravando} onClick={() => void gravar({ id: igual.desativada!.id, ativo: true })}>
                  {T.painel.reativarExistente}
                </Botao>
              </div>
            )}
            {!problema && !igual.ativa && !igual.desativada && igual.geral && nomeDoFornecedor && <Faixa tipo="info">{T.painel.geral(nomePrevia, nomeDoFornecedor)}</Faixa>}
          </div>
          <div className="emb-painel__botoes">
            <Botao type="submit" disabled={gravando || bloqueado}>
              {gravando ? T.painel.salvando : modelo ? T.painel.salvar : T.painel.criar}
            </Botao>
            <Botao variante="secundario" onClick={aoFechar}>
              {T.painel.cancelar}
            </Botao>
          </div>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
