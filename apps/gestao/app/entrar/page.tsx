import { Cartao } from "@erp/interface";
import { FormularioEntrada } from "./FormularioEntrada";

export default function PaginaEntrar() {
  return (
    <main className="pagina-centro">
      <Cartao>
        <h1>Entrar</h1>
        <p>Use o usuário e a senha que o gestor criou para você.</p>
        <FormularioEntrada />
      </Cartao>
    </main>
  );
}
