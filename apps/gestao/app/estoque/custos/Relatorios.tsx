"use client";

/**
 * Custos da área (E09 parte 5, decisão 0027): perdas por motivo e por item, diferenças das
 * contagens e valor do estoque por área (só com custos.ver), num período escolhido. Cada parte tem
 * "Baixar planilha (.csv)", montada aqui na tela. Quem não pode ver uma parte recebe a mensagem do
 * servidor no lugar dela.
 */
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Selo, varianteDaArea } from "@erp/interface";
import type { LinhaDeDiferenca, RelatorioDePerdas } from "@erp/dominio";
import { linhasParaCsv } from "@erp/dominio/importar";
import { chamar } from "../../chamar";
import { BotaoExemplos, Campo, Selecao } from "../../Campo";
import { formatarDataHora } from "../../formatar";
import { baixarArquivo, consulta, dia, hojeNaLoja, qtd, qtdComSinal, reais } from "../comum";
import type { ContextoDoEstoque } from "../contexto";
import { NOME_DO_LOCAL, NOME_DO_TIPO_DE_CONTAGEM, TE } from "../textos";

const T = TE.relatorios;
type Diferencas = { linhas: LinhaDeDiferenca[]; cortado: boolean; faltaCentavos: string | null; sobraCentavos: string | null };
type Valor = { areas: { area: string; valorCentavos: string; itens: number }[]; totalCentavos: string };
type Parte<X> = { dados: X | null; erro: string };

/** "R$ 12,50" vira "12,50" na planilha (o Excel brasileiro lê como número). */
const reaisNaPlanilha = (c: string | null) => (c === null ? "" : reais(c).replace("R$ ", ""));
const qtdNaPlanilha = (v: string) => v.replace(".", ",");

export function Relatorios({ contexto }: { contexto: ContextoDoEstoque }) {
  const hoje = hojeNaLoja();
  const [desde, setDesde] = useState(`${hoje.slice(0, 8)}01`);
  const [ate, setAte] = useState(hoje);
  const [area, setArea] = useState("");
  const [perdas, setPerdas] = useState<Parte<RelatorioDePerdas>>({ dados: null, erro: "" });
  const [difs, setDifs] = useState<Parte<Diferencas>>({ dados: null, erro: "" });
  const [valor, setValor] = useState<Parte<Valor>>({ dados: null, erro: "" });
  const [ocupado, setOcupado] = useState(false);
  const nomeDoMotivo = (m: string) => contexto.motivosDePerda.find((x) => x.valor === m)?.texto ?? m;

  const carregar = useCallback(async (f: { desde: string; ate: string; area: string }) => {
    setOcupado(true);
    const q = consulta(f);
    const [p, d] = await Promise.all([chamar<RelatorioDePerdas>(`/api/estoque/relatorios/perdas${q}`), chamar<Diferencas>(`/api/estoque/relatorios/contagens${q}`)]);
    setOcupado(false);
    setPerdas({ dados: p.ok ? p.dados : null, erro: p.ok ? "" : p.mensagem });
    setDifs({ dados: d.ok ? d.dados : null, erro: d.ok ? "" : d.mensagem });
  }, []);

  useEffect(() => {
    void carregar({ desde: `${hojeNaLoja().slice(0, 8)}01`, ate: hojeNaLoja(), area: "" });
    if (contexto.podeVerCusto) void chamar<Valor>("/api/estoque/relatorios/valor").then((r) => setValor({ dados: r.ok ? r.dados : null, erro: r.ok ? "" : r.mensagem }));
  }, [carregar, contexto.podeVerCusto]);

  const periodo = `${desde}-a-${ate}`;

  return (
    <div className="hor-tela est-tela">
      <header className="hor-tela__cabeca">
        <h1>{T.titulo}</h1>
        <p className="hor-tela__intro">{T.intro}</p>
      </header>
      <BotaoExemplos />
      <form
        className="hor-secao"
        onSubmit={(e) => {
          e.preventDefault();
          void carregar({ desde, ate, area });
        }}
      >
        <div className="est-form__linha">
          <Campo rotulo={T.desde} explicacao={T.desdeAjuda} exemplo={T.desdeExemplo} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <Campo rotulo={T.ate} explicacao={T.ateAjuda} exemplo={T.ateExemplo} type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        {contexto.areas.length > 1 && (
          <Selecao rotulo={T.area} explicacao={T.areaAjuda} exemplo={T.areaExemplo} value={area} onChange={(e) => setArea(e.target.value)} opcoes={[{ valor: "", texto: TE.painel.todas }, ...contexto.areas]} />
        )}
        <div className="hor-secao__botoes">
          <Botao type="submit" disabled={ocupado} aria-busy={ocupado}>
            {T.ver}
          </Botao>
        </div>
      </form>

      <section className="hor-secao" aria-labelledby="est-perdas" data-testid="relatorio-perdas">
        <div className="hor-secao__cabeca">
          <h2 id="est-perdas">{T.perdas}</h2>
          {perdas.dados && perdas.dados.itens.length > 0 && (
            <Botao
              variante="secundario"
              onClick={() =>
                baixarArquivo(
                  `perdas-${periodo}.csv`,
                  linhasParaCsv([
                    ["Motivo", "Item", "Vezes", "Quantidade", "Unidade", ...(contexto.podeVerCusto ? ["Valor (R$)"] : [])],
                    ...perdas.dados!.itens.map((i) => [nomeDoMotivo(i.motivo), i.nome, String(i.vezes), qtdNaPlanilha(i.quantidade), i.unidade, ...(contexto.podeVerCusto ? [reaisNaPlanilha(i.valorCentavos)] : [])]),
                  ]),
                )
              }
            >
              {T.baixar}
            </Botao>
          )}
        </div>
        <p className="hor-secao__intro">{T.perdasIntro}</p>
        {perdas.erro && <Aviso tipo="perigo">{perdas.erro}</Aviso>}
        {perdas.dados && perdas.dados.itens.length === 0 && <p className="hor-vazio">{T.semPerdas}</p>}
        {perdas.dados && perdas.dados.itens.length > 0 && (
          <>
            <h3>{T.porMotivo}</h3>
            <ul className="est-lista">
              {perdas.dados.porMotivo.map((m) => (
                <li key={m.motivo} className="est-linha">
                  <span className="est-linha__cabeca">
                    <strong>{nomeDoMotivo(m.motivo)}</strong>
                    <span>{T.vezes(m.vezes)}</span>
                    {m.valorCentavos !== null && <Selo>{reais(m.valorCentavos)}</Selo>}
                  </span>
                </li>
              ))}
            </ul>
            {perdas.dados.totalCentavos !== null && <p className="est-total">{T.total(reais(perdas.dados.totalCentavos))}</p>}
            <h3>{T.porItem}</h3>
            <ul className="est-lista">
              {perdas.dados.itens.map((i) => (
                <li key={`${i.motivo}-${i.itemId}`} className="est-linha">
                  <span className="est-linha__cabeca">
                    <strong>{i.nome}</strong>
                    <span>{qtd(i.quantidade, i.unidade)}</span>
                    {i.valorCentavos !== null && <Selo>{reais(i.valorCentavos)}</Selo>}
                  </span>
                  <span className="est-linha__texto">
                    {nomeDoMotivo(i.motivo)}, {T.vezes(i.vezes)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="hor-secao" aria-labelledby="est-difs" data-testid="relatorio-diferencas">
        <div className="hor-secao__cabeca">
          <h2 id="est-difs">{T.diferencas}</h2>
          {difs.dados && difs.dados.linhas.length > 0 && (
            <Botao
              variante="secundario"
              onClick={() =>
                baixarArquivo(
                  `diferencas-${periodo}.csv`,
                  linhasParaCsv([
                    ["Contagem", "Tipo", "Área", "Fechada em", "Item", "Local", "Esperado", "Contado", "Diferença", "Unidade", ...(contexto.podeVerCusto ? ["Valor (R$)"] : [])],
                    ...difs.dados!.linhas.map((l) => [
                      String(l.contagemId),
                      NOME_DO_TIPO_DE_CONTAGEM[l.tipo] ?? l.tipo,
                      contexto.nomeDaArea[l.area] ?? l.area,
                      formatarDataHora(l.fechadaEm),
                      l.nome,
                      NOME_DO_LOCAL[l.local] ?? l.local,
                      qtdNaPlanilha(l.esperado),
                      qtdNaPlanilha(l.contado),
                      qtdNaPlanilha(l.diferenca),
                      l.unidade,
                      ...(contexto.podeVerCusto ? [reaisNaPlanilha(l.valorCentavos)] : []),
                    ]),
                  ]),
                )
              }
            >
              {T.baixar}
            </Botao>
          )}
        </div>
        <p className="hor-secao__intro">{T.diferencasIntro}</p>
        {difs.erro && <Aviso tipo="perigo">{difs.erro}</Aviso>}
        {difs.dados && difs.dados.linhas.length === 0 && <p className="hor-vazio">{T.semDiferencas}</p>}
        {difs.dados?.cortado && <Aviso tipo="info">{T.cortado}</Aviso>}
        {difs.dados && difs.dados.linhas.length > 0 && (
          <>
            {(difs.dados.faltaCentavos !== null || difs.dados.sobraCentavos !== null) && (
              <p className="est-total">
                {T.faltou(reais(difs.dados.faltaCentavos ?? "0"))}. {T.sobrou(reais(difs.dados.sobraCentavos ?? "0"))}.
              </p>
            )}
            <ul className="est-lista">
              {difs.dados.linhas.map((l) => (
                <li key={`${l.contagemId}-${l.itemId}-${l.local}`} className="est-linha">
                  <span className="est-linha__cabeca">
                    <strong>{l.nome}</strong>
                    <span>{NOME_DO_LOCAL[l.local]}</span>
                    <Selo variante={l.diferenca.startsWith("-") ? "perigo" : "info"}>{qtdComSinal(l.diferenca, l.unidade)}</Selo>
                    {l.valorCentavos !== null && <Selo>{reais(l.valorCentavos)}</Selo>}
                  </span>
                  <span className="est-linha__texto">
                    {T.linhaDif(qtd(l.esperado, l.unidade), qtd(l.contado, l.unidade), qtdComSinal(l.diferenca, l.unidade))}. {contexto.nomeDaArea[l.area]}, {dia(l.fechadaEm.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {contexto.podeVerCusto && (
        <section className="hor-secao" aria-labelledby="est-valor" data-testid="relatorio-valor">
          <div className="hor-secao__cabeca">
            <h2 id="est-valor">{T.valor}</h2>
            {valor.dados && valor.dados.areas.length > 0 && (
              <Botao
                variante="secundario"
                onClick={() =>
                  baixarArquivo(
                    `valor-do-estoque-${hoje}.csv`,
                    linhasParaCsv([["Área", "Itens", "Valor (R$)"], ...valor.dados!.areas.map((a) => [contexto.nomeDaArea[a.area] ?? a.area, String(a.itens), reaisNaPlanilha(a.valorCentavos)]), ["Total", "", reaisNaPlanilha(valor.dados!.totalCentavos)]]),
                  )
                }
              >
                {T.baixar}
              </Botao>
            )}
          </div>
          <p className="hor-secao__intro">{T.valorIntro}</p>
          {valor.erro && <Aviso tipo="perigo">{valor.erro}</Aviso>}
          {valor.dados && valor.dados.areas.length === 0 && <p className="hor-vazio">{T.semValor}</p>}
          {valor.dados && valor.dados.areas.length > 0 && (
            <>
              <ul className="est-lista">
                {valor.dados.areas.map((a) => (
                  <li key={a.area} className="est-linha">
                    <span className="est-linha__cabeca">
                      <Selo variante={varianteDaArea(a.area)}>{contexto.nomeDaArea[a.area] ?? a.area}</Selo>
                      <strong>{reais(a.valorCentavos)}</strong>
                      <span>{T.itens(a.itens)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="est-total">{T.totalGeral(reais(valor.dados.totalCentavos))}</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
