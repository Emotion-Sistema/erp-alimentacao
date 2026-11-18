import { Ladrilho } from "@erp/interface";
import { Casca, LINKS } from "./casca";

export default function PaginaInicial() {
  return (
    <Casca atual="/">
      <section className="erp-capa" aria-labelledby="capa-titulo">
        <p className="erp-capa__sobretitulo">Coffee, grill e express</p>
        <h1 id="capa-titulo">E-MOTION</h1>
        <p className="erp-capa__texto">
          Café, grelhados e lanches rápidos, feitos na hora.
        </p>
        <img
          src="/marca/simbolo.webp"
          alt=""
          width={256}
          height={158}
          className="erp-capa__simbolo"
        />
      </section>
      <ul className="erp-grade-ladrilhos" aria-label="Páginas">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Ladrilho href={l.href} titulo={l.texto} />
          </li>
        ))}
      </ul>
    </Casca>
  );
}
