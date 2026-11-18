import { Cartao } from "@erp/interface";
import { FormularioEntrada } from "./FormularioEntrada";

export default function PaginaEntrar() {
  return (
    <main className="pagina-centro">
      <div className="entrada">
        <img
          src="/marca/logo-completa.webp"
          alt="E-MOTION: Coffee, Grill, Express"
          width={640}
          height={556}
          className="entrada__logo"
        />
        <Cartao>
          <h1>Entrar</h1>
          <p>Use o usuário e a senha que o gestor criou para você.</p>
          <FormularioEntrada />
        </Cartao>
      </div>
    </main>
  );
}
