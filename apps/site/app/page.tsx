import { Cartao } from "@erp/interface";

const secoes = ["Cardápio", "Para empresas", "Contato"];

export default function PaginaInicial() {
  return (
    <main className="erp-pagina">
      <h1>Casa Exemplo</h1>
      {secoes.map((titulo) => (
        <Cartao key={titulo} aria-label={titulo}>
          <h2>{titulo}</h2>
          <p>conteúdo provisório</p>
        </Cartao>
      ))}
    </main>
  );
}
