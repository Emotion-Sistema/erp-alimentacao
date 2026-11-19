"use client";

/**
 * Janela para criar ou editar um prêmio: nome, pontos para trocar, descrição e produto (opcional,
 * só produtos em uso; o atual aparece mesmo desativado, marcado). Grava em POST /api/clube/premios
 * (sem id cria, com id altera). A tela confere o básico; quem decide é o servidor.
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao } from "@erp/interface";
import { PONTOS_DO_PREMIO_MAXIMO, type Premio } from "@erp/dominio/clube";
import { chamar } from "../chamar";
import { AreaDeTexto, BotaoExemplos, Campo, Selecao } from "../Campo";
import { JanelaModal, usarPedirFechar } from "../cadastros/JanelaModal";
import { inteiroDoTexto, type PainelDoClube } from "./contas";
import { TC } from "./textos";

function BotaoCancelar() {
  const pedirFechar = usarPedirFechar();
  return (
    <Botao variante="secundario" onClick={pedirFechar}>
      {TC.premio.cancelar}
    </Botao>
  );
}

/** Produtos para escolher: os em uso e, se for o caso, o já escolhido (mesmo desativado). */
export function opcoesDeProduto(produtos: PainelDoClube["produtos"], atual: number | null, vazio: string) {
  return [
    { valor: "", texto: vazio },
    ...produtos
      .filter((p) => p.ativo || p.id === atual)
      .map((p) => ({ valor: String(p.id), texto: p.ativo ? p.nome : TC.premio.desativadoNaLista(p.nome) })),
  ];
}

export function JanelaDoPremio({
  premio,
  produtos,
  aoFechar,
  aoSalvo,
}: {
  premio?: Premio;
  produtos: PainelDoClube["produtos"];
  aoFechar: () => void;
  aoSalvo: (p: Premio, criado: boolean) => void;
}) {
  const [sujo, setSujo] = useState(false);
  const [nome, setNome] = useState(premio?.nome ?? "");
  const [pontos, setPontos] = useState(premio ? String(premio.pontos) : "");
  const [descricao, setDescricao] = useState(premio?.descricao ?? "");
  const [produto, setProduto] = useState(premio?.produtoId ? String(premio.produtoId) : "");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 2) return setErro(TC.premio.erroNome);
    const n = inteiroDoTexto(pontos, 1, PONTOS_DO_PREMIO_MAXIMO);
    if (n === null) return setErro(TC.premio.erroPontos);
    setGravando(true);
    const r = await chamar<Premio>("/api/clube/premios", "POST", {
      ...(premio ? { id: premio.id } : {}),
      nome: nome.trim(),
      pontos: n,
      descricao: descricao.trim(),
      produtoId: produto ? Number(produto) : null,
    });
    setGravando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    aoSalvo(r.dados, !premio);
  }

  return (
    <JanelaModal titulo={premio ? TC.premio.editar(premio.nome) : TC.premio.novo} sujo={sujo} aoMexer={() => setSujo(true)} aoFechar={aoFechar} data-testid="janela-premio">
      <BotaoExemplos />
      <form className="hor-form" onSubmit={(e) => void salvar(e)} noValidate>
        <Campo rotulo={TC.premio.nome} explicacao={TC.premio.nomeAjuda} exemplo={TC.premio.nomeExemplo} value={nome} maxLength={60} autoComplete="off" required onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo={TC.premio.pontos} explicacao={TC.premio.pontosAjuda} exemplo={TC.premio.pontosExemplo} value={pontos} inputMode="numeric" maxLength={7} autoComplete="off" className="linha-editavel__numero" onChange={(e) => setPontos(e.target.value)} />
        <AreaDeTexto rotulo={TC.premio.descricao} explicacao={TC.premio.descricaoAjuda} exemplo={TC.premio.descricaoExemplo} value={descricao} maxLength={200} rows={2} onChange={(e) => setDescricao(e.target.value)} />
        <Selecao
          rotulo={TC.premio.produto}
          explicacao={TC.premio.produtoAjuda}
          exemplo={TC.premio.produtoExemplo}
          opcoes={opcoesDeProduto(produtos, premio?.produtoId ?? null, TC.premio.nenhumProduto)}
          value={produto}
          onChange={(e) => setProduto(e.target.value)}
        />
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={gravando}>
            {premio ? TC.premio.salvar : TC.premio.criar}
          </Botao>
          <BotaoCancelar />
        </div>
      </form>
    </JanelaModal>
  );
}
