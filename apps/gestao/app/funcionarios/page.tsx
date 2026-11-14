import { CARGOS, CARGOS_COM_SEGUNDO_FATOR, NOME_DO_CARGO, pode } from "@erp/dominio";
import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";
import { Funcionarios } from "./Funcionarios";

export const dynamic = "force-dynamic";

export default async function PaginaFuncionarios() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="gestao" exige="usuarios.ver">
      <Funcionarios
        cargos={CARGOS.map((c) => ({ valor: c, texto: NOME_DO_CARGO[c] }))}
        cargosComSegundoFator={[...CARGOS_COM_SEGUNDO_FATOR]}
        verSegundoFator={!!ator.cargoAtivo && (CARGOS_COM_SEGUNDO_FATOR as readonly string[]).includes(ator.cargoAtivo)}
        podeGerenciar={pode(ator.cargoAtivo, "usuarios.gerenciar")}
        podeDesbloquear={pode(ator.cargoAtivo, "codigos.desbloquear")}
      />
    </Casca>
  );
}
