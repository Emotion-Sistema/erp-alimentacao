import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
} from "react";

/**
 * Tabela simples. Em tela larga é uma tabela comum; em tela estreita (celular)
 * cada linha vira um bloco, com o nome da coluna antes do valor (use `rotulo` na Celula).
 */
export function Tabela({
  className,
  ...resto
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="erp-tabela-rolagem">
      <table
        className={["erp-tabela", className].filter(Boolean).join(" ")}
        {...resto}
      />
    </div>
  );
}

export type CelulaProps = Omit<
  TdHTMLAttributes<HTMLTableCellElement>,
  "data-rotulo"
> & {
  /** Nome da coluna, mostrado antes do valor quando a tela é estreita. */
  rotulo?: string;
};

export function Celula({ rotulo, ...resto }: CelulaProps) {
  return <td data-rotulo={rotulo} {...resto} />;
}

/** Marca de situação com texto (nunca só cor). */
export function Etiqueta({
  tipo = "neutro",
  className,
  ...resto
}: HTMLAttributes<HTMLSpanElement> & {
  tipo?: "neutro" | "sucesso" | "atencao" | "perigo";
}) {
  return (
    <span
      className={["erp-etiqueta", `erp-etiqueta--${tipo}`, className]
        .filter(Boolean)
        .join(" ")}
      {...resto}
    />
  );
}
