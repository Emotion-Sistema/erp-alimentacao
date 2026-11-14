import { Ladrilho } from "@erp/interface";
import { Casca, LINKS } from "./casca";

export default function PaginaInicial() {
  return (
    <Casca atual="/">
      <h1>Casa Exemplo</h1>
      <ul className="erp-grade-ladrilhos">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Ladrilho href={l.href} titulo={l.texto} />
          </li>
        ))}
      </ul>
    </Casca>
  );
}
