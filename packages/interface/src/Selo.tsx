import type { HTMLAttributes } from "react";
import { Icone, type NomeDeIcone } from "./Icone";

export type VarianteDoSelo =
  | "neutro"
  | "info"
  | "sucesso"
  | "alerta"
  | "perigo"
  | "cozinha"
  | "bebidas_salao"
  | "cafeteria"
  | "sorvete";

/** Variante do selo de uma área de estoque: cor própria, mas o nome da área sempre aparece. */
export function varianteDaArea(area: string): VarianteDoSelo {
  return area === "cozinha" ||
    area === "bebidas_salao" ||
    area === "cafeteria" ||
    area === "sorvete"
    ? area
    : "neutro";
}

/** Pílula com texto (nunca só cor). O ícone é opcional e só enfeita. */
export function Selo({
  variante = "neutro",
  icone,
  className,
  children,
  ...resto
}: HTMLAttributes<HTMLSpanElement> & {
  variante?: VarianteDoSelo;
  icone?: NomeDeIcone;
}) {
  return (
    <span
      className={["erp-selo", `erp-selo--${variante}`, className]
        .filter(Boolean)
        .join(" ")}
      {...resto}
    >
      {icone && <Icone nome={icone} />}
      {children}
    </span>
  );
}
