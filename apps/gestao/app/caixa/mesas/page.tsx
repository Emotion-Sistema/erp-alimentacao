import { paginaDeMesas } from "../../mesas/PaginaDeMesas";

export const dynamic = "force-dynamic";

/** Mapa de mesas do caixa: o mesmo mapa do atendimento, sem lançar pedido. */
export default function Pagina() {
  return paginaDeMesas("caixa", "/caixa/mesas");
}
