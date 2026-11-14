import Link from "next/link";
import { Cartao } from "@erp/interface";
import { aplicativoPorCodigo, itemDoCaminho, pode } from "@erp/dominio";
import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";

export const dynamic = "force-dynamic";

export default async function Resumo() {
  const ator = await carregarAtor();
  const app = aplicativoPorCodigo("gestao");
  const atalhos = app.itens.filter((i) => i.caminho !== "/gestao" && pode(ator.cargoAtivo, i.acao));
  return (
    <Casca ator={ator} app="gestao" exige={itemDoCaminho(app, "/gestao")!.acao}>
      <Cartao>
        <h1>Resumo</h1>
        <p>Atalhos para o que você cuida na gestão da casa.</p>
        <ul className="lista-simples">
          {atalhos.map((i) => (
            <li key={i.caminho}>
              <Link href={i.caminho} className="casca__link">
                {i.texto}
              </Link>
            </li>
          ))}
        </ul>
      </Cartao>
    </Casca>
  );
}
