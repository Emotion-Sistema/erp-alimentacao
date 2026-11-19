import { pode } from "@erp/dominio";
import { Casca } from "../../../Casca";
import { carregarAtor } from "../../../sessao-servidor";
import { FichaAberta } from "../FichaAberta";

export const dynamic = "force-dynamic";

/**
 * Uma ficha técnica aberta. A Casca confere `cadastros.ver` no servidor antes de qualquer dado.
 * `podeGerenciar` e `podeVerCusto` só escondem botões e colunas: a API tira o custo de quem não tem
 * `custos.ver` e recusa a gravação de quem não tem `cadastros.gerenciar`.
 */
export default async function PaginaDaFicha({ params }: { params: Promise<{ id: string }> }) {
  const [ator, { id }] = await Promise.all([carregarAtor(), params]);
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.ver">
      <FichaAberta id={id} podeGerenciar={pode(ator.cargoAtivo, "cadastros.gerenciar")} podeVerCusto={pode(ator.cargoAtivo, "custos.ver")} />
    </Casca>
  );
}
