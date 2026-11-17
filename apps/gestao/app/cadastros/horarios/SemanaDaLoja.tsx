"use client";

/**
 * "Semana da loja": 7 linhas (Segunda a Domingo) com Aberta, Abre, Último pedido da cozinha e Fecha.
 * O botão "Salvar semana" só acende com mudança. Confere a ordem na tela antes de mandar; o servidor
 * confere de novo e a mensagem dele aparece se recusar. Quem não pode mudar vê tudo travado.
 */
import { useEffect, useMemo, useState } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import { NOME_DO_DIA } from "@erp/dominio/horarios";
import { CampoDoGrupo, Grupo, OpcaoDoGrupo } from "../../Campo";
import { arrumarHora, corpoDaSemana, mesmaSemana, problemaDoDiaDaLoja, semanaParaEditar, type DiaDaLoja, type Horarios } from "./contas";
import type { Gravar } from "./usarHorarios";
import { T } from "./textos";

export function SemanaDaLoja({ semana, podeMudar, gravar, avisar }: { semana: Horarios["semana"]; podeMudar: boolean; gravar: Gravar; avisar: (texto: string) => void }) {
  const base = useMemo(() => semanaParaEditar(semana), [semana]);
  const chaveBase = JSON.stringify(base);
  const [dias, setDias] = useState<DiaDaLoja[]>(base);
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  // O que está gravado mudou (salvou aqui ou em outro lugar): recomeça dele.
  useEffect(() => {
    setDias(JSON.parse(chaveBase) as DiaDaLoja[]);
    setTentou(false);
  }, [chaveBase]);

  const mudou = !mesmaSemana(dias, base);
  const problemas = dias.map(problemaDoDiaDaLoja);
  const mudar = (dia: number, parte: Partial<DiaDaLoja>) => setDias((ds) => ds.map((d) => (d.dia === dia ? { ...d, ...parte } : d)));

  function copiar(origem: DiaDaLoja) {
    setDias((ds) => ds.map((d) => (d.aberta && d.dia !== origem.dia ? { ...d, abre: origem.abre, ultimoPedido: origem.ultimoPedido, fecha: origem.fecha } : d)));
    avisar(T.semana.copiado(NOME_DO_DIA[origem.dia]!));
  }

  async function salvar() {
    setTentou(true);
    setErro("");
    if (problemas.some(Boolean)) return setErro(T.semana.corrigir);
    setGravando(true);
    const r = await gravar("/api/horarios/semana", corpoDaSemana(dias));
    setGravando(false);
    if (!r.ok) return setErro(r.mensagem);
    avisar(T.semana.salva);
  }

  return (
    <section className="hor-secao" aria-labelledby="hor-semana-titulo" data-testid="semana-da-loja">
      <h2 id="hor-semana-titulo">{T.semana.titulo}</h2>
      <p className="hor-secao__intro">{T.semana.explicacao}</p>
      <Grupo legenda={T.semana.legenda} explicacao={T.semana.ajuda} exemplo={T.semana.exemplo} className="hor-grade" ajudaNoTopo>
        <ul className="hor-grade__dias">
          {dias.map((d) => {
            const nome = NOME_DO_DIA[d.dia]!;
            const problema = (tentou || JSON.stringify(d) !== JSON.stringify(base.find((b) => b.dia === d.dia))) && problemas[d.dia - 1];
            return (
              <li key={d.dia} role="group" aria-label={nome} className={["hor-dia", !d.aberta && "hor-dia--fechado", problema && "hor-dia--erro"].filter(Boolean).join(" ")} data-testid={`semana-${d.dia}`}>
                <div className="hor-dia__cabeca">
                  <span className="hor-dia__nome">{nome}</span>
                  <OpcaoDoGrupo
                    rotulo={T.semana.aberta}
                    className="hor-chave"
                    checked={d.aberta}
                    disabled={!podeMudar}
                    onChange={(e) => mudar(d.dia, { aberta: e.target.checked })}
                  />
                </div>
                {d.aberta ? (
                  <div className="hor-dia__horas">
                    {(
                      [
                        ["abre", T.semana.abre, "10:00"],
                        ["ultimoPedido", T.semana.ultimo, "23:00"],
                        ["fecha", T.semana.fecha, "23:30"],
                      ] as const
                    ).map(([campo, rotulo, dica]) => (
                      <CampoDoGrupo
                        key={campo}
                        rotulo={rotulo}
                        complemento={`(${nome.toLowerCase()})`}
                        className="hor-hora"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={dica}
                        maxLength={5}
                        value={d[campo]}
                        disabled={!podeMudar}
                        onChange={(e) => mudar(d.dia, { [campo]: e.target.value })}
                        onBlur={(e) => mudar(d.dia, { [campo]: arrumarHora(e.target.value) })}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="hor-dia__fechado">{T.semana.fechadoNoDia}</p>
                )}
                {podeMudar && d.aberta && (
                  <button type="button" className="hor-dia__copiar" aria-label={T.semana.copiarNome(nome)} onClick={() => copiar(d)}>
                    {T.semana.copiar}
                  </button>
                )}
                {problema && (
                  <p className="hor-dia__problema" role="alert">
                    <Icone nome="alerta" />
                    {problema}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Grupo>
      <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
      {podeMudar && (
        <div className="hor-secao__botoes">
          <Botao onClick={() => void salvar()} disabled={!mudou || gravando} data-testid="salvar-semana">
            {T.semana.salvar}
          </Botao>
          {mudou && (
            <Botao variante="secundario" onClick={() => { setDias(base); setTentou(false); setErro(""); }}>
              {T.semana.desfazer}
            </Botao>
          )}
        </div>
      )}
    </section>
  );
}
