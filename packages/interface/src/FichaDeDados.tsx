import type { HTMLAttributes, ReactNode } from "react";
import { Icone, type NomeDeIcone } from "./Icone";

/**
 * Ficha de dados: lista de rótulo + valor (<dl>). O rótulo é pequeno e fica em cima; o valor
 * vem em destaque embaixo. Grade responsiva: 1 coluna no celular, 2 no tablet, 3 no computador.
 * `compacta` põe os dados lado a lado, em linha (avisos e comunicados).
 */
export function FichaDeDados({
  compacta,
  className,
  children,
  ...resto
}: { compacta?: boolean; children: ReactNode } & Omit<HTMLAttributes<HTMLDListElement>, "children">) {
  return (
    <dl className={["erp-ficha", compacta && "erp-ficha--compacta", className].filter(Boolean).join(" ")} {...resto}>
      {children}
    </dl>
  );
}

const semValor = (v: ReactNode) => v === null || v === undefined || v === false || (typeof v === "string" && v.trim() === "");

/**
 * Um dado da ficha. Sem valor, mostra "Não informado" discreto (nunca um texto solto).
 * `ocultarSeVazio` esconde o dado inteiro: serve para o que a pessoa nem pode ver.
 */
export function Dado({
  rotulo,
  icone,
  ocultarSeVazio,
  largo,
  children,
}: {
  rotulo: string;
  icone?: NomeDeIcone;
  ocultarSeVazio?: boolean;
  /** Ocupa a linha inteira (endereço, observação). */
  largo?: boolean;
  children?: ReactNode;
}) {
  const vazio = semValor(children);
  if (vazio && ocultarSeVazio) return null;
  return (
    <div className={["erp-dado", largo && "erp-dado--largo"].filter(Boolean).join(" ")}>
      <dt className="erp-dado__rotulo">{rotulo}</dt>
      <dd className={["erp-dado__valor", vazio && "erp-dado__valor--vazio"].filter(Boolean).join(" ")}>
        {icone && !vazio && <Icone nome={icone} />}
        {vazio ? "Não informado" : children}
      </dd>
    </div>
  );
}
