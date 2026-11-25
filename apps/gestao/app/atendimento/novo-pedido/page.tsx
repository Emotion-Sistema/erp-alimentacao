import { mesaDaLoja, nomeDaMesa } from "@erp/dominio";
import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { NovoPedido } from "./NovoPedido";

export const dynamic = "force-dynamic";

/**
 * Novo pedido (atendimento). A Casca confere pedidos.lancar no servidor e a API do cardápio confere
 * de novo. A mesa vem do mapa (?mesa=N); número que não é mesa da loja vira "Sem mesa".
 * A foto do produto aparece para quem lança pedido (a rota da foto aceita pedidos.lancar, 25/11/2026).
 */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ mesa?: string | string[] }> }) {
  const ator = await carregarAtor();
  const bruto = (await searchParams).mesa;
  const texto = typeof bruto === "string" ? bruto : "";
  const m = /^[1-9][0-9]{0,2}$/.test(texto) ? mesaDaLoja(Number(texto)) : undefined;
  return (
    <Casca ator={ator} app="atendimento" exige="pedidos.lancar">
      <NovoPedido
        mesa={m ? { numero: m.numero, nome: nomeDaMesa(m) } : null}
        podeVerFoto
      />
    </Casca>
  );
}
