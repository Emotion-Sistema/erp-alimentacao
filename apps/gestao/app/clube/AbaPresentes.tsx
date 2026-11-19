"use client";

/**
 * Aba "Presentes": três cartões (boas-vindas, aniversário, sentimos sua falta). Cada um: ligado ou
 * desligado, o benefício (desconto em %, desconto em R$, produto grátis ou pontos) com o valor certo
 * para ele, validade em dias, dias sem pedir (só no "sentimos sua falta") e a mensagem. A frase
 * "O membro ganha ..." sai de `textoDoBeneficio`. Cada cartão grava só o seu presente em
 * POST /api/clube/presentes, mandando só o campo do benefício escolhido (o outro vai nulo).
 */
import { useState } from "react";
import { Aviso, Botao, Selo } from "@erp/interface";
import {
  BENEFICIOS,
  NOME_DO_BENEFICIO,
  NOME_DO_PRESENTE,
  PONTOS_DO_PREMIO_MAXIMO,
  percentualDoTexto,
  textoDoBeneficio,
  textoDoPercentual,
  TETO_MAXIMO_CENTAVOS,
  type Beneficio,
  type Presente,
} from "@erp/dominio/clube";
import { centavosDoTexto } from "@erp/dominio/produtos";
import { chamar } from "../chamar";
import { AreaDeTexto, Campo, Marcador, Selecao } from "../Campo";
import { inteiroDoTexto, type PainelDoClube } from "./contas";
import { opcoesDeProduto } from "./JanelaDoPremio";
import type { PropsDaAba } from "./TelaDoClube";
import { reaisDoCampo, TC } from "./textos";

const MENSAGEM_MAXIMA = 140;

export function AbaPresentes({ painel, podeGerenciar, avisar, recarregar }: PropsDaAba) {
  return (
    <section className="hor-secao" aria-label={TC.abas.presentes} data-testid="aba-presentes">
      <p className="hor-secao__intro">{TC.presentes.intro}</p>
      <ul className="hor-cats clube__lista">
        {painel.presentes.map((p) => (
          <li key={`${p.tipo}-${JSON.stringify(p)}`} className="hor-cats__item">
            <CartaoDoPresente presente={p} produtos={painel.produtos} podeGerenciar={podeGerenciar} avisar={avisar} recarregar={recarregar} />
          </li>
        ))}
      </ul>
    </section>
  );
}

type Valor = { erro: string } | { valor: number | null; produtoId: number | null };

function CartaoDoPresente({
  presente: p,
  produtos,
  podeGerenciar,
  avisar,
  recarregar,
}: {
  presente: Presente;
  produtos: PainelDoClube["produtos"];
} & Pick<PropsDaAba, "podeGerenciar" | "avisar" | "recarregar">) {
  const nome = NOME_DO_PRESENTE[p.tipo];
  const curto = nome.replace(/ \(.*\)$/, "");
  const [ligado, setLigado] = useState(p.ligado);
  const [beneficio, setBeneficio] = useState<Beneficio>(p.beneficio);
  const [pct, setPct] = useState(p.beneficio === "desconto_percentual" && p.valor ? textoDoPercentual(p.valor).replace("%", "") : "");
  const [reais, setReais] = useState(p.beneficio === "desconto_valor" && p.valor ? reaisDoCampo(p.valor) : "");
  const [pontos, setPontos] = useState(p.beneficio === "pontos" && p.valor ? String(p.valor) : "");
  const [produto, setProduto] = useState(p.produtoId ? String(p.produtoId) : "");
  const [validade, setValidade] = useState(String(p.validadeDias));
  const [dias, setDias] = useState(p.diasSemPedir === null ? "" : String(p.diasSemPedir));
  const [mensagem, setMensagem] = useState(p.mensagem ?? "");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const leitura = !podeGerenciar;

  function valorDoBeneficio(): Valor {
    switch (beneficio) {
      case "desconto_percentual": {
        const v = percentualDoTexto(pct);
        return v === null || v < 1 ? { erro: TC.presentes.erroPercentual } : { valor: v, produtoId: null };
      }
      case "desconto_valor": {
        const v = centavosDoTexto(reais);
        return v === null || v < 1 || v > TETO_MAXIMO_CENTAVOS ? { erro: TC.presentes.erroReais } : { valor: v, produtoId: null };
      }
      case "pontos": {
        const v = inteiroDoTexto(pontos, 1, PONTOS_DO_PREMIO_MAXIMO);
        return v === null ? { erro: TC.presentes.erroPontos } : { valor: v, produtoId: null };
      }
      case "produto":
        return produto ? { valor: null, produtoId: Number(produto) } : { erro: TC.presentes.erroProduto };
    }
  }

  const v = valorDoBeneficio();
  const nomeDoProduto = produto ? (produtos.find((x) => String(x.id) === produto)?.nome ?? null) : null;
  const frase = "erro" in v ? (beneficio === "produto" ? textoDoBeneficio({ beneficio, valor: null }) : "...") : textoDoBeneficio({ beneficio, valor: v.valor }, nomeDoProduto);

  async function salvar() {
    setErro("");
    if ("erro" in v) return setErro(v.erro);
    const validadeDias = inteiroDoTexto(validade, 1, 90);
    if (validadeDias === null) return setErro(TC.presentes.erroValidade);
    let diasSemPedir: number | undefined;
    if (p.tipo === "sentimos_falta") {
      const d = inteiroDoTexto(dias, 7, 365);
      if (d === null) return setErro(TC.presentes.erroDias);
      diasSemPedir = d;
    }
    setGravando(true);
    const r = await chamar<Presente>("/api/clube/presentes", "POST", {
      tipo: p.tipo,
      ligado,
      beneficio,
      valor: v.valor,
      produtoId: v.produtoId,
      validadeDias,
      mensagem: mensagem.trim(),
      ...(diasSemPedir === undefined ? {} : { diasSemPedir }),
    });
    setGravando(false);
    if (!r.ok) return setErro(r.mensagem);
    avisar(TC.presentes.salvo(curto));
    await recarregar();
  }

  return (
    <article className={["hor-cat", "clube__presente", !p.ligado && "clube__presente--desligado"].filter(Boolean).join(" ")} data-testid={`presente-${p.tipo}`} aria-labelledby={`presente-${p.tipo}-titulo`}>
      <header className="hor-cat__cabeca">
        <h3 className="hor-cat__nome" id={`presente-${p.tipo}-titulo`}>
          {nome}
        </h3>
        <Selo variante={p.ligado ? "sucesso" : "neutro"} data-testid="situacao-do-presente">
          {p.ligado ? TC.presentes.ligadoSelo : TC.presentes.desligadoSelo}
        </Selo>
      </header>
      <div className="hor-form">
        <Marcador rotulo={TC.presentes.ligado} explicacao={TC.presentes.ligadoAjuda} exemplo={TC.presentes.ligadoExemplo} className="hor-chave" checked={ligado} disabled={leitura} onChange={(e) => setLigado(e.target.checked)} />
        <Selecao
          rotulo={TC.presentes.beneficio}
          explicacao={TC.presentes.beneficioAjuda}
          exemplo={TC.presentes.beneficioExemplo}
          opcoes={BENEFICIOS.map((b) => ({ valor: b, texto: NOME_DO_BENEFICIO[b] }))}
          value={beneficio}
          disabled={leitura}
          onChange={(e) => setBeneficio(e.target.value as Beneficio)}
        />
        {beneficio === "desconto_percentual" && (
          <Campo rotulo={TC.presentes.percentual} explicacao={TC.presentes.percentualAjuda} exemplo={TC.presentes.percentualExemplo} value={pct} inputMode="decimal" maxLength={6} autoComplete="off" className="linha-editavel__numero" disabled={leitura} onChange={(e) => setPct(e.target.value)} />
        )}
        {beneficio === "desconto_valor" && (
          <Campo rotulo={TC.presentes.reais} explicacao={TC.presentes.reaisAjuda} exemplo={TC.presentes.reaisExemplo} value={reais} inputMode="decimal" maxLength={12} autoComplete="off" className="linha-editavel__dinheiro" disabled={leitura} onChange={(e) => setReais(e.target.value)} />
        )}
        {beneficio === "pontos" && (
          <Campo rotulo={TC.presentes.pontos} explicacao={TC.presentes.pontosAjuda} exemplo={TC.presentes.pontosExemplo} value={pontos} inputMode="numeric" maxLength={7} autoComplete="off" className="linha-editavel__numero" disabled={leitura} onChange={(e) => setPontos(e.target.value)} />
        )}
        {beneficio === "produto" && (
          <Selecao
            rotulo={TC.presentes.produto}
            explicacao={TC.presentes.produtoAjuda}
            exemplo={TC.presentes.produtoExemplo}
            opcoes={opcoesDeProduto(produtos, p.produtoId, TC.presentes.escolhaProduto)}
            value={produto}
            disabled={leitura}
            onChange={(e) => setProduto(e.target.value)}
          />
        )}
        <div className="linha-editavel__numeros">
          <Campo rotulo={TC.presentes.validade} explicacao={TC.presentes.validadeAjuda} exemplo={TC.presentes.validadeExemplo} value={validade} inputMode="numeric" maxLength={2} autoComplete="off" className="linha-editavel__numero" disabled={leitura} onChange={(e) => setValidade(e.target.value)} />
          {p.tipo === "sentimos_falta" && (
            <Campo rotulo={TC.presentes.dias} explicacao={TC.presentes.diasAjuda} exemplo={TC.presentes.diasExemplo} value={dias} inputMode="numeric" maxLength={3} autoComplete="off" className="linha-editavel__numero" disabled={leitura} onChange={(e) => setDias(e.target.value)} />
          )}
        </div>
        <div className="clube__com-contador">
          <AreaDeTexto rotulo={TC.presentes.mensagem} explicacao={TC.presentes.mensagemAjuda} exemplo={TC.presentes.mensagemExemplo} value={mensagem} maxLength={MENSAGEM_MAXIMA} rows={2} disabled={leitura} onChange={(e) => setMensagem(e.target.value)} />
          <p className="clube__contador" aria-live="polite">
            {TC.presentes.contador(mensagem.length, MENSAGEM_MAXIMA)}
          </p>
        </div>
        <p className="clube__previa-frase" data-testid="frase-do-presente">
          {TC.presentes.vaiGanhar}: {frase}
        </p>
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        {podeGerenciar && (
          <div className="hor-secao__botoes">
            <Botao onClick={() => void salvar()} disabled={gravando}>
              {TC.presentes.salvar(curto)}
            </Botao>
          </div>
        )}
      </div>
    </article>
  );
}
