"use client";

import { useState } from "react";
import { Aviso, Botao } from "@erp/interface";
import { Campo } from "./Campo";
import { chamar } from "./chamar";

/** Pede os 6 números do aplicativo autenticador e confirma no servidor. */
export function ConfirmarCodigoDoAplicativo({ aoConfirmar }: { aoConfirmar: () => void }) {
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/\s/g, "");
    const r = await chamar("/api/sessao/segundo-fator", "POST", { codigo });
    setEnviando(false);
    if (r.ok) aoConfirmar();
    else setErro(r.mensagem);
  }

  return (
    <form onSubmit={enviar} noValidate>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <Campo
        rotulo="Código do aplicativo autenticador"
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        explicacao="Digite os 6 números que o aplicativo autenticador mostra agora. Eles mudam a cada 30 segundos."
        exemplo="123 456 (digite sem espaço: 123456). Se o código expirar, espere o próximo e digite de novo."
        placeholder="6 números"
        required
      />
      <Botao type="submit" variante="primario" disabled={enviando}>
        {enviando ? "Conferindo..." : "Confirmar"}
      </Botao>
    </form>
  );
}
