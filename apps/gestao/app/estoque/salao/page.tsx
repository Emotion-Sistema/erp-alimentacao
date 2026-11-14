import { paginaDoItem } from "../../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("estoque", "/estoque/salao", "painel do estoque do salão com semáforo e contagem rápida.");
}
