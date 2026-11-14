import { paginaDoItem } from "../../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("financeiro", "/financeiro/fechamentos", "conferir os fechamentos do caixa e as diferenças apontadas.");
}
