"use client";

import { useState } from "react";
import { Aviso, Botao, Cartao } from "@erp/interface";
import { BotaoExemplos, Campo } from "../Campo";
import { chamar } from "../chamar";

export function MeuCodigo() {
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "perigo"; texto: string } | null>(null);
  const [codigo, setCodigo] = useState("");

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMensagem(null);
    const r = await chamar("/api/eu/codigo", "POST", { codigo });
    if (r.ok) {
      setMensagem({ tipo: "sucesso", texto: "Seu código foi trocado." });
      setCodigo("");
    } else setMensagem({ tipo: "perigo", texto: r.mensagem });
  }

  return (
    <Cartao>
      <h2>Meu código</h2>
      <BotaoExemplos />
      <p>É o código que você digita no tablet da cozinha. Regras: 4 números, sem repetir (como 1111) e sem sequência (como 1234).</p>
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      <form onSubmit={enviar} noValidate>
        <Campo
          rotulo="Novo código de 4 números"
          explicacao="Só números, 4 no total. Não pode repetir (1111) nem ser sequência (1234)."
          exemplo="4827 (invente o seu e não conte para ninguém)."
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
        />
        <Botao type="submit">Trocar meu código</Botao>
      </form>
    </Cartao>
  );
}
