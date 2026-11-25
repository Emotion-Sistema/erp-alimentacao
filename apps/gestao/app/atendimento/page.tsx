import { paginaDeMesas } from "../mesas/PaginaDeMesas";

export const dynamic = "force-dynamic";

/** Mesas do atendimento: o mapa da loja; tocar numa mesa abre o pedido dela. */
export default function Pagina() {
  return paginaDeMesas("atendimento", "/atendimento");
}
