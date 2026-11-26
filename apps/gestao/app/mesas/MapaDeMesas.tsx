"use client";

/**
 * Mapa das mesas (igual à tela Mesas do protótipo A, decisão 0028): planta da loja com as áreas, os
 * marcos e cada mesa desenhada com as cadeiras; filtros por situação e um popup ao tocar na mesa.
 *
 * Os pedidos ainda não existem (etapa E13): toda mesa aparece Livre. Nada aqui é inventado: a
 * contagem vem do desenho da loja (`MESAS_DA_LOJA`, com os números escolhidos, que vêm do servidor). Usado em Atendimento (/atendimento) e no
 * Caixa (/caixa/mesas). `podeAbrirPedido` (pedidos.lancar) vem do servidor; sem ele, nada de botão.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { Botao, Icone } from "@erp/interface";
import { NumerarMesas } from "./NumerarMesas";
import {
  FAIXAS_DA_LOJA,
  MARCOS_DA_LOJA,
  NOME_DA_AREA_DA_MESA,
  type Mesa,
} from "@erp/dominio/mesas";

type Situacao = "livre" | "ocupada" | "conta";
type Filtro = "todas" | Situacao;

const ROTULO: Record<Situacao, string> = { livre: "Livre", ocupada: "Ocupada", conta: "Pedindo a conta" };
const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  { valor: "livre", texto: "Livres" },
  { valor: "ocupada", texto: "Ocupadas" },
  { valor: "conta", texto: "Pedindo a conta" },
];

/** Sem pedidos (antes da E13) toda mesa está livre. Quando os pedidos chegarem, a situação vem deles. */
const situacaoDe = (_m: Mesa): Situacao => "livre";

export function MapaDeMesas({
  mesas,
  podeAbrirPedido,
  podeNumerar,
}: {
  mesas: readonly Mesa[];
  podeAbrirPedido: boolean;
  /** Supervisor e acima (mesas.numerar): botão "Numerar mesas". */
  podeNumerar: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [numerando, setNumerando] = useState(false);
  const [aberta, setAberta] = useState<Mesa | null>(null);
  const janela = useRef<HTMLDialogElement>(null);

  const total = mesas.length;
  const quantas = (s: Filtro) => (s === "todas" ? total : mesas.filter((m) => situacaoDe(m) === s).length);
  const livres = quantas("livre");

  function abrir(m: Mesa) {
    setAberta(m);
    janela.current?.showModal();
  }
  function fechar() {
    janela.current?.close();
  }

  return (
    <>
      <div className="balcao-barra">
        <div className="balcao-chips" role="group" aria-label="Mostrar as mesas">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              className="balcao-chip"
              aria-pressed={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
            >
              {f.texto} <em>{quantas(f.valor)}</em>
            </button>
          ))}
        </div>
        <div className="balcao-acoes">
          <p className="mesas-resumo" data-testid="mesas-livres">
            <b>{livres}</b> livres de {total}
          </p>
          {podeNumerar && (
            <Botao variante="secundario" onClick={() => setNumerando(true)}>
              Numerar mesas
            </Botao>
          )}
        </div>
      </div>
      {numerando && <NumerarMesas mesas={mesas} aoFechar={() => setNumerando(false)} />}

      <section className="mesas-zona" aria-labelledby="mesas-loja">
        <h2 id="mesas-loja" className="mesas-zona__titulo">
          Loja <span>desenho provisório{podeNumerar ? "; os números se mudam em Numerar mesas" : ""}</span>
        </h2>
        <div className="mesas-planta">
          {MARCOS_DA_LOJA.map((k) => (
            <div
              key={k.texto}
              className={`mesas-marco${k.detalhe ? " mesas-marco--detalhe" : ""}`}
              style={{
                gridColumn: `${k.coluna} / span ${k.colunas ?? 1}`,
                gridRow: `${k.linha} / span ${k.linhas ?? 1}`,
              }}
            >
              <b>{k.texto}</b>
              {k.detalhe && <span>{k.detalhe}</span>}
            </div>
          ))}
          {FAIXAS_DA_LOJA.map((f) => (
            <p key={f.texto} className="mesas-faixa" style={{ gridRow: f.linha }}>
              {f.texto}
            </p>
          ))}
          {mesas.map((m) => {
            const s = situacaoDe(m);
            const visivel = filtro === "todas" || filtro === s;
            const meio = Math.ceil(m.lugares / 2);
            return (
              <button
                key={m.codigo}
                type="button"
                className={`mesa mesa--${s} mesa--l${m.lugares}${visivel ? "" : " mesa--apagada"}${aberta?.numero === m.numero ? " mesa--escolhida" : ""}`}
                style={{ gridColumn: m.coluna, gridRow: m.linha }}
                aria-label={`Mesa ${m.numero}${m.apelido ? ` (${m.apelido})` : ""}, ${ROTULO[s]}, ${m.lugares} lugares`}
                data-testid={`mesa-${m.numero}`}
                data-codigo={m.codigo}
                onClick={() => abrir(m)}
              >
                <Cadeiras n={meio} />
                <span className="mesa__tampo">
                  <span className="mesa__num">{m.numero}</span>
                  <span className="mesa__situacao">{ROTULO[s]}</span>
                  <span className="mesa__lugares">
                    <Icone nome="pessoa" />
                    {m.lugares} lugares
                  </span>
                </span>
                <Cadeiras n={m.lugares - meio} />
              </button>
            );
          })}
        </div>
      </section>

      <div className="mesas-legenda">
        {(["livre", "ocupada", "conta"] as const).map((s) => (
          <span key={s} className={`mesa--${s}`}>
            <i aria-hidden="true" />
            {ROTULO[s]}
          </span>
        ))}
      </div>
      <p className="mesas-nota">
        O tempo de cada cliente e o andamento dos pedidos aparecem aqui quando os pedidos começarem a funcionar
        (etapa E13).
      </p>

      <dialog
        ref={janela}
        className="mesas-pop"
        aria-labelledby="mesas-pop-titulo"
        onClose={() => setAberta(null)}
        onClick={(e) => {
          // Toque fora do quadro (no fundo escuro) fecha, como no protótipo.
          if (e.target === e.currentTarget) fechar();
        }}
      >
        {aberta && (
          <div className="mesas-pop__quadro">
            <button type="button" className="mesas-pop__fechar" aria-label="Fechar" onClick={fechar}>
              <Icone nome="fechar" />
            </button>
            <div className={`mesas-pop__cab mesa--${situacaoDe(aberta)}`}>
              <span className="mesas-pop__num" aria-hidden="true">
                {aberta.numero}
              </span>
              <div>
                <h2 id="mesas-pop-titulo">
                  Mesa {aberta.numero}
                  {aberta.apelido ? ` (${aberta.apelido})` : ""}{" "}
                  <span className="mesas-pop__situacao">{ROTULO[situacaoDe(aberta)]}</span>
                </h2>
                <p className="mesas-pop__onde">
                  <span>{NOME_DA_AREA_DA_MESA[aberta.area]}</span>
                  <span>{aberta.lugares} lugares</span>
                </p>
              </div>
            </div>
            {podeAbrirPedido && (
              <Link
                className="erp-botao erp-botao--primario mesas-pop__acao"
                href={`/atendimento/novo-pedido?mesa=${aberta.numero}`}
              >
                <Icone nome="mais" />
                Abrir pedido
              </Link>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

function Cadeiras({ n }: { n: number }) {
  return (
    <span className="mesa__cadeiras" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}
