"use client";

import { useId } from "react";
import type { SelectHTMLAttributes } from "react";

export type SelecaoProps = SelectHTMLAttributes<HTMLSelectElement> & {
  rotulo: string;
  opcoes: { valor: string; texto: string }[];
};

export function Selecao({
  rotulo,
  opcoes,
  id,
  className,
  ...resto
}: SelecaoProps) {
  const idGerado = useId();
  const idCampo = id ?? idGerado;
  return (
    <div className="erp-campo">
      <label className="erp-campo__rotulo" htmlFor={idCampo}>
        {rotulo}
      </label>
      <select
        id={idCampo}
        className={["erp-campo__entrada", className].filter(Boolean).join(" ")}
        {...resto}
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  );
}
