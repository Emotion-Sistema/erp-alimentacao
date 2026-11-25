"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { IconeDoMenu } from "@erp/dominio";
import { ICONE_INICIO, ICONES_DO_MENU } from "./icones-do-menu";

export type LinkDoMenu = {
  href: string;
  texto: string;
  icone: IconeDoMenu;
  /** Nome curto embaixo do ícone, quando o inteiro não cabe (o inteiro fica para o leitor de tela). */
  curto?: string;
};

/**
 * Trilho de ícones da casca, no computador e no tablet (decisão 0028). Só marca a tela atual; quem
 * decide o que aparece é o servidor (catálogo do cargo, decisão 0012). No celular some: vale a barra
 * de baixo. Muitas seções: o trilho rola para baixo sozinho, com a seção aberta à vista.
 */
export function Menu({
  links,
  outros,
}: {
  links: LinkDoMenu[];
  outros?: { href: string; texto: string }[];
}) {
  const atual = usePathname();
  const trilho = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trilho.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [atual]);

  return (
    <div className="trilho" ref={trilho}>
      <Link href="/" className="trilho__marca" aria-label="E-MOTION: início">
        <img src="/marca/simbolo.webp" alt="" width={256} height={158} />
      </Link>
      <nav aria-label="Menu" className="trilho__nav">
        {outros?.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="trilho__item trilho__item--apps"
          >
            <Desenho d={ICONE_INICIO} />
            <span className="trilho__texto">{l.texto}</span>
          </Link>
        ))}
        {outros && outros.length > 0 && (
          <span className="trilho__divisa" aria-hidden="true" />
        )}
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="trilho__item"
            aria-current={atual === l.href ? "page" : undefined}
            aria-label={l.curto ? l.texto : undefined}
            title={l.texto}
          >
            <Desenho d={ICONES_DO_MENU[l.icone]} />
            <span className="trilho__texto">{l.curto ?? l.texto}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Desenho({ d }: { d: string }) {
  return (
    <svg
      className="trilho__svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
