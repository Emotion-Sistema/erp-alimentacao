import Link from "next/link";
import { Cartao } from "@erp/interface";
import {
  aplicativoPorCodigo,
  aplicativosDoCargo,
  itensDaBarra,
  itensVisiveis,
  NOME_DO_CARGO,
  pode,
  type Acao,
  type Aplicativo,
  type Ator,
} from "@erp/dominio";
import { CentralDeAvisos } from "./CentralDeAvisos";
import { BotaoSair } from "./BotaoSair";
import { BotaoTelaCheia } from "./BotaoTelaCheia";
import { BotaoDaLetra, BotaoDoTema } from "./Preferencias";
import { entradaDoAplicativo } from "./aplicativos-ui";
import { ICONE_DO_APP } from "./icones-do-menu";
import { Menu } from "./Menu";
import { BarraDeBaixo } from "./BarraDeBaixo";
import { TrocarCargo } from "./TrocarCargo";
import { Relogio, TituloDaTela } from "./TopoDaTela";

export function nomeDoCargo(codigo: string | null): string {
  return codigo
    ? ((NOME_DO_CARGO as Record<string, string>)[codigo] ?? codigo)
    : "Sem cargo";
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
    ? itensVisiveis(aplicativo, ator.cargoAtivo).map((i) => ({
        href: i.caminho,
        texto: i.texto,
        icone: i.icone,
        curto: i.curto,
      }))
    : dosCargo.map((a) => ({
        href: entradaDoAplicativo(a, ator.cargoAtivo),
        texto: a.nome,
        icone: ICONE_DO_APP[a.codigo] ?? ("painel" as const),
      }));
  const outros =
    aplicativo && dosCargo.length > 1
      ? [{ href: "/", texto: "Aplicativos" }]
      : [];
  return (
    <div
      className="casca"
      data-aparelho={aplicativo?.aparelho ?? "computador"}
      data-app={aplicativo?.codigo}
    >
      <Menu links={links} outros={outros} />
      <div className="casca__coluna">
        <header className="casca__topo">
          <div className="casca__faixa">
            <Link
              href="/"
              className="casca__marca"
              aria-label="E-MOTION: início"
            >
              {/* Só no celular: no computador o símbolo fica no alto do trilho. */}
              <img
                src="/marca/simbolo.webp"
                alt=""
                width={256}
                height={158}
                className="casca__simbolo"
              />
            </Link>
            <TituloDaTela
              secoes={links}
              app={aplicativo?.nome}
              pessoa={ator.nome}
              cargo={nomeDoCargo(ator.cargoAtivo)}
            />
            <div className="casca__lado">
              <Relogio />
              <BotaoDoTema />
              <CentralDeAvisos />
              {/* A conta (trocar cargo, tela cheia, letra, minha conta, sair) abre no botão redondo:
                janela pequena no computador, gaveta de baixo no celular (decisão 0028). */}
              <button
                type="button"
                className="casca__conta-botao"
                popoverTarget="casca-conta"
                aria-label={`Conta de ${ator.nome}`}
              >
                <span aria-hidden="true">
                  {ator.nome.trim().charAt(0).toUpperCase()}
                </span>
              </button>
              <div
                id="casca-conta"
                popover="auto"
                className="casca__conta"
                aria-label="Conta"
              >
                <p className="casca__conta-titulo" aria-hidden="true">
                  {ator.nome}
                </p>
                {ator.cargos.length > 1 && (
                  <TrocarCargo
                    ativo={ator.cargoAtivo ?? ""}
                    cargos={ator.cargos.map((c) => ({
                      valor: c,
                      texto: nomeDoCargo(c),
                    }))}
                  />
                )}
                <BotaoTelaCheia className="tela-cheia casca__link" />
                <BotaoDaLetra className="casca__link" />
                <Link href="/minha-conta" className="casca__link">
                  Minha conta
                </Link>
                <BotaoSair />
              </div>
            </div>
          </div>
        </header>
        {aplicativo && permitido && (
          <BarraDoAplicativo
            app={aplicativo}
            cargo={ator.cargoAtivo}
            dosCargo={dosCargo}
          />
        )}
        <main className="casca__conteudo">
          {permitido ? (
            children
          ) : (
            <Cartao>
              <h1>Seu cargo não permite esta tela</h1>
              <p>
                Se você precisa dela, peça ao gerente para ajustar seu cargo.
              </p>
            </Cartao>
          )}
        </main>
      </div>
    </div>
  );
}

/** Monta a barra de baixo do celular para o aplicativo aberto (só o que o cargo pode ver). */
function BarraDoAplicativo({
  app,
  cargo,
  dosCargo,
}: {
  app: Aplicativo;
  cargo: string | null;
  dosCargo: Aplicativo[];
}) {
  const { naBarra, noMais } = itensDaBarra(app, cargo);
  const comoItem = (i: Aplicativo["itens"][number]) => ({
    href: i.caminho,
    texto: i.texto,
    icone: i.icone,
    curto: i.curto,
  });
  const principal =
    app.principal && pode(cargo, app.principal.acao)
      ? { href: app.principal.caminho, texto: app.principal.texto }
      : undefined;
  return (
    <BarraDeBaixo
      naBarra={naBarra.map(comoItem)}
      noMais={noMais.map(comoItem)}
      outrosApps={dosCargo
        .filter((a) => a.codigo !== app.codigo)
        .map((a) => ({ href: entradaDoAplicativo(a, cargo), texto: a.nome }))}
      principal={principal}
    />
  );
}
