import type { HTMLAttributes } from "react";

export type AvisoProps = HTMLAttributes<HTMLDivElement> & {
  tipo?: "info" | "sucesso" | "atencao" | "perigo";
};

export function Aviso({ tipo = "info", className, ...resto }: AvisoProps) {
  return (
    <div
      role={tipo === "perigo" ? "alert" : undefined}
      className={["erp-aviso", `erp-aviso--${tipo}`, className]
        .filter(Boolean)
        .join(" ")}
      {...resto}
    />
  );
}
