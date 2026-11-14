import { paginaDoItem } from "../../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("financeiro", "/financeiro/faturamento", "faturamento da empresa por dia e por forma de pagamento.");
}
