import { paginaDoItem } from "../../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("estoque", "/estoque/compras", "lista de compras do estoque, sugerida pelo que está acabando, para aprovação.");
}
