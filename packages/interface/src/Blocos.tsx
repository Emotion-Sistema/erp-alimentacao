import type { HTMLAttributes, ReactNode } from "react";
import { Icone, type NomeDeIcone } from "./Icone";

export type TipoDeFaixa = "sucesso" | "alerta" | "perigo" | "info";
const ICONE_DA_FAIXA: Record<TipoDeFaixa, NomeDeIcone> = { sucesso: "ok", alerta: "alerta", perigo: "erro", info: "info" };

/** Faixa de situação com ícone e texto (nunca só cor). */
export function Faixa({ tipo, className, children, ...resto }: HTMLAttributes<HTMLDivElement> & { tipo: TipoDeFaixa }) {
  return (
    <div className={["erp-faixa", `erp-faixa--${tipo}`, className].filter(Boolean).join(" ")} {...resto}>
      <Icone nome={ICONE_DA_FAIXA[tipo]} />
      <span>{children}</span>
    </div>
  );
}

/** Lista de avisos ou erros: um item por linha, cada um com ícone e texto claro. */
export function ListaComIcone({ tipo, itens, ...resto }: { tipo: "alerta" | "perigo"; itens: string[] } & Omit<HTMLAttributes<HTMLUListElement>, "children">) {
  if (itens.length === 0) return null;
  return (
    <ul className={["erp-problemas", `erp-problemas--${tipo}`].join(" ")} {...resto}>
      {itens.map((t) => (
        <li key={t}>
          <Icone nome={tipo === "perigo" ? "erro" : "alerta"} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bloco de confirmação em destaque (ex.: a conta de uma embalagem). `vazio` é a versão que ainda pede algo. */
export function BlocoDeConfirmacao({ vazio, children, ...resto }: HTMLAttributes<HTMLParagraphElement> & { vazio?: boolean; children: ReactNode }) {
  return (
    <p className={["erp-confirmacao", vazio && "erp-confirmacao--vazio"].filter(Boolean).join(" ")} {...resto}>
      <Icone nome={vazio ? "info" : "ok"} />
      <span>{children}</span>
    </p>
  );
}

/** O que a pessoa escreveu, em citação discreta. */
export function Citacao({ rotulo = "Você escreveu", children }: { rotulo?: string; children: ReactNode }) {
  return (
    <blockquote className="erp-citacao">
      <span className="erp-citacao__rotulo">{rotulo}</span>
      <span className="erp-citacao__texto">{children}</span>
    </blockquote>
  );
}
