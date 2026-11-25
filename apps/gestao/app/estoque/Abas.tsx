"use client";

/** Abas das telas do estoque (mesmo jeito das de Fichas): setas do teclado trocam de aba. */
import { useId, type ReactNode } from "react";

export function Abas<T extends string>({ rotulo, abas, atual, aoTrocar, children }: { rotulo: string; abas: { valor: T; texto: string }[]; atual: T; aoTrocar: (a: T) => void; children: ReactNode }) {
  const base = useId();
  return (
    <div className="hor-abas">
      <div role="tablist" aria-label={rotulo} className="hor-abas__lista">
        {abas.map((a, i) => (
          <button
            key={a.valor}
            type="button"
            role="tab"
            id={`${base}-aba-${a.valor}`}
            aria-selected={atual === a.valor}
            aria-controls={`${base}-painel`}
            tabIndex={atual === a.valor ? 0 : -1}
            className="hor-abas__aba"
            onClick={() => aoTrocar(a.valor)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const outra = abas[(i + (e.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length]!;
              aoTrocar(outra.valor);
              document.getElementById(`${base}-aba-${outra.valor}`)?.focus();
            }}
          >
            {a.texto}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-painel`} aria-labelledby={`${base}-aba-${atual}`} className="hor-abas__painel est-painel">
        {children}
      </div>
    </div>
  );
}
