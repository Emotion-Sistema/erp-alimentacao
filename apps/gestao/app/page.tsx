import { redirect } from "next/navigation";
import { Cartao, Ladrilho } from "@erp/interface";
import { aplicativosDoCargo } from "@erp/dominio";
import { Casca } from "./Casca";
import { entradaDoAplicativo } from "./aplicativos-ui";
import { carregarAtor } from "./sessao-servidor";
import { ListaDeAvisos } from "./ListaDeAvisos";

export const dynamic = "force-dynamic";

/** Lançador: os aplicativos que o cargo ativo pode abrir. Com um só, vai direto para ele. */
export default async function Inicio() {
  const ator = await carregarAtor();
  const apps = aplicativosDoCargo(ator.cargoAtivo);
  if (apps.length === 1) redirect(entradaDoAplicativo(apps[0]!, ator.cargoAtivo));
  return (
    <Casca ator={ator}>
      <h1>Olá, {ator.nome}</h1>
      {apps.length === 0 ? (
        <Cartao>
          <p>Seu cargo ativo ainda não tem aplicativos. Peça ao gerente para ajustar seu cargo.</p>
        </Cartao>
      ) : (
        <ul className="erp-grade-ladrilhos" aria-label="Aplicativos">
          {apps.map((a) => (
            <li key={a.codigo}>
              <Ladrilho href={entradaDoAplicativo(a, ator.cargoAtivo)} titulo={a.nome} descricao={a.descricao} />
            </li>
          ))}
        </ul>
      )}
      <h2>Avisos recentes</h2>
      <ListaDeAvisos />
    </Casca>
  );
}
