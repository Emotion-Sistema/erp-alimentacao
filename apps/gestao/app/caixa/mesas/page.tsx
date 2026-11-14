import { paginaDoItem } from "../../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("caixa", "/caixa/mesas", "mapa visual das mesas: livres e ocupadas; um toque na mesa abre as funções dela.");
}
