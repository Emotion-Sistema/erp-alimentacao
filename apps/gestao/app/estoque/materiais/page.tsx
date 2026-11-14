import { paginaDoItem } from "../../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("estoque", "/estoque/materiais", "compras de materiais (embalagem, limpeza e outros), com aprovação.");
}
