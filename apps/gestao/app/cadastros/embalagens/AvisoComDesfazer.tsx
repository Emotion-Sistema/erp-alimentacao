"use client";

/**
 * Aviso que some sozinho (com "Desfazer" quando dá). Fica numa região sempre presente com
 * role="status", para o leitor de tela anunciar. O tempo para enquanto o mouse ou o foco estão nele.
 */
import { useEffect, useRef, useState } from "react";
import { Icone } from "@erp/interface";
import { T } from "./textos";

export type AvisoRapido = {
  id: number;
  texto: string;
  tipo?: "sucesso" | "perigo";
  desfazer?: () => void;
  /** Leva o foco ao "Desfazer" (quando o que tinha o foco sumiu da tela). */
  focar?: boolean;
};

const DURACAO_MS = 8000;

export function AvisoComDesfazer({ aviso, aoFechar }: { aviso: AvisoRapido | null; aoFechar: () => void }) {
  const [pausado, setPausado] = useState(false);
  const fechar = useRef(aoFechar);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (aviso?.focar) botao.current?.focus();
  }, [aviso]);
  useEffect(() => {
    fechar.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    if (!aviso || pausado) return;
    const t = window.setTimeout(() => fechar.current(), DURACAO_MS);
    return () => window.clearTimeout(t);
  }, [aviso, pausado]);

  return (
    <div className="emb-toast__regiao" role="status" aria-live="polite" data-testid="aviso-rapido">
      {aviso && (
        <div
          key={aviso.id}
          className={["emb-toast", aviso.tipo === "perigo" && "emb-toast--perigo"].filter(Boolean).join(" ")}
          onMouseEnter={() => setPausado(true)}
          onMouseLeave={() => setPausado(false)}
          onFocus={() => setPausado(true)}
          onBlur={() => setPausado(false)}
        >
          <Icone nome={aviso.tipo === "perigo" ? "erro" : "ok"} />
          <span className="emb-toast__texto">{aviso.texto}</span>
          {aviso.desfazer && (
            <button ref={botao} type="button" className="emb-toast__botao" onClick={() => aviso.desfazer?.()}>
              <Icone nome="desfazer" />
              {T.avisos.desfazer}
            </button>
          )}
          <button type="button" className="emb-toast__fechar" aria-label={T.avisos.fecharAviso} onClick={aoFechar}>
            <Icone nome="fechar" />
          </button>
        </div>
      )}
    </div>
  );
}
