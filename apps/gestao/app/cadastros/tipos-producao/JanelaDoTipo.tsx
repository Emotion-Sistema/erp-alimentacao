"use client";

/** Janela para criar ou editar um tipo de produção (nome, área, capacidade, ordem). Grava em /api/cadastros/tipos-producao. */
import { useState, type FormEvent } from "react";
import { Aviso, Botao } from "@erp/interface";
import { AREAS_DE_PRODUCAO, CAPACIDADE_MAXIMA, NOME_DA_AREA_DE_PRODUCAO, SAIDA_DA_AREA_DE_PRODUCAO, type AreaDeProducao, type TipoDeProducao } from "@erp/dominio/tipos-producao";
import { chamar } from "../../chamar";
import { BotaoExemplos, Campo, Grupo, OpcaoDoGrupo } from "../../Campo";
import { JanelaModal, usarPedirFechar } from "../JanelaModal";
import { TT } from "./textos";

function BotaoCancelar() {
  const pedirFechar = usarPedirFechar();
  return (
    <Botao variante="secundario" onClick={pedirFechar}>
      {TT.janela.cancelar}
    </Botao>
  );
}

export function JanelaDoTipo({
  tipo,
  ordemSugerida,
  aoFechar,
  aoSalvo,
}: {
  /** Sem ele, cria um novo. */
  tipo?: TipoDeProducao;
  ordemSugerida: number;
  aoFechar: () => void;
  aoSalvo: (t: TipoDeProducao, criado: boolean) => void;
}) {
  const [sujo, setSujo] = useState(false);
  const [nome, setNome] = useState(tipo?.nome ?? "");
  const [area, setArea] = useState<AreaDeProducao | null>(tipo?.area ?? null);
  const [capacidade, setCapacidade] = useState(String(tipo?.capacidade ?? 1));
  const [ordem, setOrdem] = useState(String(tipo?.ordem ?? ordemSugerida));
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 2) return setErro(TT.janela.faltaNome);
    if (!area) return setErro(TT.janela.faltaArea);
    const cap = capacidade.trim();
    if (!/^\d{1,2}$/.test(cap) || Number(cap) < 1 || Number(cap) > CAPACIDADE_MAXIMA) return setErro(TT.janela.capacidadeInvalida(CAPACIDADE_MAXIMA));
    if (!/^\d{1,4}$/.test(ordem.trim())) return setErro(TT.janela.ordemInvalida);
    setGravando(true);
    const r = await chamar<TipoDeProducao>("/api/cadastros/tipos-producao", "POST", {
      ...(tipo ? { id: tipo.id } : {}),
      nome: nome.trim(),
      area,
      capacidade: Number(cap),
      ordem: Number(ordem.trim()),
    });
    setGravando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    aoSalvo(r.dados, !tipo);
  }

  return (
    <JanelaModal titulo={tipo ? TT.janela.editar(tipo.nome) : TT.janela.novo} sujo={sujo} aoMexer={() => setSujo(true)} aoFechar={aoFechar} data-testid="janela-tipo">
      <BotaoExemplos />
      <form className="hor-form" onSubmit={(e) => void salvar(e)} noValidate>
        <Campo rotulo={TT.janela.nome} explicacao={TT.janela.nomeAjuda} exemplo={TT.janela.nomeExemplo} value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} required autoComplete="off" />
        <Grupo legenda={TT.janela.area} explicacao={TT.janela.areaAjuda} exemplo={TT.janela.areaExemplo} className="hor-escolhas">
          {AREAS_DE_PRODUCAO.map((a) => (
            <OpcaoDoGrupo key={a} tipo="radio" name="area" rotulo={TT.janela.opcaoArea(NOME_DA_AREA_DE_PRODUCAO[a], SAIDA_DA_AREA_DE_PRODUCAO[a])} className="hor-escolha" checked={area === a} onChange={() => setArea(a)} />
          ))}
        </Grupo>
        <Campo rotulo={TT.janela.capacidade} explicacao={TT.janela.capacidadeAjuda} exemplo={TT.janela.capacidadeExemplo} value={capacidade} inputMode="numeric" maxLength={2} onChange={(e) => setCapacidade(e.target.value)} />
        <Campo rotulo={TT.janela.ordem} explicacao={TT.janela.ordemAjuda} exemplo={TT.janela.ordemExemplo} value={ordem} inputMode="numeric" maxLength={4} onChange={(e) => setOrdem(e.target.value)} />
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={gravando}>
            {tipo ? TT.janela.salvar : TT.janela.criar}
          </Botao>
          <BotaoCancelar />
        </div>
      </form>
    </JanelaModal>
  );
}
