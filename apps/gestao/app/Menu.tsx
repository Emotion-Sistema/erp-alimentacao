"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export type LinkDoMenu = { href: string; texto: string };

/**
 * Menu da casca. Só marca a tela atual; quem decide o que aparece é o servidor.
 * Quando não cabe na tela (celular), a faixa rola de lado: as bordas esmaecem e aparecem setas
 * do lado em que há mais itens (pedido do responsável, 18/11/2026: "deixe mais claro que é possível rolar").
 */
export function Menu({
  links,
  outros,
}: {
  links: LinkDoMenu[];
  outros?: LinkDoMenu[];
}) {
  const atual = usePathname();
  const faixa = useRef<HTMLDivElement>(null);
  const [mais, setMais] = useState({ esquerda: false, direita: false });

  const medir = useCallback(() => {
    const f = faixa.current;
    if (!f) return;
    setMais({
      esquerda: f.scrollLeft > 4,
      direita: f.scrollLeft + f.clientWidth < f.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const f = faixa.current;
    if (!f) return;
    // A aba aberta fica à vista ao entrar na tela.
    f.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({
      block: "nearest",
      inline: "center",
    });
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(f);
    return () => obs.disconnect();
  }, [medir, atual]);

  const rolar = (lado: 1 | -1) =>
    faixa.current?.scrollBy({
      left: lado * faixa.current.clientWidth * 0.7,
      behavior: "smooth",
    });

  return (
    <nav
      aria-label="Menu"
      className="casca__menu"
      data-mais-esquerda={mais.esquerda || undefined}
      data-mais-direita={mais.direita || undefined}
    >
      <div className="casca__menu-faixa" ref={faixa} onScroll={medir}>
        {outros?.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="casca__link casca__link--apps"
          >
            {l.texto}
          </Link>
        ))}
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="casca__link"
            aria-current={atual === l.href ? "page" : undefined}
          >
            {l.texto}
          </Link>
        ))}
      </div>
      {/* Setas só para quem usa o toque ou o mouse; o teclado já percorre os itens com Tab. */}
      {mais.esquerda && (
        <button
          type="button"
          className="casca__rolar casca__rolar--esquerda"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => rolar(-1)}
        />
      )}
      {mais.direita && (
        <button
          type="button"
          className="casca__rolar casca__rolar--direita"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => rolar(1)}
        />
      )}
    </nav>
  );
}
