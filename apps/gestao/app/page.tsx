import { Cartao } from "@erp/interface";
import { Casca } from "./Casca";
import { carregarAtor } from "./sessao-servidor";
import { ListaDeAvisos } from "./ListaDeAvisos";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator}>
      <Cartao>
        <h1>Olá, {ator.nome}</h1>
        <p>
          Os aplicativos de cada função chegam nas próximas etapas. O que você vê no menu depende do seu
          cargo ativo.
        </p>
      </Cartao>
      <h2>Avisos recentes</h2>
      <ListaDeAvisos />
    </Casca>
  );
}
