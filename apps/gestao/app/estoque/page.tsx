import { paginaDoItem } from "../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("estoque", "/estoque", "painel do estoque da cozinha com semáforo, entrada de mercadoria e contagem rápida.");
}
