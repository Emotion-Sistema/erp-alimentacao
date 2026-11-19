"use client";

/**
 * Uma linha da lista de fichas: nome (abre a ficha), tipo, selo Completa ou Incompleta (com
 * quantas pendências), versão e, só para quem vê custo (o servidor manda nulo para os outros),
 * o custo por porção e quanto ele é do preço na loja e no delivery. Passou do limite: selo de
 * alerta com ícone e texto (nunca só a cor).
 */
import Link from "next/link";
import { Selo } from "@erp/interface";
import type { ResumoDaFicha } from "@erp/dominio";
import { NOME_DO_TIPO_DE_FICHA } from "@erp/dominio/fichas";
import { textoDoCusto, textoDoPb } from "./contas";
import { TF } from "./textos";

const C = TF.cartao;

/** Selo de situação: Completa / Incompleta (n pendências). */
export function SeloDaSituacao({ resumo }: { resumo: ResumoDaFicha }) {
  return resumo.completa ? (
    <Selo variante="sucesso" icone="ok" data-testid="situacao-da-ficha">
      {C.completa}
    </Selo>
  ) : (
    <Selo variante="alerta" icone="alerta" data-testid="situacao-da-ficha">
      {C.incompleta(resumo.pendencias)}
    </Selo>
  );
}

/** "16,4% do preço" com alerta quando passa do limite. */
export function PercentualDoPreco({ rotulo, pb, limite, testid }: { rotulo: string; pb: number | null; limite: number; testid: string }) {
  if (pb === null) return null;
  const acima = pb > limite;
  return (
    <Selo variante={acima ? "perigo" : "neutro"} icone={acima ? "alerta" : undefined} data-testid={testid} data-acima={acima ? "sim" : "nao"}>
      {rotulo}: {C.doPreco(textoDoPb(pb))}
      {acima && <span>, {C.acimaDoLimite(textoDoPb(limite))}</span>}
    </Selo>
  );
}

/** Custo de uma porção (ou de 1 un do preparo); preparo em g ou ml não mostra (o centavo por grama não diz nada). */
export function CustoDaFicha({ resumo }: { resumo: ResumoDaFicha }) {
  if (resumo.custoCentavos === null) return null;
  if (resumo.tipo === "preparo" && resumo.unidadeRendimento !== "un") return null;
  return (
    <p className="fichas-custo" data-testid="custo-da-ficha">
      <span className="fichas-custo__rotulo">{resumo.tipo === "preparo" ? C.custoUnidade("unidade") : C.custoPorcao}</span>{" "}
      <span className="fichas-custo__valor">{textoDoCusto(resumo.custoCentavos)}</span>
      {resumo.custoParcial && (
        <Selo variante="alerta" className="fichas-custo__parcial" title={C.parcialExplicacao}>
          {C.parcial}
        </Selo>
      )}
    </p>
  );
}

export function CartaoDaFicha({ resumo, limiteCustoPb }: { resumo: ResumoDaFicha; limiteCustoPb: number }) {
  const r = resumo;
  const esmaecida = !r.ativo || r.foraDoCardapio;
  return (
    <article className={["hor-cat", "fichas-cartao", esmaecida && "hor-cat--inativa"].filter(Boolean).join(" ")} data-testid={`ficha-${r.nome}`}>
      <header className="hor-cat__cabeca">
        <h3 className="hor-cat__nome">
          <Link href={`/cadastros/fichas/${r.id}`} aria-label={C.abrir(r.nome)}>
            {r.nome}
          </Link>
        </h3>
      </header>
      <div className="hor-cat__selos">
        <Selo variante="info">{NOME_DO_TIPO_DE_FICHA[r.tipo]}</Selo>
        <SeloDaSituacao resumo={r} />
        <Selo data-testid="versao-da-ficha">{r.versao === null ? C.semReceita : C.versao(r.versao)}</Selo>
        {!r.ativo && <Selo variante="alerta">{C.desativada}</Selo>}
        {r.ativo && r.foraDoCardapio && <Selo variante="alerta">{C.foraDoCardapio}</Selo>}
      </div>
      <CustoDaFicha resumo={r} />
      {(r.custoPbLoja !== null || r.custoPbDelivery !== null) && (
        <div className="hor-cat__selos">
          <PercentualDoPreco rotulo={C.loja} pb={r.custoPbLoja} limite={limiteCustoPb} testid="custo-loja" />
          <PercentualDoPreco rotulo={C.delivery} pb={r.custoPbDelivery} limite={limiteCustoPb} testid="custo-delivery" />
        </div>
      )}
    </article>
  );
}
