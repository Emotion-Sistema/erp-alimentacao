import type { ButtonHTMLAttributes } from "react";

export type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "perigo";
};

export function Botao({ variante = "primario", className, type = "button", ...resto }: BotaoProps) {
  const classes = ["erp-botao", `erp-botao--${variante}`, className].filter(Boolean).join(" ");
  return <button type={type} className={classes} {...resto} />;
}
