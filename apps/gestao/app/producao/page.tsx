import { aplicativoPorCodigo, itemDoCaminho } from "@erp/dominio";
import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";

export const dynamic = "force-dynamic";

/**
 * Produção: visão geral (igual à tela Produção do protótipo A, decisão 0028). Três colunas com a cor
 * forte de cada etapa. Os pedidos ainda não existem (etapa E13): as colunas ficam vazias e dizem
 * isso. Nenhum ticket, número ou relógio inventado. A Casca confere producao.ver no servidor.
 */
const ETAPAS = [
  { chave: "fila", nome: "Na fila", legenda: "esperando começar", icone: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2" },
  {
    chave: "preparo",
    nome: "Em preparo",
    legenda: "a cozinha está fazendo",
    icone: "M12 3c2 3 5 4.5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.5 1.5 1.5 2.5 3 2.5-1-2-1-4.5 0-7z",
  },
  { chave: "pronto", nome: "Pronto", legenda: "chamar o atendente", icone: "M5 12l5 5 9-10" },
] as const;

function Desenho({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="prod-icone">
      <path d={d} />
    </svg>
  );
}

export default async function Pagina() {
  const ator = await carregarAtor();
  const item = itemDoCaminho(aplicativoPorCodigo("producao"), "/producao")!;
  return (
    <Casca ator={ator} app="producao" exige={item.acao}>
      <div className="prod">
        <h1>{item.texto}</h1>
        <p className="hor-tela__intro">Os pedidos chegam sozinhos e andam de uma coluna para a outra: na fila, em preparo e pronto.</p>
        <div className="prod-legenda" role="list" aria-label="Cores das etapas">
          {ETAPAS.map((e) => (
            <span key={e.chave} role="listitem" className={`prod-etapa prod-etapa--${e.chave}`}>
              <Desenho d={e.icone} />
              {e.nome} <small>{e.legenda}</small>
            </span>
          ))}
        </div>
        <div className="prod-colunas">
          {ETAPAS.map((e) => (
            <section key={e.chave} className="prod-coluna" aria-labelledby={`prod-${e.chave}`} data-testid={`coluna-${e.chave}`}>
              <h2 id={`prod-${e.chave}`} className={`prod-etapa prod-etapa--${e.chave} prod-coluna__cab`}>
                <Desenho d={e.icone} />
                {e.nome}
                <span className="prod-coluna__qtd">0</span>
              </h2>
              <p className="prod-vazio">Nenhum pedido aqui ainda. Os pedidos chegam sozinhos a esta tela quando a etapa E13 ligar.</p>
            </section>
          ))}
        </div>
        <p className="prod-nota">
          A equipe da cozinha trabalha no tablet da estação, que abre na tela /estacao do próprio aparelho. Começar e
          marcar pronto não mexem no estoque: a baixa acontece uma vez só, quando o pedido é liberado.
        </p>
      </div>
    </Casca>
  );
}
