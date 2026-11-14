import { paginaDoItem } from "../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem("entregas", "/entregas", "ver as entregas atribuídas a você, o mapa e o código de confirmação.");
}
