"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, Botao } from "@erp/interface";
import { NOME_DA_AREA_DA_MESA, type Mesa } from "@erp/dominio/mesas";
import { Campo } from "../Campo";
import { chamar } from "../chamar";
import { JanelaModal, usarPedirFechar } from "../cadastros/JanelaModal";

/**
 * Numerar as mesas (supervisor e acima, pedido do responsável em 25/11/2026). Gaveta com o número de
 * cada mesa, na ordem do mapa. Grava tudo de uma vez; o servidor recusa número repetido.
 */
export function NumerarMesas({ mesas, aoFechar }: { mesas: readonly Mesa[]; aoFechar: () => void }) {
  const [sujo, setSujo] = useState(false);
  return (
    <JanelaModal titulo="Numerar as mesas" sujo={sujo} aoMexer={() => setSujo(true)} aoFechar={aoFechar} data-testid="janela-numerar">
      <Formulario mesas={mesas} aoFechar={aoFechar} />
    </JanelaModal>
  );
}

function Formulario({ mesas, aoFechar }: { mesas: readonly Mesa[]; aoFechar: () => void }) {
  const router = useRouter();
  const pedirFechar = usarPedirFechar();
  const [numeros, setNumeros] = useState<Record<string, string>>(() => Object.fromEntries(mesas.map((m) => [m.codigo, String(m.numero)])));
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  async function gravar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const valores = Object.fromEntries(Object.entries(numeros).map(([c, n]) => [c, Number(n)]));
    if (Object.values(valores).some((n) => !Number.isInteger(n) || n < 1 || n > 999)) {
      setErro("Cada mesa precisa de um número inteiro de 1 a 999.");
      return;
    }
    setGravando(true);
    const r = await chamar("/api/mesas/numeros", "POST", { numeros: valores });
    setGravando(false);
    if (!r.ok) return setErro(r.mensagem);
    router.refresh();
    aoFechar();
  }

  return (
    <form onSubmit={gravar} noValidate>
      <p className="hor-tela__intro">O número aparece no mapa, no pedido e na cozinha. Cada mesa precisa de um número diferente.</p>
      <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
      {mesas.map((m) => (
        <Campo
          key={m.codigo}
          rotulo={`${m.apelido ?? "Mesa"} de ${m.lugares} lugares, hoje nº ${m.numero} (${NOME_DA_AREA_DA_MESA[m.area]})`}
          explicacao="Número desta mesa, de 1 a 999. Para trocar duas mesas, troque os dois números e grave."
          exemplo={`${m.numero}, ou o número pintado na mesa.`}
          inputMode="numeric"
          maxLength={3}
          autoComplete="off"
          value={numeros[m.codigo] ?? ""}
          onChange={(e) => setNumeros((x) => ({ ...x, [m.codigo]: e.target.value.replace(/\D/g, "") }))}
          data-testid={`numero-${m.codigo}`}
        />
      ))}
      <div className="cadastros__botoes">
        <Botao variante="secundario" onClick={pedirFechar}>
          Cancelar
        </Botao>
        <Botao type="submit" disabled={gravando}>
          Gravar números
        </Botao>
      </div>
    </form>
  );
}
