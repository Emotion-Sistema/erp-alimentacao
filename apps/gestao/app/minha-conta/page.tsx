import { Cartao } from "@erp/interface";
import { Casca, nomeDoCargo } from "../Casca";
import { carregarAtor } from "../sessao-servidor";
import { MeuCodigo } from "./MeuCodigo";

export const dynamic = "force-dynamic";

export default async function PaginaMinhaConta() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator}>
      <h1>Minha conta</h1>
      <Cartao>
        <p>Nome: {ator.nome}</p>
        <p>Usuário: {ator.login}</p>
        <p>Cargos: {ator.cargos.map(nomeDoCargo).join(", ") || "nenhum"}</p>
      </Cartao>
      <MeuCodigo />
    </Casca>
  );
}
