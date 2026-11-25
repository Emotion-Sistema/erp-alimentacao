"use client";

import { useEffect, useState } from "react";
import type { Letra, Tema } from "@erp/dominio/preferencias";
import { chamar } from "./chamar";

/**
 * Preferências de tela da pessoa (decisão 0030): tema claro ou escuro (sol/lua no topo) e letra
 * normal ou grande (no menu da conta). A escolha fica guardada no usuário e vale em qualquer
 * aparelho. A tela muda na hora; se o servidor recusar, volta como estava.
 */
function usarPreferencia<T extends string>(chave: "tema" | "letra", padrao: T) {
  const [valor, setValor] = useState<T>(padrao);
  useEffect(() => {
    const atual = document.documentElement.dataset[chave];
    if (atual) setValor(atual as T);
  }, [chave]);
  async function trocar(novo: T) {
    const antes = valor;
    document.documentElement.dataset[chave] = novo;
    setValor(novo);
    const r = await chamar("/api/eu/preferencias", "POST", { [chave]: novo });
    if (!r.ok) {
      document.documentElement.dataset[chave] = antes;
      setValor(antes);
    }
  }
  return [valor, trocar] as const;
}

const SOL = "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z";
const LUA = "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z";

export function BotaoDoTema() {
  const [tema, trocar] = usarPreferencia<Tema>("tema", "claro");
  const escuro = tema === "escuro";
  return (
    <button
      type="button"
      className="casca__tema"
      aria-pressed={escuro}
      aria-label="Tema escuro"
      title={escuro ? "Voltar ao tema claro" : "Usar o tema escuro"}
      onClick={() => void trocar(escuro ? "claro" : "escuro")}
      data-testid="botao-tema"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={escuro ? SOL : LUA} />
      </svg>
    </button>
  );
}

export function BotaoDaLetra({ className }: { className?: string }) {
  const [letra, trocar] = usarPreferencia<Letra>("letra", "normal");
  const grande = letra === "grande";
  return (
    <button type="button" className={className} aria-pressed={grande} onClick={() => void trocar(grande ? "normal" : "grande")} data-testid="botao-letra">
      {grande ? "Letra normal" : "Letra grande"}
    </button>
  );
}
