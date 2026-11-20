"use client";

/**
 * Alergênicos de uma ficha (S1, decisão 0026), calculados no servidor (`alergenicosDasFichas`).
 * Sempre ícone + texto (nunca só a cor). Na dúvida o sistema diz "em conferência", nunca "não contém":
 * o selo "Não contém nenhum alergênico da lista" só aparece com tudo conferido.
 * - `SelosDeAlergenicos`: a linha de selos (lista, ficha aberta e versão da cozinha).
 * - `BlocoDeAlergenicos`: a seção da ficha aberta, com "Alergênicos em conferência" em destaque e
 *   um link para cada ingrediente a conferir (abre a janela dele em Cadastros).
 */
import Link from "next/link";
import { Icone, Selo } from "@erp/interface";
import type { AlergenicosDaFicha } from "@erp/dominio";
import { TF } from "./textos";

const A = TF.alergenicos;

export function SelosDeAlergenicos({ alergenicos, compacto = false }: { alergenicos: AlergenicosDaFicha; compacto?: boolean }) {
  const a = alergenicos;
  const nada = a.contem.length === 0 && a.tracos.length === 0 && a.opcionais.length === 0;
  return (
    <div className="hor-cat__selos fichas-alergenicos" data-testid="alergenicos-da-ficha" data-situacao={a.situacao}>
      {a.situacao === "em_conferencia" && (
        <Selo variante="alerta" icone="alerta" data-testid="alergenicos-em-conferencia">
          {A.emConferencia}
        </Selo>
      )}
      {a.contem.map((x) => (
        <Selo key={`c-${x.codigo}`} variante="perigo" icone="alerta" data-testid={`contem-${x.codigo}`}>
          {A.contem(x.nome)}
        </Selo>
      ))}
      {a.tracos.map((x) => (
        <Selo key={`t-${x.codigo}`} variante="info" icone="info" data-testid={`tracos-${x.codigo}`}>
          {A.tracos(x.nome)}
        </Selo>
      ))}
      {!compacto &&
        a.opcionais.map((x) => (
          <Selo key={`o-${x.codigo}-${x.tipo}`} icone="info" data-testid={`opcional-${x.codigo}`}>
            {A.opcional(x.nome, x.tipo, x.itens)}
          </Selo>
        ))}
      {compacto && a.opcionais.length > 0 && (
        <Selo icone="info" data-testid="alergenicos-opcionais">
          {A.opcionaisTitulo}: {[...new Set(a.opcionais.map((x) => x.nome.toLowerCase()))].join(", ")}
        </Selo>
      )}
      {a.situacao === "conferido" && nada && (
        <Selo variante="sucesso" icone="ok" data-testid="alergenicos-nenhum">
          {A.nenhum}
        </Selo>
      )}
    </div>
  );
}

export function BlocoDeAlergenicos({ alergenicos }: { alergenicos: AlergenicosDaFicha }) {
  const a = alergenicos;
  const emConferencia = a.situacao === "em_conferencia";
  return (
    <section
      className={["hor-secao", emConferencia && "fichas-pendencias"].filter(Boolean).join(" ")}
      aria-labelledby="ficha-alergenicos"
      data-testid="bloco-alergenicos"
    >
      <h2 id="ficha-alergenicos">{A.titulo}</h2>
      <p className="hor-secao__intro">{A.intro}</p>
      <SelosDeAlergenicos alergenicos={a} />
      {emConferencia && (
        <div className="fichas-alergenicos__conferir" data-testid="alergenicos-a-conferir">
          <p className="fichas-alergenicos__alerta">
            <Icone nome="alerta" /> <strong>{A.emConferencia}.</strong> {A.emConferenciaIntro}
          </p>
          {a.emConferencia.length > 0 && (
            <>
              <h3>{A.conferir}</h3>
              <ul className="fichas-lista">
                {a.emConferencia.map((g) => (
                  <li key={g.ingredienteId} className="fichas-lista__item">
                    <span className="fichas-lista__nome">{g.nome}</span>
                    <Link href={`/cadastros?ingrediente=${g.ingredienteId}`} aria-label={A.conferirUm(g.nome)}>
                      {A.conferirUm(g.nome)}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {a.pendencias.length > 0 && (
            <>
              <h3>{A.outrasPendencias}</h3>
              <ul className="fichas-pendencias__lista">
                {a.pendencias.map((p) => (
                  <li key={p}>
                    <Icone nome="alerta" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
