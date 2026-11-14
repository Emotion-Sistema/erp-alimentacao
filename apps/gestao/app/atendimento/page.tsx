import { paginaDoItem } from "../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("atendimento", "/atendimento", "abrir mesa, lançar os itens do pedido e ver a situação de cada item.");
}
