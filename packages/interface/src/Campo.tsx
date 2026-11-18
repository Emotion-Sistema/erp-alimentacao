"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";

export type CampoProps = InputHTMLAttributes<HTMLInputElement> & {
  rotulo: string;
  erro?: string;
};

export function Campo({ rotulo, erro, id, className, ...resto }: CampoProps) {
  const idGerado = useId();
  const idCampo = id ?? idGerado;
  const idErro = `${idCampo}-erro`;
  return (
    <div
      className={["erp-campo", erro ? "erp-campo--erro" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <label className="erp-campo__rotulo" htmlFor={idCampo}>
        {rotulo}
      </label>
      <input
        id={idCampo}
        className={["erp-campo__entrada", className].filter(Boolean).join(" ")}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : undefined}
        {...resto}
      />
      {erro ? (
        <p id={idErro} className="erp-campo__erro">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
