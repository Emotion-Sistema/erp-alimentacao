import type { HTMLAttributes } from "react";

export function Cartao({
  className,
  ...resto
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["erp-cartao", className].filter(Boolean).join(" ")}
      {...resto}
    />
  );
}
