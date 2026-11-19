"use client";

/**
 * Tela "Clube E-MOTION": faixa curta, selo Ligado/Desligado e quatro abas (Desconto do app, Pontos
 * e prêmios, Presentes, Campanhas). Lê tudo de GET /api/clube (`clube.ver`); cada aba grava só a
 * sua parte (`clube.gerenciar`). `podeGerenciar` vem da página; sem ele, tudo fica só para ler.
 * O servidor confere a permissão e as regras de novo em cada gravação.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Aviso, Selo } from "@erp/interface";
import { chamar } from "../chamar";
import { BotaoExemplos } from "../Campo";
import { AvisoComDesfazer, type AvisoRapido } from "../cadastros/embalagens/AvisoComDesfazer";
import { AbaCampanhas } from "./AbaCampanhas";
import { AbaDesconto } from "./AbaDesconto";
import { AbaPontos } from "./AbaPontos";
import { AbaPresentes } from "./AbaPresentes";
import type { PainelDoClube } from "./contas";
import { TC } from "./textos";

let numeroDoAviso = 0;

const ABAS = ["desconto", "pontos", "presentes", "campanhas"] as const;
type Aba = (typeof ABAS)[number];

export type Avisar = (texto: string, extra?: Partial<AvisoRapido>) => void;

export function TelaDoClube({ podeGerenciar }: { podeGerenciar: boolean }) {
  const base = useId();
  const [painel, setPainel] = useState<PainelDoClube | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<Aba>("desconto");
  const [aviso, setAviso] = useState<AvisoRapido | null>(null);
  const avisar = useCallback<Avisar>((texto, extra = {}) => setAviso({ id: ++numeroDoAviso, texto, ...extra }), []);

  const recarregar = useCallback(async (vivo: () => boolean = () => true) => {
    const r = await chamar<PainelDoClube>("/api/clube");
    if (!vivo()) return;
    if (r.ok && r.dados) {
      setPainel(r.dados);
      setErro("");
    } else setErro(r.mensagem);
  }, []);

  useEffect(() => {
    let vivo = true;
    void recarregar(() => vivo);
    return () => {
      vivo = false;
    };
  }, [recarregar]);

  const props = { podeGerenciar, avisar, recarregar: () => recarregar() };

  return (
    <div className="hor-tela clube">
      <header className="hor-tela__cabeca">
        <div className="clube__titulo">
          <h1>{TC.pagina.titulo}</h1>
          {painel && (
            <Selo variante={painel.regras.ligado ? "sucesso" : "neutro"} data-testid="selo-do-clube" aria-label={`${TC.pagina.situacao}: ${painel.regras.ligado ? TC.pagina.ligado : TC.pagina.desligado}`}>
              {painel.regras.ligado ? TC.pagina.ligado : TC.pagina.desligado}
            </Selo>
          )}
        </div>
        <p className="hor-tela__intro">{TC.pagina.intro}</p>
      </header>
      <p className="clube__faixa" data-testid="faixa-do-clube">
        {TC.pagina.faixa}
      </p>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!painel && !erro && <p aria-live="polite">{TC.pagina.carregando}</p>}
      {painel && (
        <>
          {!podeGerenciar && (
            <Aviso tipo="info" data-testid="so-ler">
              {TC.pagina.soLer}
            </Aviso>
          )}
          <div className="hor-abas">
            <div role="tablist" aria-label={TC.pagina.abas} className="hor-abas__lista clube__abas">
              {ABAS.map((a, i) => (
                <button
                  key={a}
                  type="button"
                  role="tab"
                  id={`${base}-aba-${a}`}
                  aria-selected={aba === a}
                  aria-controls={`${base}-painel`}
                  tabIndex={aba === a ? 0 : -1}
                  className="hor-abas__aba"
                  onClick={() => setAba(a)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    const outra = ABAS[(i + (e.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length]!;
                    setAba(outra);
                    document.getElementById(`${base}-aba-${outra}`)?.focus();
                  }}
                >
                  {TC.abas[a]}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`${base}-painel`} aria-labelledby={`${base}-aba-${aba}`} className="hor-abas__painel clube__painel">
              <BotaoExemplos />
              {aba === "desconto" && <AbaDesconto key={painel.regras.atualizadoEm} painel={painel} {...props} />}
              {aba === "pontos" && <AbaPontos key={painel.regras.atualizadoEm} painel={painel} {...props} />}
              {aba === "presentes" && <AbaPresentes painel={painel} {...props} />}
              {aba === "campanhas" && <AbaCampanhas key={painel.regras.atualizadoEm} painel={painel} {...props} />}
            </div>
          </div>
        </>
      )}
      <AvisoComDesfazer aviso={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}

export type PropsDaAba = { painel: PainelDoClube; podeGerenciar: boolean; avisar: Avisar; recarregar: () => Promise<void> };
