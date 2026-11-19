"use client";

/**
 * Janela "Importar fichas" (só quem gerencia; o servidor confere `cadastros.gerenciar` de novo).
 * Dois passos em POST /api/fichas/importar, como a importação de cadastros:
 *  1. "Conferir" (`aplicar: false`): o servidor lê a planilha e diz o que faria com cada ficha
 *     (criar, versão nova, sem mudança, erro), os erros por linha e os ingredientes que faltam.
 *     Nada é gravado.
 *  2. "Gravar" (`aplicar: true`): manda as escolhas ("criar os ingredientes que faltam", "gravar as
 *     boas e deixar de fora as com erro") e `versoes` (sempre; "tipo:nome" -> versão atual vista na conferência): se
 *     outra pessoa mudou uma ficha nesse meio tempo, o servidor recusa em vez de gravar por cima.
 * O arquivo vai em base64 dentro do JSON. O modelo .csv é montado aqui mesmo (dados inventados).
 */
import { useState } from "react";
import { Aviso, Botao, Icone, Selo, type VarianteDoSelo } from "@erp/interface";
import type { FichaDaPlanilha, ResultadoDaImportacao } from "@erp/dominio";
import { chamar } from "../../chamar";
import { BotaoExemplos, Campo, Marcador } from "../../Campo";
import { JanelaModal, usarPedirFechar } from "../JanelaModal";
import { TF } from "./textos";

const T = TF.importar;

const SELO: Record<FichaDaPlanilha["acao"], VarianteDoSelo> = { criar: "sucesso", nova_versao: "info", sem_mudanca: "neutro", erro: "perigo" };

export const COLUNAS_DO_MODELO = [
  "ficha",
  "tipo",
  "rende",
  "unidade do rendimento",
  "porcao",
  "unidade da porcao",
  "tempo (min)",
  "validade (dias)",
  "ingrediente",
  "quantidade",
  "unidade",
  "opcional",
  "medida caseira",
  "observacao",
  "pendencia",
  "etapa",
] as const;

/** Modelo com 3 linhas inventadas: um preparo em 2 linhas e um produto que usa o preparo. */
export function modeloCsv(): string {
  const linhas = [
    COLUNAS_DO_MODELO.join(";"),
    "Molho de exemplo;preparo;1;kg;;;15;3;Maionese de exemplo;800;g;;;;;Misturar tudo",
    "Molho de exemplo;preparo;;;;;;;Alho de exemplo;20;g;;1 colher;;;Guardar na geladeira",
    "Lanche de exemplo;produto;1;;180;g;12;;Molho de exemplo;30;g;sim;;sem molho se pedirem;Confirmar o peso;Montar o lanche",
  ];
  // BOM no começo: o Excel abre os acentos certos.
  return `\ufeff${linhas.join("\r\n")}\r\n`;
}

function lerComoBase64(arquivo: File): Promise<string> {
  return new Promise((resolver, falhar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result).replace(/^data:[^,]*,/, ""));
    leitor.onerror = () => falhar(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

function baixarModelo() {
  const url = URL.createObjectURL(new Blob([modeloCsv()], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-fichas-tecnicas.csv";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BotaoFechar({ texto }: { texto: string }) {
  const pedirFechar = usarPedirFechar();
  return (
    <Botao variante="secundario" onClick={pedirFechar}>
      {texto}
    </Botao>
  );
}

export function ImportarFichas({ aoFechar, aoGravado }: { aoFechar: () => void; aoGravado: (r: ResultadoDaImportacao) => void }) {
  const [arquivo, setArquivo] = useState<{ nome: string; conteudo: string } | null>(null);
  const [conferido, setConferido] = useState<ResultadoDaImportacao | null>(null);
  const [criarIngredientes, setCriarIngredientes] = useState(false);
  const [pularComErro, setPularComErro] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState<"" | "lendo" | "conferindo" | "gravando">("");

  async function escolher(lista: FileList | null) {
    setErro("");
    setConferido(null);
    const f = lista?.[0];
    if (!f) return setArquivo(null);
    setOcupado("lendo");
    try {
      setArquivo({ nome: f.name, conteudo: await lerComoBase64(f) });
    } catch {
      setErro(T.naoLeu);
    }
    setOcupado("");
  }

  async function enviar(aplicar: boolean) {
    if (!arquivo) return setErro(T.faltaArquivo);
    setErro("");
    setOcupado(aplicar ? "gravando" : "conferindo");
    const versoes: Record<string, number | null> = {};
    for (const f of conferido?.fichas ?? []) versoes[`${f.tipo}:${f.nome}`] = f.versaoAtual;
    const r = await chamar<ResultadoDaImportacao>("/api/fichas/importar", "POST", {
      arquivo,
      aplicar,
      criarIngredientes,
      pularComErro,
      // Sempre: o servidor recusa a ficha que mudou depois da conferência (chave "tipo:nome").
      versoes,
    });
    setOcupado("");
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    if (aplicar && r.dados.aplicado) return aoGravado(r.dados);
    // Tudo já igual à planilha: o servidor não grava nada (aplicado falso) e diz "sem mudança" em cada uma.
    const nadaMudou = r.dados.erros.length === 0 && r.dados.fichas.some((f) => f.acao === "sem_mudanca") && r.dados.fichas.every((f) => f.acao === "sem_mudanca" || (pularComErro && f.acao === "erro"));
    if (aplicar && nadaMudou) return aoGravado(r.dados);
    setConferido(r.dados);
    if (aplicar) setErro(T.naoGravou);
  }

  const c = conferido;
  const comErro = c?.fichas.filter((f) => f.acao === "erro").length ?? 0;
  const boas = c?.fichas.filter((f) => f.acao === "criar" || f.acao === "nova_versao").length ?? 0;
  const faltaIngrediente = (c?.ingredientesNovos.length ?? 0) > 0;
  const podeGravar = !!c && c.erros.length === 0 && boas > 0 && (comErro === 0 || pularComErro);

  return (
    <JanelaModal titulo={T.titulo} sujo={!!arquivo} aoMexer={() => undefined} aoFechar={aoFechar} data-testid="importar-fichas">
      <BotaoExemplos />
      <div className="fichas-importar">
        <p className="hor-secao__intro">{T.intro}</p>
        <details className="fichas-importar__colunas" data-testid="colunas-do-modelo">
          <summary>{T.colunasTitulo}</summary>
          <p>{T.colunasIntro}</p>
          <ul>
            {COLUNAS_DO_MODELO.map((col) => (
              <li key={col}>
                <strong>{col}</strong>: {T.colunas[col]}
              </li>
            ))}
          </ul>
        </details>
        <p>
          <Botao variante="secundario" onClick={baixarModelo}>
            <Icone nome="documento" />
            {T.baixarModelo}
          </Botao>
        </p>
        <Campo
          type="file"
          rotulo={T.arquivo}
          explicacao={T.arquivoAjuda}
          exemplo={T.arquivoExemplo}
          accept=".csv,.xlsx,.txt"
          disabled={!!ocupado}
          onChange={(e) => void escolher(e.target.files)}
        />
        {/* As duas escolhas valem para conferir e para gravar; criar ingredientes muda a conferência. */}
        <Marcador
          rotulo={T.criarIngredientes}
          explicacao={T.criarIngredientesAjuda}
          exemplo={T.criarIngredientesExemplo}
          checked={criarIngredientes}
          onChange={(e) => {
            setCriarIngredientes(e.target.checked);
            if (conferido) {
              setConferido(null);
              setErro(T.confiraDeNovo);
            }
          }}
        />
        <Marcador rotulo={T.pularComErro} explicacao={T.pularComErroAjuda} exemplo={T.pularComErroExemplo} checked={pularComErro} onChange={(e) => setPularComErro(e.target.checked)} />
        <div className="cadastros__botoes">
          <Botao variante={c ? "secundario" : "primario"} disabled={!arquivo || !!ocupado} onClick={() => void enviar(false)}>
            {ocupado === "conferindo" ? T.conferindo : c ? T.conferirDeNovo : T.conferir}
          </Botao>
        </div>
        <div aria-live="polite">
          {erro && <Aviso tipo="perigo">{erro}</Aviso>}
          {c && c.erros.map((e) => <Aviso key={e} tipo="perigo">{e}</Aviso>)}
        </div>

        {c && c.fichas.length > 0 && (
          <section className="fichas-importar__resultado" aria-labelledby="imp-fichas-resultado" data-testid="resultado-da-conferencia">
            <h3 id="imp-fichas-resultado">{T.resultado(c.fichas.length, comErro)}</h3>
            <ul className="fichas-lista">
              {c.fichas.map((f) => (
                <li key={`${f.tipo}-${f.nome}-${f.linha}`} className="fichas-importar__ficha" data-testid={`importar-${f.nome}`}>
                  <div className="fichas-lista__item">
                    <span className="fichas-lista__nome">{f.nome}</span>
                    <Selo>{f.tipo === "preparo" ? TF.ficha.preparo : T.produto}</Selo>
                    <Selo variante={SELO[f.acao]} icone={f.acao === "erro" ? "erro" : f.acao === "sem_mudanca" ? undefined : "ok"} data-testid="acao">
                      {T.acao[f.acao]}
                    </Selo>
                    <span className="linha-editavel__detalhe">{T.resumo(f.linha, f.itens, f.pendencias)}</span>
                  </div>
                  {f.erros.length > 0 && (
                    <ul className="fichas-pendencias__lista">
                      {f.erros.map((e, k) => (
                        <li key={k}>
                          <Icone nome="erro" />
                          <span>{T.naLinha(e.linha, e.texto)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            {faltaIngrediente && (
              <div className="fichas-importar__novos" data-testid="ingredientes-novos">
                <p>{T.novosIntro}</p>
                <ul>
                  {c.ingredientesNovos.map((n) => (
                    <li key={n.nome}>
                      {n.nome} ({n.unidade})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!podeGravar && <p className="hor-secao__intro" data-testid="por-que-nao-grava">{boas === 0 ? T.nadaParaGravar : T.corrijaOuPule}</p>}
          </section>
        )}
        <div className="cadastros__botoes">
          {c && (
            <Botao disabled={!podeGravar || !!ocupado} onClick={() => void enviar(true)}>
              {ocupado === "gravando" ? T.gravando : T.gravar(boas)}
            </Botao>
          )}
          <BotaoFechar texto={T.cancelar} />
        </div>
      </div>
    </JanelaModal>
  );
}
