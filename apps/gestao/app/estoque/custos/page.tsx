import { paginaDoItem } from "../../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("estoque", "/estoque/custos", "custos da sua área, calculados das fichas técnicas e do estoque.");
}
