"use client";

/**
 * Tela "Importar planilha" (E07 parte 3, decisão 0020). Passos: o que vai importar (e o modelo
 * para baixar), escolher o arquivo, conferir as colunas, ver o resultado linha por linha (com
 * filtro e relatório de erros) e gravar. A tela só mostra: quem lê o arquivo, confere e grava é o
 * servidor, que confere tudo de novo ao gravar. A chave da conferência faz o clique duplo não
 * importar duas vezes. Linha com erro: "Corrigir aqui" (ideia nº 13) abre os campos da linha; a
 * tela guarda a lista de correções e reenvia o arquivo + todas elas a cada conferência e ao
 * gravar (o servidor aplica e confere de novo). Componente cliente: nunca importa `@erp/dominio` raiz.
 */
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Aviso, Botao, Selo, type VarianteDoSelo } from "@erp/interface";
import {
  CAMPOS,
  EXTENSOES_ACEITAS,
  letraDaColuna,
  LIMITE_DE_BYTES,
  NOME_DA_SITUACAO,
  NOME_DO_TIPO,
  podeGravar,
  relatorioDeErros,
  resumir,
  textoDoResumo,
  type Conferencia,
  type LinhaConferida,
  type MapaDeColunas,
  type ResultadoDaGravacao,
  type TipoDeImportacao,
} from "@erp/dominio/importar";
import { BotaoExemplos, Campo, Grupo, OpcaoDoGrupo, Selecao } from "../../Campo";
import { chamar } from "../../chamar";
import { BotaoCorrigir, CorrecoesFeitas, CorrigirLinha, baixarCsv, juntarCorrecoes, nomeDaCorrigida, paraEnviar, type ColunaParaCorrigir, type CorrecaoFeita } from "./CorrigirNoPainel";
import { TC, TI } from "./textos";

type Arquivo = { nome: string; conteudo: string };
type Filtro = "todas" | "ok" | "erro" | "ja_existe" | "pulada";
const FILTROS: Filtro[] = ["todas", "ok", "erro", "ja_existe", "pulada"];
const POR_VEZ = 100;
const SELO: Record<LinhaConferida["situacao"] | "pulada", VarianteDoSelo> = { ok: "sucesso", erro: "perigo", ja_existe: "info", pulada: "neutro" };
const CAMINHO_DO_TIPO: Record<TipoDeImportacao, string> = { ingredientes: "/cadastros", produtos: "/cadastros/produtos" };

type Opcoes = { mapa?: MapaDeColunas; pulando?: Set<number>; correcoes?: CorrecaoFeita[]; manterSeFalhar?: boolean };

/** Lê o arquivo do aparelho em base64 (vai dentro do JSON; o servidor confere o tamanho de novo). */
function lerComoBase64(arquivo: File): Promise<string> {
  return new Promise((resolver, falhar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result).replace(/^data:[^,]*,/, ""));
    leitor.onerror = () => falhar(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

function baixarTexto(nome: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportarPlanilha({ tipoInicial }: { tipoInicial: TipoDeImportacao }) {
  const [tipo, setTipo] = useState<TipoDeImportacao>(tipoInicial);
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [pular, setPular] = useState<Set<number>>(new Set());
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [quantos, setQuantos] = useState(POR_VEZ);
  const [ocupado, setOcupado] = useState<"" | "conferindo" | "gravando">("");
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ResultadoDaGravacao | null>(null);
  const [versaoDoCampo, setVersaoDoCampo] = useState(0);
  const [correcoes, setCorrecoes] = useState<CorrecaoFeita[]>([]);
  const [corrigindo, setCorrigindo] = useState<number | null>(null);
  // Trava contra clique duplo antes de a tela redesenhar (o servidor também não importa duas vezes).
  const enviando = useRef(false);
  const nomeDoTipo = NOME_DO_TIPO[tipo];

  /** Confere no servidor. Com `manterSeFalhar`, um erro (ex.: correção recusada) deixa a conferência anterior na tela. */
  async function conferir(a: Arquivo, t: TipoDeImportacao, { mapa, pulando = pular, correcoes: lista = correcoes, manterSeFalhar = false }: Opcoes = {}): Promise<boolean> {
    setOcupado("conferindo");
    setErro("");
    setResultado(null);
    const r = await chamar<Conferencia>("/api/cadastros/importar/conferir", "POST", { tipo: t, arquivo: a, mapa, pular: [...pulando], correcoes: paraEnviar(lista) });
    setOcupado("");
    if (!r.ok || !r.dados) {
      if (!manterSeFalhar) setConf(null);
      setErro(r.mensagem);
      return false;
    }
    setConf(r.dados);
    setQuantos(POR_VEZ);
    return true;
  }

  async function escolherArquivo(lista: FileList | null) {
    const f = lista?.[0];
    setConf(null);
    setResultado(null);
    setPular(new Set());
    setFiltro("todas");
    setCorrecoes([]);
    setCorrigindo(null);
    if (!f) return setArquivo(null);
    if (f.size > LIMITE_DE_BYTES) {
      setArquivo(null);
      return setErro(TI.passo2.grande);
    }
    try {
      const a = { nome: f.name.slice(0, 200), conteudo: await lerComoBase64(f) };
      setArquivo(a);
      await conferir(a, tipo, { pulando: new Set(), correcoes: [] });
    } catch {
      setErro(TI.passo2.semLeitura);
    }
  }

  // As correções do painel são por célula (linha e coluna da planilha): continuam valendo com outro tipo ou outro mapa.
  function trocarTipo(t: TipoDeImportacao) {
    setTipo(t);
    setPular(new Set());
    setCorrigindo(null);
    if (arquivo) void conferir(arquivo, t, { pulando: new Set() });
  }

  function trocarColuna(campo: string, valor: string) {
    if (!conf || !arquivo) return;
    setCorrigindo(null);
    void conferir(arquivo, tipo, { mapa: { ...conf.mapa, [campo]: valor === "" ? null : Number(valor) } });
  }

  /** Muda a lista de correções e confere de novo; se o servidor recusar, a lista volta a ser a de antes. */
  async function mudarCorrecoes(nova: CorrecaoFeita[]) {
    if (!conf || !arquivo) return;
    const antes = correcoes;
    setCorrecoes(nova);
    const ok = await conferir(arquivo, tipo, { mapa: conf.mapa, correcoes: nova, manterSeFalhar: true });
    if (!ok) setCorrecoes(antes);
    else setCorrigindo(null);
  }

  async function baixarCorrigida() {
    if (!conf || !arquivo) return;
    setErro("");
    const r = await chamar<Conferencia>("/api/cadastros/importar/conferir", "POST", { tipo, arquivo, mapa: conf.mapa, pular: [...pular], correcoes: paraEnviar(correcoes), devolverTabela: true });
    if (!r.ok || !r.dados?.tabela) return setErro(r.mensagem);
    baixarCsv(nomeDaCorrigida(conf.arquivo), r.dados.tabela);
  }

  function alternarPulo(numero: number, marcado: boolean) {
    setResultado(null);
    setPular((antes) => {
      const novo = new Set(antes);
      if (marcado) novo.add(numero);
      else novo.delete(numero);
      return novo;
    });
  }

  const linhas = useMemo(() => (conf?.linhas ?? []).map((l) => ({ ...l, pulada: l.situacao !== "ja_existe" && pular.has(l.numero) })), [conf, pular]);
  const resumo = useMemo(() => resumir(linhas), [linhas]);
  const contagem: Record<Filtro, number> = { todas: resumo.total, ok: resumo.prontas, erro: resumo.erros, ja_existe: resumo.jaExistem, pulada: resumo.puladas };
  const filtradas = linhas.filter((l) => {
    if (filtro === "todas") return true;
    if (filtro === "pulada") return l.pulada;
    if (filtro === "ja_existe") return l.situacao === "ja_existe";
    return !l.pulada && l.situacao === filtro;
  });

  async function gravar() {
    if (!conf || !arquivo || enviando.current) return;
    enviando.current = true;
    setOcupado("gravando");
    setErro("");
    // As mesmas correções da conferência: o servidor aplica e confere tudo de novo antes de gravar.
    const r = await chamar<ResultadoDaGravacao>("/api/cadastros/importar/gravar", "POST", { tipo, arquivo, mapa: conf.mapa, pular: [...pular], correcoes: paraEnviar(correcoes), chave: conf.chave });
    enviando.current = false;
    setOcupado("");
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setResultado(r.dados);
  }

  function recomecar() {
    setArquivo(null);
    setConf(null);
    setResultado(null);
    setPular(new Set());
    setErro("");
    setCorrecoes([]);
    setCorrigindo(null);
    setVersaoDoCampo((v) => v + 1);
  }

  const pronto = podeGravar(resumo);

  /** As colunas da planilha como campos para corrigir (nome do cabeçalho, ajuda do campo e opções válidas). */
  const colunasParaCorrigir: ColunaParaCorrigir[] = useMemo(() => {
    if (!conf) return [];
    return conf.colunas.map((col) => {
      const campo = CAMPOS[conf.tipo].find((c) => conf.mapa[c.campo] === col.indice);
      return {
        indice: col.indice,
        rotulo: col.texto || TC.colunaSemNome(letraDaColuna(col.indice)),
        explicacao: campo?.explicacao ?? TC.semUso,
        exemplo: campo?.exemplo ?? TC.semUsoExemplo,
        opcoes: campo ? conf.opcoes[campo.campo] : undefined,
      };
    });
  }, [conf]);

  return (
    <div className="hor-tela imp-tela">
      <header className="hor-tela__cabeca">
        <h1>{TI.pagina.titulo}</h1>
        <p className="hor-tela__intro">{TI.pagina.intro}</p>
        <p className="imp-voltar">
          <Link href={CAMINHO_DO_TIPO[tipo]}>{TI.pagina.voltar[tipo]}</Link>
        </p>
      </header>
      <BotaoExemplos />

      <section className="hor-secao" aria-labelledby="imp-passo1">
        <h2 id="imp-passo1">{TI.passo1.titulo}</h2>
        <Grupo legenda={TI.passo1.tipo} explicacao={TI.passo1.tipoAjuda} exemplo={TI.passo1.tipoExemplo} className="hor-escolhas">
          {(["ingredientes", "produtos"] as const).map((t) => (
            <OpcaoDoGrupo key={t} tipo="radio" name="imp-tipo" className="hor-escolha" rotulo={TI.passo1.opcao[t]} checked={tipo === t} disabled={!!ocupado} onChange={() => trocarTipo(t)} />
          ))}
        </Grupo>
        <p className="hor-secao__intro">{TI.passo1.modelo}</p>
        <div className="hor-secao__botoes">
          {(["xlsx", "csv"] as const).map((f) => (
            <a key={f} className="erp-botao erp-botao--secundario" href={`/api/cadastros/importar/modelo?tipo=${tipo}&formato=${f}`} download>
              {f === "xlsx" ? TI.passo1.modeloXlsx : TI.passo1.modeloCsv}
            </a>
          ))}
        </div>
        <details className="imp-colunas">
          <summary>{TI.passo1.colunas}</summary>
          <ul>
            {CAMPOS[tipo].map((c) => (
              <li key={c.campo}>
                <strong>{c.rotulo}</strong> ({c.obrigatorio ? TI.passo1.obrigatoria : TI.passo1.opcional}): {c.explicacao}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="hor-secao" aria-labelledby="imp-passo2">
        <h2 id="imp-passo2">{TI.passo2.titulo}</h2>
        <Campo
          key={versaoDoCampo}
          type="file"
          rotulo={TI.passo2.arquivo}
          explicacao={TI.passo2.arquivoAjuda}
          exemplo={TI.passo2.arquivoExemplo}
          accept={EXTENSOES_ACEITAS}
          disabled={!!ocupado}
          onChange={(e) => void escolherArquivo(e.target.files)}
          className="imp-arquivo"
        />
        <div aria-live="polite" className="imp-situacao">
          {ocupado === "conferindo" && <p>{TI.passo2.conferindo}</p>}
          {erro && (
            <Aviso tipo="perigo" data-testid="erro-da-importacao">
              {erro}
            </Aviso>
          )}
        </div>
        {conf && conf.avisos.map((a) => <Aviso key={a} tipo="atencao">{a}</Aviso>)}
        {conf?.avisoDoTipo && conf.tipoSugerido && (
          <div className="imp-tipo-trocado" data-testid="aviso-tipo-trocado">
            <Aviso tipo="atencao">{conf.avisoDoTipo}</Aviso>
            <Botao onClick={() => trocarTipo(conf.tipoSugerido!)} disabled={!!ocupado}>
              {TI.tipoTrocado.trocar(TI.passo1.opcao[conf.tipoSugerido])}
            </Botao>
          </div>
        )}
      </section>

      {conf && (
        <section className="hor-secao" aria-labelledby="imp-passo3" data-testid="mapa-de-colunas">
          <h2 id="imp-passo3">{TI.passo3.titulo}</h2>
          <p className="hor-secao__intro">{TI.passo3.intro(conf.linhaDoCabecalho)}</p>
          {conf.faltamColunas.length > 0 && <Aviso tipo="atencao">{TI.passo3.faltam(conf.faltamColunas)}</Aviso>}
          <div className="imp-mapa">
            {CAMPOS[tipo].map((c) => (
              <Selecao
                key={c.campo}
                rotulo={c.obrigatorio ? TI.passo3.obrigatorio(c.rotulo) : c.rotulo}
                explicacao={c.explicacao}
                exemplo={c.exemplo}
                value={conf.mapa[c.campo] === null || conf.mapa[c.campo] === undefined ? "" : String(conf.mapa[c.campo])}
                disabled={!!ocupado}
                onChange={(e) => trocarColuna(c.campo, e.target.value)}
                opcoes={[{ valor: "", texto: TI.passo3.naoUsar }, ...conf.colunas.map((col) => ({ valor: String(col.indice), texto: TI.passo3.opcaoColuna(col.letra, col.texto) }))]}
              />
            ))}
          </div>
        </section>
      )}

      {conf && (
        <section className="hor-secao" aria-labelledby="imp-passo4" data-testid="resultado-da-conferencia">
          <div className="hor-secao__cabeca">
            <h2 id="imp-passo4">{TI.passo4.titulo}</h2>
            {resumo.total > resumo.prontas && (
              <Botao variante="secundario" onClick={() => baixarTexto(`erros-${conf.arquivo.replace(/\.[^.]+$/, "")}.csv`, relatorioDeErros({ linhas }))}>
                {TI.passo4.relatorio}
              </Botao>
            )}
          </div>
          <p className="imp-resumo" data-testid="resumo-da-conferencia">
            {textoDoResumo(resumo)}.
          </p>
          {!resultado && <CorrecoesFeitas lista={correcoes} ocupado={!!ocupado} aoDesfazer={(c) => void mudarCorrecoes(correcoes.filter((x) => x !== c))} aoBaixar={() => void baixarCorrigida()} />}
          <Grupo legenda={TI.passo4.filtro} explicacao={TI.passo4.filtroAjuda} exemplo={TI.passo4.filtroExemplo} className="hor-escolhas">
            {FILTROS.map((f) => (
              <OpcaoDoGrupo
                key={f}
                tipo="radio"
                name="imp-filtro"
                className="hor-escolha"
                rotulo={`${TI.passo4.filtros[f]} (${contagem[f].toLocaleString("pt-BR")})`}
                checked={filtro === f}
                onChange={() => {
                  setFiltro(f);
                  setQuantos(POR_VEZ);
                }}
              />
            ))}
          </Grupo>
          <Grupo legenda={TI.passo4.linhas} explicacao={TI.passo4.linhasAjuda} exemplo={TI.passo4.linhasExemplo} className="imp-grupo" ajudaNoTopo>
            {filtradas.length === 0 ? (
              <p className="hor-vazio">{TI.passo4.nenhuma}</p>
            ) : (
              <ul className="imp-linhas">
                {filtradas.slice(0, quantos).map((l) => {
                  const situacao = l.pulada ? "pulada" : l.situacao;
                  return (
                    <li key={l.numero} className={`imp-linha imp-linha--${situacao}`} data-testid={`linha-${l.numero}`}>
                      <div className="imp-linha__cabeca">
                        <span className="imp-linha__numero">{TI.passo4.linha(l.numero)}</span>
                        <Selo variante={SELO[situacao]}>{NOME_DA_SITUACAO[situacao]}</Selo>
                        <span className="imp-linha__nome">{l.nome}</span>
                      </div>
                      {l.resumo.length > 0 && l.situacao !== "ja_existe" && <p className="imp-linha__resumo">{l.resumo.join(", ")}</p>}
                      {l.situacao === "ja_existe" && <p className="imp-linha__resumo">{TI.passo4.jaExiste}</p>}
                      {l.problemas.length > 0 && (
                        <ul className="imp-linha__problemas">
                          {l.problemas.map((p, i) => (
                            <li key={i}>
                              {p.coluna && <strong>{p.coluna}: </strong>}
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
                      {l.situacao === "erro" && l.celulas && !resultado && (
                        <BotaoCorrigir numero={l.numero} aberto={corrigindo === l.numero} disabled={!!ocupado} onClick={() => setCorrigindo(corrigindo === l.numero ? null : l.numero)} />
                      )}
                      {corrigindo === l.numero && l.celulas && !resultado && (
                        <CorrigirLinha
                          key={`${l.numero}:${l.celulas.join("\u0001")}`}
                          numero={l.numero}
                          colunas={colunasParaCorrigir}
                          celulas={l.celulas}
                          comProblema={new Set(l.problemas.flatMap((p) => (p.indice === null ? [] : [p.indice])))}
                          ocupado={!!ocupado}
                          aoAplicar={(novas) => void mudarCorrecoes(juntarCorrecoes(correcoes, novas))}
                          aoCancelar={() => setCorrigindo(null)}
                        />
                      )}
                      {(l.situacao === "erro" || l.pulada) && (
                        <OpcaoDoGrupo
                          className="imp-linha__pular"
                          rotulo={TI.passo4.pular(l.numero)}
                          checked={l.pulada}
                          disabled={!!ocupado || !!resultado}
                          onChange={(e) => alternarPulo(l.numero, e.target.checked)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {filtradas.length > quantos && (
              <Botao variante="secundario" onClick={() => setQuantos((q) => q + POR_VEZ)}>
                {TI.passo4.mostrarMais(Math.min(POR_VEZ, filtradas.length - quantos))}
              </Botao>
            )}
          </Grupo>
        </section>
      )}

      {conf && (
        <section className="hor-secao" aria-labelledby="imp-passo5">
          <h2 id="imp-passo5">{TI.passo5.titulo}</h2>
          {resultado ? (
            <>
              <Aviso tipo="sucesso" data-testid="importacao-gravada">
                {resultado.repetida ? TI.passo5.repetida : TI.passo5.pronto(resultado, nomeDoTipo)}
              </Aviso>
              <div className="hor-secao__botoes">
                <Link className="erp-botao erp-botao--primario" href={CAMINHO_DO_TIPO[tipo]}>
                  {TI.passo5.ver[tipo]}
                </Link>
                <Botao variante="secundario" onClick={recomecar}>
                  {TI.passo5.outra}
                </Botao>
              </div>
            </>
          ) : (
            <>
              <p className="hor-secao__intro">{TI.passo5.explicacao}</p>
              {resumo.erros > 0 && <Aviso tipo="atencao">{TI.passo5.corrija(resumo.erros)}</Aviso>}
              {resumo.erros === 0 && resumo.prontas === 0 && <Aviso tipo="atencao">{TI.passo5.nadaPronto}</Aviso>}
              <div className="hor-secao__botoes">
                <Botao onClick={() => void gravar()} disabled={!pronto || !!ocupado} aria-busy={ocupado === "gravando"}>
                  {ocupado === "gravando" ? TI.passo5.gravando : TI.passo5.gravar(resumo.prontas, nomeDoTipo)}
                </Botao>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
