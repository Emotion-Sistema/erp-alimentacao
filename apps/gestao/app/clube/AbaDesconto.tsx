"use client";

/**
 * Aba "Desconto do app": Clube ligado, percentual (texto "10,5" -> pontos-base), onde vale (todas as
 * categorias ou as marcadas, só as em uso), teto por pedido em R$ (vazio = sem teto) e o horário do
 * desconto nos 7 dias. A prévia usa a regra única do servidor (`descontoDoClube`) com o que está na
 * tela, mesmo antes de salvar. "Salvar desconto" manda só esta aba em POST /api/clube/regras.
 */
import { useEffect, useId, useState } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import { MODOS_DO_HORARIO, NOME_DO_MODO } from "@erp/dominio/clube";
import { NOME_DO_DIA } from "@erp/dominio/horarios";
import { centavosDoTexto } from "@erp/dominio/produtos";
import { chamar } from "../chamar";
import { Campo, CampoDoGrupo, Grupo, Marcador, OpcaoDoGrupo } from "../Campo";
import { arrumarHora } from "../cadastros/horarios/contas";
import { corpoDoDesconto, formDoDesconto, fraseDaPrevia, momentoDe, problemaDoDia, type FormDoDesconto } from "./contas";
import type { PropsDaAba } from "./TelaDoClube";
import { TC } from "./textos";

export function AbaDesconto({ painel, podeGerenciar, avisar, recarregar }: PropsDaAba) {
  const nomeDoGrupo = useId();
  const [f, setF] = useState<FormDoDesconto>(() => formDoDesconto(painel.regras));
  const [exemplo, setExemplo] = useState("50,00");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const [agora, setAgora] = useState<Date | null>(null);
  const original = JSON.stringify(formDoDesconto(painel.regras));
  const mudou = JSON.stringify(f) !== original;
  const ativas = painel.categorias.filter((c) => c.ativo);
  const desligado = !podeGerenciar;

  // O relógio só no navegador (a prévia é "agora"); renova a cada minuto.
  useEffect(() => {
    setAgora(new Date());
    const t = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const mudarDia = (dia: number, parte: Partial<FormDoDesconto["dias"][number]>) =>
    setF((x) => ({ ...x, dias: x.dias.map((d) => (d.dia === dia ? { ...d, ...parte } : d)) }));

  async function salvar() {
    setErro("");
    const r = corpoDoDesconto(
      f,
      ativas.map((c) => c.id),
      (d) => NOME_DO_DIA[d]!,
    );
    if ("erro" in r) return setErro(r.erro);
    setGravando(true);
    const resp = await chamar("/api/clube/regras", "POST", r.corpo);
    setGravando(false);
    if (!resp.ok) return setErro(resp.mensagem);
    avisar(TC.desconto.salvo);
    await recarregar();
  }

  const exemploCentavos = centavosDoTexto(exemplo);
  const frase =
    agora === null ? "" : exemploCentavos === null || exemploCentavos > 99_999_999 ? TC.desconto.erroExemplo : fraseDaPrevia(f, exemploCentavos, momentoDe(agora));
  const semCategoriaAtiva = painel.regras.ligado && !painel.regras.todasAsCategorias && painel.regras.categorias.length === 0;

  return (
    <section className="hor-secao" aria-labelledby="clube-desconto-titulo" data-testid="aba-desconto">
      <h2 id="clube-desconto-titulo">{TC.desconto.titulo}</h2>
      <p className="hor-secao__intro">{TC.desconto.intro}</p>
      {semCategoriaAtiva && (
        <Aviso tipo="atencao" data-testid="sem-categoria-ativa">
          {TC.desconto.semCategoriaAtiva}
        </Aviso>
      )}
      <div className="hor-form">
        <Marcador
          rotulo={TC.desconto.ligado}
          explicacao={TC.desconto.ligadoAjuda}
          exemplo={TC.desconto.ligadoExemplo}
          className="hor-chave"
          checked={f.ligado}
          disabled={desligado}
          onChange={(e) => setF({ ...f, ligado: e.target.checked })}
        />
        <div className="linha-editavel__numeros">
          <Campo
            rotulo={TC.desconto.percentual}
            explicacao={TC.desconto.percentualAjuda}
            exemplo={TC.desconto.percentualExemplo}
            value={f.percentual}
            inputMode="decimal"
            maxLength={6}
            autoComplete="off"
            className="linha-editavel__numero"
            disabled={desligado}
            onChange={(e) => setF({ ...f, percentual: e.target.value })}
          />
          <Campo
            rotulo={TC.desconto.teto}
            explicacao={TC.desconto.tetoAjuda}
            exemplo={TC.desconto.tetoExemplo}
            value={f.teto}
            placeholder={TC.desconto.semTeto}
            inputMode="decimal"
            maxLength={12}
            autoComplete="off"
            className="linha-editavel__dinheiro"
            disabled={desligado}
            onChange={(e) => setF({ ...f, teto: e.target.value })}
          />
        </div>
        <Grupo legenda={TC.desconto.onde} explicacao={TC.desconto.ondeAjuda} exemplo={TC.desconto.ondeExemplo} className="hor-escolhas">
          <OpcaoDoGrupo tipo="radio" name={`${nomeDoGrupo}-onde`} rotulo={TC.desconto.todas} className="hor-escolha" checked={f.todas} disabled={desligado} onChange={() => setF({ ...f, todas: true })} />
          <OpcaoDoGrupo tipo="radio" name={`${nomeDoGrupo}-onde`} rotulo={TC.desconto.algumas} className="hor-escolha" checked={!f.todas} disabled={desligado} onChange={() => setF({ ...f, todas: false })} />
        </Grupo>
        {!f.todas && (
          <Grupo legenda={TC.desconto.categorias} explicacao={TC.desconto.categoriasAjuda} exemplo={TC.desconto.categoriasExemplo} className="hor-escolhas" ajudaNoTopo>
            {ativas.length === 0 ? (
              <p className="hor-vazio">{TC.desconto.semCategorias}</p>
            ) : (
              ativas.map((c) => (
                <OpcaoDoGrupo
                  key={c.id}
                  rotulo={c.nome}
                  className="hor-escolha"
                  checked={f.categorias.includes(c.id)}
                  disabled={desligado}
                  onChange={(e) =>
                    setF({ ...f, categorias: e.target.checked ? [...f.categorias, c.id] : f.categorias.filter((x) => x !== c.id) })
                  }
                />
              ))
            )}
          </Grupo>
        )}
        <Grupo legenda={TC.desconto.horario} explicacao={TC.desconto.horarioAjuda} exemplo={TC.desconto.horarioExemplo} className="hor-grade" ajudaNoTopo>
          <ul className="hor-grade__dias">
            {f.dias.map((d) => {
              const nome = NOME_DO_DIA[d.dia]!;
              const ruim = d.modo === "janela" && (d.inicio !== "" || d.fim !== "") && problemaDoDia(d);
              return (
                <li key={d.dia} role="group" aria-label={nome} className={["hor-dia", d.modo === "sem_desconto" && "hor-dia--fechado", ruim && "hor-dia--erro"].filter(Boolean).join(" ")} data-testid={`desconto-dia-${d.dia}`}>
                  <div className="hor-dia__cabeca">
                    <span className="hor-dia__nome">{nome}</span>
                  </div>
                  <div className="hor-dia__modos">
                    {MODOS_DO_HORARIO.map((m) => (
                      <OpcaoDoGrupo
                        key={m}
                        tipo="radio"
                        name={`${nomeDoGrupo}-${d.dia}`}
                        rotulo={NOME_DO_MODO[m]}
                        className="hor-modo"
                        checked={d.modo === m}
                        disabled={desligado}
                        onChange={() => mudarDia(d.dia, { modo: m })}
                      />
                    ))}
                  </div>
                  {d.modo === "janela" && (
                    <div className="hor-dia__horas">
                      {(
                        [
                          ["inicio", TC.desconto.inicio, "14:00"],
                          ["fim", TC.desconto.fim, "17:00"],
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
                          disabled={desligado}
                          onChange={(e) => mudarDia(d.dia, { [campo]: e.target.value })}
                          onBlur={(e) => mudarDia(d.dia, { [campo]: arrumarHora(e.target.value) })}
                        />
                      ))}
                    </div>
                  )}
                  {ruim && (
                    <p className="hor-dia__problema">
                      <Icone nome="alerta" />
                      {TC.desconto.erroHora(nome)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Grupo>
        <div className="clube__previa" data-testid="previa-do-desconto">
          <p className="clube__previa-titulo">{TC.desconto.previaTitulo}</p>
          <Campo
            rotulo={TC.desconto.previaValor}
            explicacao={TC.desconto.previaValorAjuda}
            exemplo={TC.desconto.previaValorExemplo}
            value={exemplo}
            inputMode="decimal"
            maxLength={12}
            autoComplete="off"
            className="linha-editavel__dinheiro"
            onChange={(e) => setExemplo(e.target.value)}
          />
          <p className="clube__previa-frase" aria-live="polite" data-testid="frase-da-previa">
            {frase}
          </p>
        </div>
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        {podeGerenciar && (
          <div className="hor-secao__botoes">
            <Botao onClick={() => void salvar()} disabled={!mudou || gravando}>
              {TC.desconto.salvar}
            </Botao>
            {mudou && (
              <Botao
                variante="secundario"
                onClick={() => {
                  setF(formDoDesconto(painel.regras));
                  setErro("");
                }}
              >
                {TC.desconto.desfazer}
              </Botao>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
