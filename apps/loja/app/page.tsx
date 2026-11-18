import { Ladrilho } from "@erp/interface";
import { Casca, LINKS } from "./casca";

export default function PaginaInicial() {
  return (
    <Casca atual="/">
      <section className="erp-capa" aria-labelledby="capa-titulo">
        <p className="erp-capa__sobretitulo">E-MOTION delivery</p>
        <h1 id="capa-titulo">Pedidos online</h1>
        <p className="erp-capa__texto">
          O delivery próprio chega nas etapas E26 a E28.
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
