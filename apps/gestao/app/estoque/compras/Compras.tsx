"use client";

/** Compras do estoque: o que repor (E10), dar entrada, a lista das entradas e o saldo inicial por planilha. */
import { useState } from "react";
import { Abas } from "../Abas";
import type { ContextoDoEstoque } from "../contexto";
import { TE } from "../textos";
import { EntradaDeMercadoria } from "./EntradaDeMercadoria";
import { ListaDeEntradas } from "./ListaDeEntradas";
import { ParaRepor } from "./ParaRepor";
import { SaldoInicial } from "./SaldoInicial";

type Aba = "repor" | "entrada" | "lista" | "saldo";

export function Compras({ contexto }: { contexto: ContextoDoEstoque }) {
  const [aba, setAba] = useState<Aba>("repor");
  const [versao, setVersao] = useState(0);
  const mudou = () => setVersao((v) => v + 1);
  return (
    <div className="hor-tela est-tela">
      <header className="hor-tela__cabeca">
        <h1>{TE.compras.titulo}</h1>
        <p className="hor-tela__intro">{TE.compras.intro}</p>
      </header>
      <Abas
        rotulo={TE.compras.abas}
        abas={[
          { valor: "repor", texto: TE.compras.abaRepor },
          { valor: "entrada", texto: TE.compras.abaEntrada },
          { valor: "lista", texto: TE.compras.abaLista },
          { valor: "saldo", texto: TE.compras.abaSaldo },
        ]}
        atual={aba}
        aoTrocar={setAba}
      >
        {aba === "repor" && <ParaRepor contexto={contexto} versao={versao} />}
        {aba === "entrada" && <EntradaDeMercadoria contexto={contexto} aoGravar={mudou} />}
        {aba === "lista" && <ListaDeEntradas contexto={contexto} versao={versao} />}
        {aba === "saldo" && <SaldoInicial contexto={contexto} aoGravar={mudou} />}
      </Abas>
    </div>
  );
}
