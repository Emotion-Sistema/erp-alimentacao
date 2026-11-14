import { paginaDoItem } from "../../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("atendimento", "/atendimento/pedidos", "ver os pedidos que você lançou, os avisos de pronto e confirmar que pegou.");
}
