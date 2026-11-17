"use client";

/** Janela para criar ou editar uma categoria (nome, descrição e ordem). Grava em /api/cadastros/categorias. */
import { useState, type FormEvent } from "react";
import { Aviso, Botao } from "@erp/interface";
import { chamar } from "../../chamar";
import { AreaDeTexto, BotaoExemplos, Campo } from "../../Campo";
import { JanelaModal, usarPedirFechar } from "../JanelaModal";
import type { Categoria } from "../horarios/contas";
import { TC } from "./textos";

function BotaoCancelar() {
  const pedirFechar = usarPedirFechar();
  return (
    <Botao variante="secundario" onClick={pedirFechar}>
      {TC.janela.cancelar}
    </Botao>
  );
}

export function JanelaDaCategoria({
  categoria,
  ordemSugerida,
  aoFechar,
  aoSalvo,
}: {
  /** Sem ela, cria uma nova. */
  categoria?: Categoria;
  ordemSugerida: number;
  aoFechar: () => void;
  aoSalvo: (c: Categoria, criada: boolean) => void;
}) {
  const [sujo, setSujo] = useState(false);
  const [nome, setNome] = useState(categoria?.nome ?? "");
  const [descricao, setDescricao] = useState(categoria?.descricao ?? "");
  const [ordem, setOrdem] = useState(String(categoria?.ordem ?? ordemSugerida));
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 2) return setErro(TC.janela.faltaNome);
    if (!/^\d{1,4}$/.test(ordem.trim())) return setErro(TC.janela.ordemInvalida);
    setGravando(true);
    const r = await chamar<Categoria>("/api/cadastros/categorias", "POST", {
      ...(categoria ? { id: categoria.id } : {}),
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      ordem: Number(ordem.trim()),
    });
    setGravando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    aoSalvo(r.dados, !categoria);
  }

  return (
    <JanelaModal titulo={categoria ? TC.janela.editar(categoria.nome) : TC.janela.nova} sujo={sujo} aoMexer={() => setSujo(true)} aoFechar={aoFechar} data-testid="janela-categoria">
      <BotaoExemplos />
      <form className="hor-form" onSubmit={(e) => void salvar(e)} noValidate>
        <Campo rotulo={TC.janela.nome} explicacao={TC.janela.nomeAjuda} exemplo={TC.janela.nomeExemplo} value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} required autoComplete="off" />
        <AreaDeTexto rotulo={TC.janela.descricao} explicacao={TC.janela.descricaoAjuda} exemplo={TC.janela.descricaoExemplo} value={descricao} maxLength={300} rows={2} onChange={(e) => setDescricao(e.target.value)} />
        <Campo rotulo={TC.janela.ordem} explicacao={TC.janela.ordemAjuda} exemplo={TC.janela.ordemExemplo} value={ordem} inputMode="numeric" maxLength={4} onChange={(e) => setOrdem(e.target.value)} />
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={gravando}>
            {categoria ? TC.janela.salvar : TC.janela.criar}
          </Botao>
          <BotaoCancelar />
        </div>
      </form>
    </JanelaModal>
  );
}
