"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type LinkDoMenu = { href: string; texto: string };

/** Menu da casca. Só marca a tela atual; quem decide o que aparece é o servidor. */
export function Menu({
  links,
  outros,
}: {
  links: LinkDoMenu[];
  outros?: LinkDoMenu[];
}) {
  const atual = usePathname();
  return (
    <nav aria-label="Menu" className="casca__menu">
      <div className="casca__menu-faixa">
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
    </nav>
  );
}
