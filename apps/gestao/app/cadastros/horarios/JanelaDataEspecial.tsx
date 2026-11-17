"use client";

/**
 * Janela "Nova data especial": data, vale para (Loja inteira / Só o delivery / Só a loja / Uma
 * categoria num canal), fechado ou horário diferente, e o motivo. Loja inteira grava em
 * /api/horarios/datas/unidade (abre, último pedido, fecha); o resto em /api/horarios/datas/venda
 * (início e fim). Se já houver data para o mesmo dia e alvo, o servidor troca a que existe.
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao } from "@erp/interface";
import { CANAIS, NOME_DO_CANAL, type Canal } from "@erp/dominio/horarios";
import { Campo, CampoDoGrupo, Grupo, OpcaoDoGrupo, Selecao } from "../../Campo";
import { JanelaModal, usarPedirFechar } from "../JanelaModal";
import { arrumarHora, minutosDe, somarDias, type Categoria, type Horarios } from "./contas";
import type { Gravar } from "./usarHorarios";
import { T } from "./textos";

type ValePara = "unidade" | "delivery" | "loja" | "categoria";

/** 1 = segunda ... 7 = domingo de uma data "AAAA-MM-DD". */
function diaDaSemana(data: string): number {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  const x = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return x === 0 ? 7 : x;
}

function BotaoCancelar() {
  const pedirFechar = usarPedirFechar();
  return (
    <Botao variante="secundario" onClick={pedirFechar}>
      {T.janelaData.cancelar}
    </Botao>
  );
}

export function JanelaDataEspecial({
  horarios,
  categorias,
  gravar,
  aoFechar,
  aoSalvo,
}: {
  horarios: Horarios;
  categorias: Categoria[];
  gravar: Gravar;
  aoFechar: () => void;
  aoSalvo: (data: string) => void;
}) {
  const ativas = categorias.filter((c) => c.ativo);
  const [sujo, setSujo] = useState(false);
  const [data, setData] = useState("");
  const [vale, setVale] = useState<ValePara>("unidade");
  const [categoriaId, setCategoriaId] = useState<number | null>(ativas[0]?.id ?? null);
  const [canal, setCanal] = useState<Canal>("delivery");
  const [fechado, setFechado] = useState(true);
  const [abre, setAbre] = useState("");
  const [ultimo, setUltimo] = useState("");
  const [fecha, setFecha] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  const semanaFechada = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? horarios.semana.find((s) => s.dia === diaDaSemana(data))?.aberta === false : false;
  const avisoAbrirDiaFechado = vale === "unidade" && !fechado && semanaFechada;

  function problema(): string | null {
    if (!data) return "Escolha a data.";
    if (data < horarios.hoje || data > somarDias(horarios.hoje, 366)) return "A data especial precisa ser de hoje até daqui a um ano.";
    if (vale === "categoria" && categoriaId === null) return "Escolha a categoria.";
    if (!fechado) {
      const horas = vale === "unidade" ? [abre, ultimo, fecha] : [inicio, fim];
      if (horas.some((h) => !/^([01]\d|2[0-4]):[0-5]\d$/.test(h))) return "Escreva as horas no formato 11:00.";
      if (vale === "unidade" && !(minutosDe(abre) < minutosDe(ultimo) && minutosDe(ultimo) <= minutosDe(fecha))) return "A ordem é: abre, depois o último pedido da cozinha, depois fecha.";
      if (vale !== "unidade" && minutosDe(inicio) >= minutosDe(fim)) return "O início precisa ser antes do fim.";
    }
    if (motivo.trim().length < 2) return "Escreva o motivo (ex.: feriado).";
    return null;
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const p = problema();
    if (p) return setErro(p);
    setGravando(true);
    const r =
      vale === "unidade"
        ? await gravar("/api/horarios/datas/unidade", { data, aberta: !fechado, abre: fechado ? null : abre, ultimoPedido: fechado ? null : ultimo, fecha: fechado ? null : fecha, motivo: motivo.trim() })
        : await gravar("/api/horarios/datas/venda", {
            canal: vale === "categoria" ? canal : vale,
            categoriaId: vale === "categoria" ? categoriaId : null,
            data,
            modo: fechado ? "fechado" : "aberto",
            inicio: fechado ? null : inicio,
            fim: fechado ? null : fim,
            motivo: motivo.trim(),
          });
    setGravando(false);
    if (!r.ok) return setErro(r.mensagem);
    aoSalvo(data);
  }

  const opcoesVale: ValePara[] = ["unidade", "delivery", "loja", "categoria"];
  const hora = (rotulo: string, valor: string, mudar: (v: string) => void, dica: string) => (
    <CampoDoGrupo
      rotulo={rotulo}
      className="hor-hora"
      inputMode="numeric"
      autoComplete="off"
      placeholder={dica}
      maxLength={5}
      value={valor}
      onChange={(e) => mudar(e.target.value)}
      onBlur={(e) => mudar(arrumarHora(e.target.value))}
    />
  );

  return (
    <JanelaModal titulo={T.janelaData.titulo} sujo={sujo} aoMexer={() => setSujo(true)} aoFechar={aoFechar} data-testid="janela-data">
      <form className="hor-form" onSubmit={(e) => void salvar(e)} noValidate>
        <Campo
          rotulo={T.janelaData.data}
          explicacao={T.janelaData.dataAjuda}
          exemplo={T.janelaData.dataExemplo}
          type="date"
          min={horarios.hoje}
          max={somarDias(horarios.hoje, 366)}
          value={data}
          onChange={(e) => setData(e.target.value)}
          required
        />
        <Grupo legenda={T.janelaData.valePara} explicacao={T.janelaData.valeParaAjuda} exemplo={T.janelaData.valeParaExemplo} className="hor-escolhas">
          {opcoesVale.map((v) => (
            <OpcaoDoGrupo key={v} tipo="radio" name="vale-para" rotulo={T.janelaData.opcoes[v]} className="hor-escolha" checked={vale === v} onChange={() => setVale(v)} />
          ))}
        </Grupo>
        {vale === "categoria" && (
          <div className="cadastros__form-linha">
            <Selecao
              rotulo={T.janelaData.categoria}
              explicacao={T.janelaData.categoriaAjuda}
              exemplo={T.janelaData.categoriaExemplo}
              opcoes={ativas.map((c) => ({ valor: String(c.id), texto: c.nome }))}
              value={categoriaId === null ? "" : String(categoriaId)}
              onChange={(e) => setCategoriaId(Number(e.target.value))}
            />
            <Selecao
              rotulo={T.janelaData.canal}
              explicacao={T.janelaData.canalAjuda}
              exemplo={T.janelaData.canalExemplo}
              opcoes={CANAIS.map((c) => ({ valor: c, texto: NOME_DO_CANAL[c] }))}
              value={canal}
              onChange={(e) => setCanal(e.target.value as Canal)}
            />
          </div>
        )}
        <Grupo legenda={T.janelaData.como} explicacao={T.janelaData.comoAjuda} exemplo={T.janelaData.comoExemplo} className="hor-escolhas">
          <OpcaoDoGrupo tipo="radio" name="como-fica" rotulo={T.janelaData.fechado} className="hor-escolha" checked={fechado} onChange={() => setFechado(true)} />
          <OpcaoDoGrupo tipo="radio" name="como-fica" rotulo={T.janelaData.diferente} className="hor-escolha" checked={!fechado} onChange={() => setFechado(false)} />
        </Grupo>
        {!fechado && (
          <Grupo legenda={T.janelaData.horas} explicacao={T.janelaData.horasAjuda} exemplo={T.janelaData.horasExemplo} className="hor-grade" ajudaNoTopo>
            <div className="hor-dia__horas">
              {vale === "unidade" ? (
                <>
                  {hora(T.semana.abre, abre, setAbre, "09:00")}
                  {hora(T.semana.ultimo, ultimo, setUltimo, "14:30")}
                  {hora(T.semana.fecha, fecha, setFecha, "15:00")}
                </>
              ) : (
                <>
                  {hora(T.grade.inicio, inicio, setInicio, "18:00")}
                  {hora(T.grade.fim, fim, setFim, "23:00")}
                </>
              )}
            </div>
          </Grupo>
        )}
        {avisoAbrirDiaFechado && (
          <Aviso tipo="atencao" data-testid="aviso-dia-fechado">
            {T.janelaData.avisoDiaFechado}
          </Aviso>
        )}
        <Campo
          rotulo={T.janelaData.motivo}
          explicacao={T.janelaData.motivoAjuda}
          exemplo={T.janelaData.motivoExemplo}
          value={motivo}
          maxLength={80}
          onChange={(e) => setMotivo(e.target.value)}
          required
        />
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={gravando}>
            {T.janelaData.salvar}
          </Botao>
          <BotaoCancelar />
        </div>
      </form>
    </JanelaModal>
  );
}
