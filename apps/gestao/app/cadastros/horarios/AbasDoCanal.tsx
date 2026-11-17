"use client";

/** Abas Loja | Delivery (setas esquerda e direita trocam). O conteúdo da aba vem em `children`. */
import { useId, type ReactNode } from "react";
import { CANAIS, NOME_DO_CANAL, type Canal } from "@erp/dominio/horarios";
import { T } from "./textos";

export function AbasDoCanal({ canal, aoTrocar, children }: { canal: Canal; aoTrocar: (c: Canal) => void; children: ReactNode }) {
  const base = useId();
  return (
    <div className="hor-abas">
      <div role="tablist" aria-label={T.canais.abas} className="hor-abas__lista">
        {CANAIS.map((c, i) => (
          <button
            key={c}
            type="button"
            role="tab"
            id={`${base}-aba-${c}`}
            aria-selected={canal === c}
            aria-controls={`${base}-painel`}
            tabIndex={canal === c ? 0 : -1}
            className="hor-abas__aba"
            onClick={() => aoTrocar(c)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const outro = CANAIS[(i + 1) % CANAIS.length]!;
              aoTrocar(outro);
              document.getElementById(`${base}-aba-${outro}`)?.focus();
            }}
          >
            {NOME_DO_CANAL[c]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-painel`} aria-labelledby={`${base}-aba-${canal}`} className="hor-abas__painel">
        {children}
      </div>
    </div>
  );
}
