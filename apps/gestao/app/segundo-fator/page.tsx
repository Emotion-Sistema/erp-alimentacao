import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { banco } from "@erp/banco";
import { atorDaSessao } from "@erp/dominio";
import { Cartao } from "@erp/interface";
import { COOKIE_SESSAO } from "@/src/servidor/http";
import { ConfigurarSegundoFator } from "./ConfigurarSegundoFator";

export const dynamic = "force-dynamic";

export default async function PaginaSegundoFator() {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  const ator = await atorDaSessao(banco(), token);
  if (!ator) redirect("/entrar");
  if (ator.segundoFator !== "pendente") redirect("/");
  return (
    <main className="pagina-centro">
      <Cartao>
        <h1>Confirmar que é você</h1>
        <ConfigurarSegundoFator jaConfigurado={ator.segundoFatorConfigurado} />
      </Cartao>
    </main>
  );
}
