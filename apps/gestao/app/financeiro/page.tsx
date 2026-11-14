import { paginaDoItem } from "../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("financeiro", "/financeiro", "contas a pagar e a receber da empresa.");
}
