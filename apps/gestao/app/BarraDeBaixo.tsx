"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconeDoMenu } from "@erp/dominio";
import { ICONE_INICIO, ICONE_MAIS, ICONES_DO_MENU } from "./icones-do-menu";

export type ItemDaBarra = { href: string; texto: string; icone: IconeDoMenu };

/**
 * Barra de baixo do celular (decisão 0019, adendo de 18/11/2026; pedido do responsável:
 * "B no atendimento e A nos outros"). Até 4 seções à vista, com ícone e nome, no alcance do
 * polegar; "Mais" abre uma gaveta com o resto e a troca de aplicativo. Com ação principal
 * (Atendimento), um botão redondo grande fica no meio. No computador não aparece (o menu de
 * cima continua). O teclado aberto esconde a barra (CSS), para não cobrir o campo.
 */
export function BarraDeBaixo({
  naBarra,
  noMais,
  outrosApps,
  principal,
}: {
  naBarra: ItemDaBarra[];
  noMais: ItemDaBarra[];
  outrosApps: { href: string; texto: string }[];
  principal?: { href: string; texto: string };
}) {
  const atual = usePathname();
  const temMais = noMais.length > 0 || outrosApps.length > 0;
  const atualNoMais = noMais.find((i) => i.href === atual);
  const tocar = () => navigator.vibrate?.(8);
  const fecharMais = () =>
    document.getElementById("barra-mais")?.hidePopover?.();

  const item = (i: ItemDaBarra) => (
    <Link
      key={i.href}
      href={i.href}
      className="barra__item"
      aria-current={atual === i.href ? "page" : undefined}
      onClick={tocar}
    >
      <span className="barra__icone" aria-hidden="true">
        <Desenho d={ICONES_DO_MENU[i.icone]} />
      </span>
      <span className="barra__texto">{i.texto}</span>
    </Link>
  );
  const mais = temMais ? (
    <button
      key="mais"
      type="button"
      className="barra__item"
      popoverTarget="barra-mais"
      aria-current={atualNoMais ? "page" : undefined}
      onClick={tocar}
    >
      <span className="barra__icone" aria-hidden="true">
        <Desenho
          d={atualNoMais ? ICONES_DO_MENU[atualNoMais.icone] : ICONE_MAIS}
        />
      </span>
      <span className="barra__texto">
        {atualNoMais ? atualNoMais.texto : "Mais"}
      </span>
    </button>
  ) : null;

  // Com ação principal: metade dos espaços de cada lado do botão grande.
  const espacos = [...naBarra.map(item), ...(mais ? [mais] : [])];
  const metade = Math.ceil(espacos.length / 2);
  return (
    <div
      className={`barra${principal ? " barra--com-principal" : ""}`}
      data-itens={espacos.length}
    >
      <nav aria-label="Menu" className="barra__nav">
        {principal ? (
          <>
            {espacos.slice(0, metade)}
            <span className="barra__vao" aria-hidden="true" />
            {espacos.slice(metade)}
          </>
        ) : (
          espacos
        )}
      </nav>
      {principal && (
        <Link
          href={principal.href}
          className="barra__principal"
          onClick={() => navigator.vibrate?.(15)}
        >
          <span className="barra__principal-botao" aria-hidden="true">
            <Desenho d="M12 5v14M5 12h14" />
          </span>
          <span className="barra__principal-texto">{principal.texto}</span>
        </Link>
      )}
      {temMais && (
        <div
          id="barra-mais"
          popover="auto"
          className="barra__mais"
          aria-label="Mais"
        >
          {noMais.length > 0 && (
            <>
              <p className="barra__mais-titulo">Mais deste aplicativo</p>
              <div className="barra__mais-grade">
                {noMais.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    className="barra__mais-item"
                    aria-current={atual === i.href ? "page" : undefined}
                    onClick={fecharMais}
                  >
                    <Desenho d={ICONES_DO_MENU[i.icone]} />
                    <span>{i.texto}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
          {outrosApps.length > 0 && (
            <>
              <p className="barra__mais-titulo">Trocar de aplicativo</p>
              <div className="barra__mais-apps">
                {outrosApps.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="barra__mais-app"
                    onClick={fecharMais}
                  >
                    {a.texto}
                  </Link>
                ))}
                <Link
                  href="/"
                  className="barra__mais-app barra__mais-app--inicio"
                  onClick={fecharMais}
                >
                  <Desenho d={ICONE_INICIO} />
                  Todos os aplicativos
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Desenho({ d }: { d: string }) {
  return (
    <svg
      className="barra__svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
