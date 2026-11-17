"use client";

/**
 * Tela "Horários de venda": faixa Agora, Semana da loja, Canais (abas Loja | Delivery), Datas
 * especiais e Pausas. `podeMudar` vem do servidor (GET /api/horarios); quando é falso, tudo fica
 * só para ler. O servidor confere a permissão de novo em cada gravação.
 */
import { useCallback, useState } from "react";
import { Aviso } from "@erp/interface";
import type { Canal } from "@erp/dominio/horarios";
import { BotaoExemplos } from "../../Campo";
import { AvisoComDesfazer, type AvisoRapido } from "../embalagens/AvisoComDesfazer";
import { AbasDoCanal } from "./AbasDoCanal";
import { DatasEspeciais } from "./DatasEspeciais";
import { FaixaAgora } from "./FaixaAgora";
import { GradeDeVenda } from "./GradeDeVenda";
import { Pausas } from "./Pausas";
import { SemanaDaLoja } from "./SemanaDaLoja";
import { usarHorarios } from "./usarHorarios";
import { T } from "./textos";

let numeroDoAviso = 0;

export function TelaDeHorarios() {
  const { horarios, categorias, erro, lidoAs, gravar } = usarHorarios();
  const [canal, setCanal] = useState<Canal>("loja");
  const [aviso, setAviso] = useState<AvisoRapido | null>(null);
  const avisar = useCallback((texto: string) => setAviso({ id: ++numeroDoAviso, texto }), []);

  return (
    <div className="hor-tela">
      <header className="hor-tela__cabeca">
        <h1>{T.pagina.titulo}</h1>
        <p className="hor-tela__intro">{T.pagina.intro}</p>
      </header>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!horarios && !erro && <p aria-live="polite">{T.pagina.carregando}</p>}
      {horarios && (
        <>
          <FaixaAgora agora={horarios.agora} lidoAs={lidoAs} />
          {!horarios.podeMudar && (
            <Aviso tipo="info" data-testid="so-ler">
              {T.pagina.soLer}
            </Aviso>
          )}
          <BotaoExemplos />
          <SemanaDaLoja semana={horarios.semana} podeMudar={horarios.podeMudar} gravar={gravar} avisar={avisar} />
          <section className="hor-secao" aria-labelledby="hor-canais-titulo" data-testid="canais">
            <h2 id="hor-canais-titulo">{T.canais.titulo}</h2>
            <p className="hor-secao__intro">{T.canais.explicacao}</p>
            <AbasDoCanal canal={canal} aoTrocar={setCanal}>
              <GradeDeVenda
                key={canal}
                canal={canal}
                categoriaId={null}
                alvo={canal === "delivery" ? "do delivery" : "da loja"}
                horarios={horarios}
                podeMudar={horarios.podeMudar}
                gravar={gravar}
                avisar={avisar}
              />
            </AbasDoCanal>
          </section>
          <DatasEspeciais horarios={horarios} categorias={categorias} podeMudar={horarios.podeMudar} gravar={gravar} avisar={avisar} />
          <Pausas horarios={horarios} categorias={categorias} podeMudar={horarios.podeMudar} gravar={gravar} avisar={avisar} />
        </>
      )}
      <AvisoComDesfazer aviso={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}
