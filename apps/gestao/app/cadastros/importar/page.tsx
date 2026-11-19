import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { ImportarPlanilha } from "./ImportarPlanilha";

export const dynamic = "force-dynamic";

/**
 * Importar planilha (E07 parte 3, decisão 0020). Só quem tem `cadastros.gerenciar` entra; o
 * servidor confere de novo em cada chamada (conferir, gravar e baixar o modelo).
 */
export default async function PaginaImportar({ searchParams }: { searchParams: Promise<{ tipo?: string | string[] }> }) {
  const ator = await carregarAtor();
  const { tipo } = await searchParams;
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.gerenciar">
      <ImportarPlanilha tipoInicial={tipo === "ingredientes" ? "ingredientes" : "produtos"} />
    </Casca>
  );
}
