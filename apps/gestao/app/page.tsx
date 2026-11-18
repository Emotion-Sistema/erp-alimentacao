import { redirect } from "next/navigation";
import Link from "next/link";
import { Cartao } from "@erp/interface";
import { aplicativosDoCargo } from "@erp/dominio";
import { Casca } from "./Casca";
import { entradaDoAplicativo } from "./aplicativos-ui";
import { carregarAtor } from "./sessao-servidor";

export const dynamic = "force-dynamic";

/** Lançador: os aplicativos que o cargo ativo pode abrir. Com um só, vai direto para ele. */
export default async function Inicio() {
  const ator = await carregarAtor();
  const apps = aplicativosDoCargo(ator.cargoAtivo);
  if (apps.length === 1)
    redirect(entradaDoAplicativo(apps[0]!, ator.cargoAtivo));
  return (
    <Casca ator={ator}>
      <h1>Olá, {ator.nome}</h1>
      {apps.length === 0 ? (
        <Cartao>
          <p>
            Seu cargo ativo ainda não tem aplicativos. Peça ao gerente para
            ajustar seu cargo.
          </p>
        </Cartao>
      ) : (
        <ul className="erp-grade-ladrilhos" aria-label="Aplicativos">
          {apps.map((a) => (
            <li key={a.codigo}>
              {/* Link do Next (sem recarregar a página): a tela cheia continua ligada ao abrir o aplicativo. */}
              <Link
                href={entradaDoAplicativo(a, ator.cargoAtivo)}
                className="erp-ladrilho"
              >
                <span className="erp-ladrilho__titulo">{a.nome}</span>
                <span className="erp-ladrilho__descricao">{a.descricao}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Casca>
  );
}
