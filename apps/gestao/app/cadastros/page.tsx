import { AREAS_ESTOQUE, NOME_DA_AREA, NOME_DA_UNIDADE_BASE, UNIDADES_BASE, pode } from "@erp/dominio";
import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";
import { Ingredientes } from "./Ingredientes";

export const dynamic = "force-dynamic";

/** Ingredientes, unidades de compra e conversões (E07). Quem pode gerenciar vê os botões; o servidor confere de novo. */
export default async function PaginaIngredientes() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.ver">
      <Ingredientes
        areas={AREAS_ESTOQUE.map((a) => ({ valor: a, texto: NOME_DA_AREA[a] }))}
        unidadesBase={UNIDADES_BASE.map((u) => ({ valor: u, texto: NOME_DA_UNIDADE_BASE[u] }))}
        podeGerenciar={pode(ator.cargoAtivo, "cadastros.gerenciar")}
      />
    </Casca>
  );
}
