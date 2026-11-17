"use client";

/**
 * Grade de 7 dias de um canal (categoria nula) ou de uma categoria num canal. Componente
 * reutilizável: a tela de horários usa para Loja e Delivery; a de categorias, para cada categoria.
 * Cada dia: "Igual à loja" / "Igual ao canal" (segue), "Fechado" ou "Horário próprio" (início e fim).
 * Ao lado de cada dia mostra o horário que vai valer de fato (interseção com as camadas de fora,
 * do que está gravado), calculado só para mostrar: quem decide é o banco (`situacao_de_venda`).
 */
import { useEffect, useId, useMemo, useState } from "react";
import { Aviso, Botao, Icone, Selo } from "@erp/interface";
import { NOME_DO_DIA, type Canal } from "@erp/dominio/horarios";
import { CampoDoGrupo, Grupo, OpcaoDoGrupo } from "../../Campo";
import {
  arrumarHora,
  camadaDoCanal,
  corpoDaVenda,
  efetivoDoDia,
  mesmaVenda,
  problemaDoDiaDeVenda,
  textoDoEfetivo,
  vendaParaEditar,
  type DiaDeVenda,
  type Horarios,
  type ModoDoDia,
} from "./contas";
import type { Gravar } from "./usarHorarios";
import { T } from "./textos";

export function GradeDeVenda({
  canal,
  categoriaId,
  alvo,
  horarios,
  podeMudar,
  gravar,
  avisar,
}: {
  canal: Canal;
  /** null = o canal inteiro. */
  categoriaId: number | null;
  /** Como o alvo aparece nas frases: "do delivery", "de Almoço na loja". */
  alvo: string;
  horarios: Pick<Horarios, "semana" | "venda">;
  podeMudar: boolean;
  gravar: Gravar;
  avisar: (texto: string) => void;
}) {
  const nomeDoGrupo = useId();
  const base = useMemo(() => vendaParaEditar(horarios.venda, canal, categoriaId), [horarios.venda, canal, categoriaId]);
  const chaveBase = JSON.stringify(base);
  const [dias, setDias] = useState<DiaDeVenda[]>(base);
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    setDias(JSON.parse(chaveBase) as DiaDeVenda[]);
    setTentou(false);
    setErro("");
  }, [chaveBase]);

  const segue = categoriaId === null ? T.grade.segueLoja : T.grade.segueCanal;
  const mudou = !mesmaVenda(dias, base);
  const problemas = dias.map(problemaDoDiaDeVenda);
  const mudar = (dia: number, parte: Partial<DiaDeVenda>) => setDias((ds) => ds.map((d) => (d.dia === dia ? { ...d, ...parte } : d)));

  async function salvar() {
    setTentou(true);
    setErro("");
    if (problemas.some(Boolean)) return setErro(T.grade.corrigir);
    setGravando(true);
    const r = await gravar("/api/horarios/venda", corpoDaVenda(canal, categoriaId, dias));
    setGravando(false);
    if (!r.ok) return setErro(r.mensagem);
    avisar(T.grade.salvo(alvo));
  }

  const opcoes: { modo: ModoDoDia; texto: string }[] = [
    { modo: "segue", texto: segue },
    { modo: "fechado", texto: T.grade.fechado },
    { modo: "aberto", texto: T.grade.proprio },
  ];

  return (
    <div className="hor-venda" data-testid={`grade-${canal}-${categoriaId ?? "canal"}`}>
      <Grupo legenda={T.grade.legenda(alvo)} explicacao={T.grade.ajuda(segue)} exemplo={T.grade.exemplo} className="hor-grade" ajudaNoTopo>
        <ul className="hor-grade__dias">
          {dias.map((d) => {
            const nome = NOME_DO_DIA[d.dia]!;
            const loja = horarios.semana.find((s) => s.dia === d.dia);
            const camadas = [
              ...(categoriaId === null ? [] : [{ camada: camadaDoCanal(horarios.venda, canal, d.dia), fechadoTexto: canal === "delivery" ? "Delivery fechado" : "Loja não vende" }]),
              { camada: { modo: d.modo, inicio: d.inicio || null, fim: d.fim || null }, fechadoTexto: T.grade.naoVende },
            ];
            const efetivo = efetivoDoDia(loja, camadas);
            const problema = (tentou || JSON.stringify(d) !== JSON.stringify(base.find((b) => b.dia === d.dia))) && problemas[d.dia - 1];
            return (
              <li key={d.dia} role="group" aria-label={nome} className={["hor-dia", problema && "hor-dia--erro"].filter(Boolean).join(" ")} data-testid={`venda-${d.dia}`}>
                <div className="hor-dia__cabeca">
                  <span className="hor-dia__nome">{nome}</span>
                  <span className="hor-dia__vale" data-testid="vale">
                    <span className="hor-dia__vale-rotulo">{T.grade.vale}</span>
                    <Selo variante={efetivo.vende ? "sucesso" : "neutro"}>{textoDoEfetivo(efetivo)}</Selo>
                  </span>
                </div>
                <div className="hor-dia__modos">
                  {opcoes.map((o) => (
                    <OpcaoDoGrupo
                      key={o.modo}
                      tipo="radio"
                      name={`${nomeDoGrupo}-${d.dia}`}
                      rotulo={o.texto}
                      className="hor-modo"
                      checked={d.modo === o.modo}
                      disabled={!podeMudar}
                      onChange={() => mudar(d.dia, { modo: o.modo })}
                    />
                  ))}
                </div>
                {d.modo === "aberto" && (
                  <div className="hor-dia__horas">
                    {(
                      [
                        ["inicio", T.grade.inicio, "18:00"],
                        ["fim", T.grade.fim, "23:00"],
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
          <Botao onClick={() => void salvar()} disabled={!mudou || gravando}>
            {T.grade.salvar(alvo)}
          </Botao>
          {mudou && (
            <Botao
              variante="secundario"
              onClick={() => {
                setDias(base);
                setTentou(false);
                setErro("");
              }}
            >
              {T.grade.desfazer}
            </Botao>
          )}
        </div>
      )}
    </div>
  );
}
