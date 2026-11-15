import { Cartao, Dado, FichaDeDados, Selo } from "@erp/interface";
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
        <FichaDeDados>
          <Dado rotulo="Nome" icone="pessoa">
            {ator.nome}
          </Dado>
          <Dado rotulo="Usuário">{ator.login}</Dado>
          <Dado rotulo="Cargos">
            {ator.cargos.length > 0 ? (
              <span className="erp-chips">
                {ator.cargos.map((c) => (
                  <Selo key={c} variante="info">
                    {nomeDoCargo(c)}
                  </Selo>
                ))}
              </span>
            ) : null}
          </Dado>
        </FichaDeDados>
      </Cartao>
      <MeuCodigo />
    </Casca>
  );
}
