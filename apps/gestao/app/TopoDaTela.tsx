"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Topo da casca no visual Balcão (decisão 0028, igual ao protótipo A): à esquerda o nome da tela
 * aberta e, embaixo, o aplicativo e quem está usando; à direita o cargo e o relógio.
 * Quando o título da página (h1) é o mesmo nome da tela, ele fica só para o leitor de tela, para não
 * aparecer duas vezes.
 */
export function TituloDaTela({
  secoes,
  app,
  pessoa,
  cargo,
}: {
  secoes: { href: string; texto: string }[];
  app?: string;
  pessoa: string;
  cargo: string;
}) {
  const atual = usePathname();
  const secao = secoes.find((s) => s.href === atual);
  const titulo = secao?.texto ?? app ?? "Início";

  useEffect(() => {
    const h1 = document.querySelector<HTMLElement>(".casca__conteudo h1");
    if (!h1) return;
    const igual =
      h1.textContent?.trim().toLocaleLowerCase("pt-BR") ===
      titulo.toLocaleLowerCase("pt-BR");
    h1.classList.toggle("titulo-no-topo", igual);
    return () => h1.classList.remove("titulo-no-topo");
  }, [titulo, atual]);

  return (
    <div className="casca__titulo">
      <p className="casca__tela" data-testid="titulo-da-tela">
        {titulo}
      </p>
      <div className="casca__quem">
        {app && secao && (
          <span className="casca__app-nome" data-testid="nome-do-app">
            {app}
          </span>
        )}
        <strong data-testid="nome-da-pessoa">{pessoa}</strong>
        <span className="casca__cargo">
          <span className="casca__quem-rotulo">Cargo ativo: </span>
          <strong data-testid="cargo-ativo">{cargo}</strong>
        </span>
      </div>
    </div>
  );
}

/** Relógio do topo (hora e dia), como no protótipo. Atualiza a cada 20 segundos. */
export function Relogio() {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);
  if (!agora) return <span className="relogio" aria-hidden="true" />;
  const hora = agora.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dia = agora
    .toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .replace(/\./g, "");
  return (
    <span className="relogio">
      <b>{hora}</b>
      <small>{dia}</small>
    </span>
  );
}
