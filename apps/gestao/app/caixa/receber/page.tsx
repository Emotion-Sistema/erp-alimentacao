import { paginaDoItem } from "../../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("caixa", "/caixa/receber", "receber a conta em dinheiro, Pix ou cartão, dividir a conta e marcar Pago. Só o caixa marca Pago.");
}
