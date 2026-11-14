import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";
import { Auditoria } from "./Auditoria";

export const dynamic = "force-dynamic";

export default async function PaginaAuditoria() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="gestao" exige="auditoria.ver">
      <Auditoria />
    </Casca>
  );
}
