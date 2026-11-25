import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { contextoDoEstoque } from "../contexto";
import { Compras } from "./Compras";

export const dynamic = "force-dynamic";

/**
 * Compras do estoque (E09 parte 2, decisão 0027): entrada de mercadoria, lista das entradas e saldo
 * inicial. A Casca confere `compras.gerenciar` (o item do menu); cada lançamento confere a área e,
 * para valores, `custos.ver` no servidor.
 */
export default async function PaginaDeCompras() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="estoque" exige="compras.gerenciar">
      <Compras contexto={contextoDoEstoque(ator)} />
    </Casca>
  );
}
