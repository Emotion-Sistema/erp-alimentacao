"use client";

import { useEffect, useState } from "react";

/**
 * Tela cheia (pedido do responsável, 18/11/2026): esconde a barra do navegador, no site e no
 * aplicativo instalado. Some quando o aparelho não permite (ex.: iPhone no navegador).
 */
export function BotaoTelaCheia({
  className = "tela-cheia",
}: {
  className?: string;
}) {
  const [pode, setPode] = useState(false);
  const [cheia, setCheia] = useState(false);

  useEffect(() => {
    setPode(Boolean(document.fullscreenEnabled));
    const mudou = () => setCheia(Boolean(document.fullscreenElement));
    mudou();
    document.addEventListener("fullscreenchange", mudou);
    return () => document.removeEventListener("fullscreenchange", mudou);
  }, []);

  if (!pode) return null;
  const texto = cheia ? "Sair da tela cheia" : "Tela cheia";
  return (
    <button
      type="button"
      className={className}
      aria-pressed={cheia}
      title={texto}
      onClick={() =>
        void (
          cheia
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen({
                navigationUI: "hide",
              })
        ).catch(() => {})
      }
    >
      <svg
        className="tela-cheia__icone"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        {cheia ? (
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        ) : (
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        )}
      </svg>
      <span className="tela-cheia__texto">{texto}</span>
    </button>
  );
}
