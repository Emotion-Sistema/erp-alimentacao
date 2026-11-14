import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { banco } from "@erp/banco";
import { atorDaSessao, pode } from "@erp/dominio";
import { Cartao } from "@erp/interface";
import { COOKIE_SESSAO } from "@/src/servidor/http";
import { BotaoSair } from "./BotaoSair";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  const ator = await atorDaSessao(banco(), token);
  if (!ator) redirect("/entrar");

  return (
    <main className="pagina">
      <Cartao>
        <h1>Olá, {ator.nome}</h1>
        <p>Cargo: {ator.cargos.join(", ") || "nenhum"}</p>
        <p>
          Os aplicativos de cada função chegam nas próximas etapas. O que você pode fazer
          depende do seu cargo e é conferido pelo servidor em cada ação.
        </p>
        {pode(ator.cargoAtivo, "usuarios.ver") && <p>Você pode ver a lista de funcionários.</p>}
        <BotaoSair />
      </Cartao>
    </main>
  );
}
