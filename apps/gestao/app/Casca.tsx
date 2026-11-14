import Link from "next/link";
import { Cartao } from "@erp/interface";
import { NOME_DO_CARGO, pode, type Acao, type Ator } from "@erp/dominio";
import { BotaoSair } from "./BotaoSair";
import { TrocarCargo } from "./TrocarCargo";

const MENU: { href: string; texto: string; acao?: Acao }[] = [
  { href: "/", texto: "Avisos" },
  { href: "/funcionarios", texto: "Funcionários", acao: "usuarios.ver" },
  { href: "/auditoria", texto: "Auditoria", acao: "auditoria.ver" },
  { href: "/estacoes", texto: "Estações", acao: "estacoes.ver" },
];

export function nomeDoCargo(codigo: string | null): string {
  return codigo ? (NOME_DO_CARGO as Record<string, string>)[codigo] ?? codigo : "Sem cargo";
}

/**
 * Moldura das páginas internas: nome, cargo ativo sempre visível e menu.
 * O menu só ESCONDE o que o cargo não permite; quem decide é o servidor.
 */
export function Casca({ ator, exige, children }: { ator: Ator; exige?: Acao; children: React.ReactNode }) {
  const permitido = !exige || pode(ator.cargoAtivo, exige);
  return (
    <div className="casca">
      <header className="casca__topo">
        <div className="casca__quem">
          <strong data-testid="nome-da-pessoa">{ator.nome}</strong>
          <span>
            Cargo ativo: <strong data-testid="cargo-ativo">{nomeDoCargo(ator.cargoAtivo)}</strong>
          </span>
        </div>
        {ator.cargos.length > 1 && (
          <TrocarCargo
            ativo={ator.cargoAtivo ?? ""}
            cargos={ator.cargos.map((c) => ({ valor: c, texto: nomeDoCargo(c) }))}
          />
        )}
        <div className="casca__lado">
          <Link href="/minha-conta" className="casca__link">
            Minha conta
          </Link>
          <BotaoSair />
        </div>
      </header>
      <nav aria-label="Menu" className="casca__menu">
        {MENU.filter((m) => !m.acao || pode(ator.cargoAtivo, m.acao)).map((m) => (
          <Link key={m.href} href={m.href} className="casca__link">
            {m.texto}
          </Link>
        ))}
      </nav>
      <main className="casca__conteudo">
        {permitido ? (
          children
        ) : (
          <Cartao>
            <h1>Seu cargo não permite esta tela</h1>
            <p>Se você precisa dela, peça ao gerente para ajustar seu cargo.</p>
          </Cartao>
        )}
      </main>
    </div>
  );
}
