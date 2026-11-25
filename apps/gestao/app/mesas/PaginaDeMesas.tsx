import { banco } from "@erp/banco";
import { aplicativoPorCodigo, itemDoCaminho, mesasDaUnidade, pode } from "@erp/dominio";
import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";
import { MapaDeMesas } from "./MapaDeMesas";

/**
 * Página do mapa de mesas dentro de um aplicativo (Atendimento ou Caixa). A Casca confere a ação do
 * item no servidor; o botão "Abrir pedido" só vai para quem tem pedidos.lancar.
 */
export async function paginaDeMesas(codigoApp: string, caminho: string) {
  const ator = await carregarAtor();
  const item = itemDoCaminho(aplicativoPorCodigo(codigoApp), caminho);
  if (!item) throw new Error(`Item sem cadastro no catálogo: ${codigoApp} ${caminho}`);
  // Só quem pode ver a tela lê os números (a mesma ação da Casca, conferida de novo).
  const mesas = pode(ator.cargoAtivo, item.acao) ? await mesasDaUnidade(banco(), ator, item.acao) : [];
  return (
    <Casca ator={ator} app={codigoApp} exige={item.acao}>
      <div className="hor-tela mesas-tela">
        <h1>{item.texto}</h1>
        <p className="hor-tela__intro">Toque numa mesa para ver a situação dela e o que fazer.</p>
        <MapaDeMesas mesas={mesas} podeAbrirPedido={pode(ator.cargoAtivo, "pedidos.lancar")} podeNumerar={pode(ator.cargoAtivo, "mesas.numerar")} />
      </div>
    </Casca>
  );
}
