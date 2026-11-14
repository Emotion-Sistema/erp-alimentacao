import Link from "next/link";
import { Cartao } from "@erp/interface";
import { aplicativoPorCodigo, aplicativosDoCargo, itensVisiveis, NOME_DO_CARGO, pode, type Acao, type Ator } from "@erp/dominio";
import { BotaoSair } from "./BotaoSair";
import { entradaDoAplicativo } from "./aplicativos-ui";
import { Menu } from "./Menu";
import { TrocarCargo } from "./TrocarCargo";

export function nomeDoCargo(codigo: string | null): string {
  return codigo ? (NOME_DO_CARGO as Record<string, string>)[codigo] ?? codigo : "Sem cargo";
}

/**
 * Moldura das páginas internas: nome, cargo ativo sempre visível e menu.
 * O menu só ESCONDE o que o cargo não permite; quem decide é o servidor.
 */
export function Casca({
  ator,
  exige,
  app,
  children,
}: {
  ator: Ator;
  exige?: Acao;
  /** Código do aplicativo (catálogo do domínio). Sem ele, o menu lista os aplicativos do cargo. */
  app?: string;
  children: React.ReactNode;
}) {
  const permitido = !exige || pode(ator.cargoAtivo, exige);
  const aplicativo = app ? aplicativoPorCodigo(app) : undefined;
  const dosCargo = aplicativosDoCargo(ator.cargoAtivo);
  const links = aplicativo
    ? itensVisiveis(aplicativo, ator.cargoAtivo).map((i) => ({ href: i.caminho, texto: i.texto }))
    : dosCargo.map((a) => ({ href: entradaDoAplicativo(a, ator.cargoAtivo), texto: a.nome }));
  const outros = aplicativo && dosCargo.length > 1 ? [{ href: "/", texto: "Aplicativos" }] : [];
  return (
    <div className="casca" data-aparelho={aplicativo?.aparelho ?? "computador"} data-app={aplicativo?.codigo}>
      <header className="casca__topo">
        {aplicativo && (
          <p className="casca__app" data-testid="nome-do-app">
            {aplicativo.nome}
          </p>
        )}
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
      <Menu links={links} outros={outros} />
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
