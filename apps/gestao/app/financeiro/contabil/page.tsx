import { paginaDoItem } from "../../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("financeiro", "/financeiro/contabil", "pacote do mês para a contabilidade, com versão e controle de envio.");
}
