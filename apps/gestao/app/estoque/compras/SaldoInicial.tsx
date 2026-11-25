"use client";

/**
 * Saldo inicial por planilha (E09 parte 2, decisão 0027). O mesmo fluxo da importação de cadastros:
 * escolher o arquivo, o servidor confere linha por linha, "Corrigir aqui" (ideia nº 13) ou Pular e
 * Gravar (um movimento só, com a chave da conferência: o toque duplo não grava duas vezes). O aviso
 * de que já houve saldo inicial (gravar de novo SOMA) fica em destaque. A planilha modelo sai daqui,
 * com as colunas que o servidor entende.
 */
import { useMemo, useRef, useState } from "react";
import { Aviso, Botao, Selo } from "@erp/interface";
import type { ConferenciaDoSaldoInicial } from "@erp/dominio";
import { EXTENSOES_ACEITAS, LIMITE_DE_BYTES, linhasParaCsv } from "@erp/dominio/importar";
import { BotaoExemplos, Campo, Grupo, OpcaoDoGrupo } from "../../Campo";
import { chamar } from "../../chamar";
import { BotaoCorrigir, CorrecoesFeitas, CorrigirLinha, baixarCsv, juntarCorrecoes, nomeDaCorrigida, paraEnviar, type ColunaParaCorrigir, type CorrecaoFeita } from "../../cadastros/importar/CorrigirNoPainel";
import { TC } from "../../cadastros/importar/textos";
import { baixarArquivo, lerComoBase64 } from "../comum";
import type { ContextoDoEstoque } from "../contexto";
import { TE } from "../textos";

const T = TE.saldo;
type Arquivo = { nome: string; conteudo: string };

export function SaldoInicial({ contexto, aoGravar }: { contexto: ContextoDoEstoque; aoGravar: () => void }) {
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [conf, setConf] = useState<ConferenciaDoSaldoInicial | null>(null);
  const [pular, setPular] = useState<Set<number>>(new Set());
  const [correcoes, setCorrecoes] = useState<CorrecaoFeita[]>([]);
  const [corrigindo, setCorrigindo] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<"" | "conferindo" | "gravando">("");
  const [erro, setErro] = useState("");
  const [gravado, setGravado] = useState<ConferenciaDoSaldoInicial | null>(null);
  const [versaoDoCampo, setVersaoDoCampo] = useState(0);
  const enviando = useRef(false);

  async function conferir(a: Arquivo, pulando: Set<number>, lista: CorrecaoFeita[], manterSeFalhar = false): Promise<boolean> {
    setOcupado("conferindo");
    setErro("");
    const r = await chamar<ConferenciaDoSaldoInicial>("/api/estoque/saldo-inicial", "POST", { arquivo: a, aplicar: false, pular: [...pulando], correcoes: paraEnviar(lista) });
    setOcupado("");
    if (!r.ok || !r.dados) {
      if (!manterSeFalhar) setConf(null);
      setErro(r.mensagem);
      return false;
    }
    setConf(r.dados);
    return true;
  }

  async function escolher(lista: FileList | null) {
    const f = lista?.[0];
    setConf(null);
    setGravado(null);
    setPular(new Set());
    setCorrecoes([]);
    setCorrigindo(null);
    if (!f) return setArquivo(null);
    if (f.size > LIMITE_DE_BYTES) {
      setArquivo(null);
      return setErro(T.grande);
    }
    try {
      const a = { nome: f.name.slice(0, 200), conteudo: await lerComoBase64(f) };
      setArquivo(a);
      await conferir(a, new Set(), []);
    } catch {
      setErro(T.semLeitura);
    }
  }

  async function mudarCorrecoes(nova: CorrecaoFeita[]) {
    if (!arquivo) return;
    const antes = correcoes;
    setCorrecoes(nova);
    const ok = await conferir(arquivo, pular, nova, true);
    if (!ok) setCorrecoes(antes);
    else setCorrigindo(null);
  }

  async function alternarPulo(numero: number, marcado: boolean) {
    if (!arquivo) return;
    const novo = new Set(pular);
    if (marcado) novo.add(numero);
    else novo.delete(numero);
    setPular(novo);
    await conferir(arquivo, novo, correcoes, true);
  }

  async function baixarCorrigida() {
    if (!arquivo || !conf) return;
    const r = await chamar<ConferenciaDoSaldoInicial>("/api/estoque/saldo-inicial", "POST", { arquivo, aplicar: false, pular: [...pular], correcoes: paraEnviar(correcoes), devolverTabela: true });
    if (!r.ok || !r.dados?.tabela) return setErro(r.mensagem);
    baixarCsv(nomeDaCorrigida(conf.arquivo), r.dados.tabela);
  }

  async function gravar() {
    if (!conf || !arquivo || enviando.current) return;
    enviando.current = true;
    setOcupado("gravando");
    setErro("");
    const r = await chamar<ConferenciaDoSaldoInicial>("/api/estoque/saldo-inicial", "POST", { arquivo, aplicar: true, chave: conf.chave, pular: [...pular], correcoes: paraEnviar(correcoes) });
    enviando.current = false;
    setOcupado("");
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setGravado(r.dados);
    aoGravar();
  }

  function recomecar() {
    setArquivo(null);
    setConf(null);
    setGravado(null);
    setPular(new Set());
    setCorrecoes([]);
    setCorrigindo(null);
    setErro("");
    setVersaoDoCampo((v) => v + 1);
  }

  function baixarModelo() {
    const c = contexto.camposDoSaldo.filter((x) => contexto.podeVerCusto || (x.campo !== "valor" && x.campo !== "preco"));
    baixarArquivo("saldo-inicial-modelo.csv", linhasParaCsv([c.map((x) => x.rotulo), c.map((x) => x.exemplo)]));
  }

  const colunas: ColunaParaCorrigir[] = useMemo(() => {
    if (!conf) return [];
    return conf.colunas.map((col) => {
      const campo = contexto.camposDoSaldo.find((c) => (conf.mapa as Record<string, number | undefined>)[c.campo] === col.indice);
      return {
        indice: col.indice,
        rotulo: col.texto || TC.colunaSemNome(col.letra),
        explicacao: campo?.explicacao ?? TC.semUso,
        exemplo: campo?.exemplo ?? TC.semUsoExemplo,
        opcoes: conf.opcoes[String(col.indice)],
      };
    });
  }, [conf, contexto.camposDoSaldo]);

  return (
    <div className="est-contagens imp-tela">
      <section className="hor-secao" aria-labelledby="est-saldo">
        <h2 id="est-saldo">{T.titulo}</h2>
        <p className="hor-secao__intro">{T.intro}</p>
        <div className="hor-secao__botoes">
          <Botao variante="secundario" onClick={baixarModelo}>
            {T.modelo}
          </Botao>
        </div>
        <details className="imp-colunas">
          <summary>{T.colunas}</summary>
          <ul>
            {contexto.camposDoSaldo.map((c) => (
              <li key={c.campo}>
                <strong>{c.rotulo}</strong> ({c.obrigatorio ? T.obrigatoria : T.opcional}): {c.explicacao}
              </li>
            ))}
          </ul>
        </details>
        <BotaoExemplos />
        <Campo
          key={versaoDoCampo}
          type="file"
          rotulo={T.arquivo}
          explicacao={T.arquivoAjuda}
          exemplo={T.arquivoExemplo}
          accept={EXTENSOES_ACEITAS}
          disabled={!!ocupado}
          onChange={(e) => void escolher(e.target.files)}
        />
        <div aria-live="polite">
          {ocupado === "conferindo" && <p>{T.conferindo}</p>}
          {erro && (
            <Aviso tipo="perigo" data-testid="erro-do-saldo">
              {erro}
            </Aviso>
          )}
        </div>
      </section>

      {conf && !gravado && (
        <section className="hor-secao" aria-labelledby="est-saldo-conferido" data-testid="saldo-conferido">
          <h2 id="est-saldo-conferido">{conf.arquivo}</h2>
          {conf.avisoDeRepeticao && (
            <Aviso tipo="atencao" className="est-destaque" data-testid="aviso-de-repeticao">
              <strong>{conf.avisoDeRepeticao}</strong>
            </Aviso>
          )}
          {conf.faltamColunas.length > 0 && <Aviso tipo="atencao">{T.faltam(conf.faltamColunas)}</Aviso>}
          <p className="imp-resumo" data-testid="resumo-do-saldo">
            {T.resumo(conf.resumo)}
          </p>
          {conf.avisoDasCelulas && <Aviso tipo="atencao">{conf.avisoDasCelulas}</Aviso>}
          <CorrecoesFeitas lista={correcoes} ocupado={!!ocupado} aoDesfazer={(c) => void mudarCorrecoes(correcoes.filter((x) => x !== c))} aoBaixar={() => void baixarCorrigida()} />
          <Grupo legenda={T.linhas} explicacao={T.linhasAjuda} exemplo={T.linhasExemplo} className="imp-grupo" ajudaNoTopo>
            <ul className="imp-linhas">
              {conf.linhas.map((l) => {
                const situacao = l.pulada ? "pulada" : l.situacao;
                return (
                  <li key={l.numero} className={`imp-linha imp-linha--${situacao}`} data-testid={`linha-${l.numero}`}>
                    <div className="imp-linha__cabeca">
                      <span className="imp-linha__numero">{T.linha(l.numero)}</span>
                      <Selo variante={situacao === "ok" ? "sucesso" : situacao === "erro" ? "perigo" : "neutro"}>{T[situacao]}</Selo>
                      <span className="imp-linha__nome">{l.nome}</span>
                    </div>
                    {l.resumo && <p className="imp-linha__resumo">{l.resumo}</p>}
                    {l.problemas.length > 0 && (
                      <ul className="imp-linha__problemas">
                        {l.problemas.map((p, i) => (
                          <li key={i}>
                            {p.coluna !== null && conf.colunas[p.coluna] && <strong>{conf.colunas[p.coluna]!.texto || TC.colunaSemNome(conf.colunas[p.coluna]!.letra)}: </strong>}
                            {p.texto}
                          </li>
                        ))}
                      </ul>
                    )}
                    {l.avisos.length > 0 && (
                      <ul className="imp-linha__avisos">
                        {l.avisos.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    )}
                    {l.situacao === "erro" && l.celulas && (
                      <BotaoCorrigir numero={l.numero} aberto={corrigindo === l.numero} disabled={!!ocupado} onClick={() => setCorrigindo(corrigindo === l.numero ? null : l.numero)} />
                    )}
                    {corrigindo === l.numero && l.celulas && (
                      <CorrigirLinha
                        key={`${l.numero}:${l.celulas.join("\u0001")}`}
                        numero={l.numero}
                        colunas={colunas}
                        celulas={l.celulas}
                        comProblema={new Set(l.problemas.flatMap((p) => (p.coluna === null ? [] : [p.coluna])))}
                        truncadas={new Set(l.colunasTruncadas ?? [])}
                        ocupado={!!ocupado}
                        aoAplicar={(novas) => void mudarCorrecoes(juntarCorrecoes(correcoes, novas))}
                        aoCancelar={() => setCorrigindo(null)}
                      />
                    )}
                    {(l.situacao === "erro" || l.pulada) && (
                      <OpcaoDoGrupo className="imp-linha__pular" rotulo={T.pular(l.numero)} checked={l.pulada} disabled={!!ocupado} onChange={(e) => void alternarPulo(l.numero, e.target.checked)} />
                    )}
                  </li>
                );
              })}
            </ul>
          </Grupo>
          {conf.resumo.erros > 0 && <Aviso tipo="atencao">{T.corrija}</Aviso>}
          <div className="hor-secao__botoes">
            <Botao onClick={() => void gravar()} disabled={!!ocupado || conf.resumo.erros > 0 || conf.resumo.prontas === 0 || conf.faltamColunas.length > 0} aria-busy={ocupado === "gravando"}>
              {ocupado === "gravando" ? T.gravando : T.gravar(conf.resumo.prontas)}
            </Botao>
          </div>
        </section>
      )}

      {gravado && (
        <section className="hor-secao" aria-label={T.gravado}>
          <Aviso tipo="sucesso" data-testid="saldo-gravado">
            {gravado.repetido ? T.repetido : T.gravado}
          </Aviso>
          <div className="hor-secao__botoes">
            <Botao variante="secundario" onClick={recomecar}>
              {T.outro}
            </Botao>
          </div>
        </section>
      )}
    </div>
  );
}
