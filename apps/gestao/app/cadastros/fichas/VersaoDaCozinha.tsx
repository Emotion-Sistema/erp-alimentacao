"use client";

/**
 * Versão para a cozinha: a receita limpa, para ler no tablet ou imprimir (`@media print` em
 * fichas.css deixa só este bloco no papel). Ingredientes, modo de preparo, tempo, equipamentos e a
 * foto do produto, se houver. Nada de custo aqui. "Fazer 1x / 2x / 3x / outro" multiplica as
 * quantidades com `escalarQuantidade` (fração exata, nada de float); a medida caseira fica a de 1x.
 */
import { useState } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import type { FichaCompleta } from "@erp/dominio";
import { escalarQuantidade } from "@erp/dominio/fichas";
import { BotaoExemplos, Campo, Grupo, OpcaoDoGrupo } from "../../Campo";
import { enderecoDaFoto } from "../produtos/FotoDoProduto";
import { quantidadeAmigavel, vezesDoTexto } from "./contas";
import { TF } from "./textos";

const K = TF.cozinha;
const PRONTAS = ["1", "2", "3"] as const;

export function VersaoDaCozinha({ ficha, fotoId, aoFechar }: { ficha: FichaCompleta; fotoId: number | null; aoFechar: () => void }) {
  const [escolha, setEscolha] = useState<(typeof PRONTAS)[number] | "outro">("1");
  const [outro, setOutro] = useState("");
  const v = ficha.versao;
  const nome = ficha.resumo.nome;
  const vezes = escolha === "outro" ? vezesDoTexto(outro) : escolha;
  const vezesTexto = vezes ?? "1";
  const escalar = (q: string) => escalarQuantidade(q, vezesTexto);
  const unidadeDoRende = ficha.resumo.tipo === "preparo" ? ficha.resumo.unidadeRendimento : null;

  return (
    <section className="fichas-cozinha" aria-labelledby="ficha-cozinha-titulo" data-testid="versao-cozinha">
      <div className="fichas-cozinha__barra">
        <Botao variante="secundario" onClick={aoFechar}>
          <Icone nome="desfazer" />
          {K.fechar}
        </Botao>
        <Botao onClick={() => window.print()}>
          <Icone nome="documento" />
          {K.imprimir}
        </Botao>
      </div>
      <div className="fichas-cozinha__controles">
        <BotaoExemplos />
        <Grupo legenda={K.vezes} explicacao={K.vezesAjuda} exemplo={K.vezesExemplo} className="fichas-cozinha__vezes">
          <div className="fichas-cozinha__opcoes">
            {PRONTAS.map((p) => (
              <OpcaoDoGrupo key={p} tipo="radio" name="vezes" rotulo={`${p}x`} className="cadastros__opcao" checked={escolha === p} onChange={() => setEscolha(p)} />
            ))}
            <OpcaoDoGrupo tipo="radio" name="vezes" rotulo={K.outro} className="cadastros__opcao" checked={escolha === "outro"} onChange={() => setEscolha("outro")} />
          </div>
        </Grupo>
        {escolha === "outro" && (
          <Campo rotulo={K.outroCampo} explicacao={K.outroAjuda} exemplo={K.outroExemplo} value={outro} inputMode="decimal" maxLength={6} autoComplete="off" onChange={(e) => setOutro(e.target.value)} />
        )}
        <div aria-live="polite">{escolha === "outro" && outro.trim() && vezes === null && <Aviso tipo="perigo">{K.outroInvalido}</Aviso>}</div>
      </div>

      <article className="fichas-cozinha__folha">
        <header className="fichas-cozinha__cabeca">
          {fotoId !== null && <img src={enderecoDaFoto(fotoId)} alt={K.foto(nome)} className="fichas-cozinha__foto" width={160} height={120} data-testid="foto-cozinha" />}
          <div>
            <h2 id="ficha-cozinha-titulo">{K.titulo(nome)}</h2>
            <p className="fichas-cozinha__vezes-escolhidas" data-testid="vezes-escolhidas">
              {K.receitaPara(vezesTexto.replace(".", ","))}
            </p>
          </div>
        </header>
        {!ficha.resumo.completa && <p className="fichas-cozinha__alerta">{K.pendente}</p>}
        <dl className="fichas-cozinha__dados">
          {v?.rende && (
            <div>
              <dt>{K.rende}</dt>
              <dd data-testid="rende-cozinha">{unidadeDoRende ? quantidadeAmigavel(escalar(v.rende), unidadeDoRende) : TF.ficha.porcoes(escalar(v.rende).replace(".", ","))}</dd>
            </div>
          )}
          {v?.tempoMin != null && (
            <div>
              <dt>{K.tempo}</dt>
              <dd>{TF.ficha.minutos(v.tempoMin)}</dd>
            </div>
          )}
        </dl>
        <h3>{K.ingredientes}</h3>
        <ul className="fichas-cozinha__itens" data-testid="itens-cozinha">
          {(v?.itens ?? []).map((i) => (
            <li key={i.ordem} data-testid={`cozinha-${i.nome}`}>
              <span className="fichas-cozinha__qtd">{i.quantidade === null ? TF.ficha.semQuantidade : quantidadeAmigavel(escalar(i.quantidade), i.unidade)}</span>{" "}
              <span>{i.nome}</span>
              {i.opcional && <span className="fichas-cozinha__nota"> ({TF.ficha.opcional.toLowerCase()})</span>}
              {i.medidaCaseira && <span className="fichas-cozinha__nota"> ({K.medida(i.medidaCaseira)})</span>}
            </li>
          ))}
        </ul>
        {(v?.etapas.length ?? 0) > 0 && (
          <>
            <h3>{K.modo}</h3>
            <ol className="fichas-cozinha__etapas">
              {v!.etapas.map((e, k) => (
                <li key={k}>
                  {e.texto}
                  {e.minutos !== null && <span className="fichas-cozinha__nota"> ({TF.ficha.minutos(e.minutos)})</span>}
                </li>
              ))}
            </ol>
          </>
        )}
        {(v?.equipamentos.length ?? 0) > 0 && (
          <>
            <h3>{K.equipamentos}</h3>
            <ul className="fichas-cozinha__lista">
              {v!.equipamentos.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </>
        )}
        {v?.observacoes && (
          <>
            <h3>{K.observacoes}</h3>
            <p className="fichas-cozinha__obs">{v.observacoes}</p>
          </>
        )}
      </article>
    </section>
  );
}
