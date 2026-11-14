"use client";

import { useState } from "react";
import { Aviso, Botao, Campo } from "@erp/interface";
import { chamar } from "../chamar";
import { ConfirmarCodigoDoAplicativo } from "../CampoCodigo6";

type RespostaEntrada = { segundoFator?: string; segundoFatorConfigurado?: boolean };

export function FormularioEntrada() {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pedirCodigo, setPedirCodigo] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const dados = new FormData(e.currentTarget);
    const r = await chamar<RespostaEntrada>("/api/sessao", "POST", { login: dados.get("login"), senha: dados.get("senha") });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.mensagem); // inclui o bloqueio por tentativas (429)
      return;
    }
    if (r.dados?.segundoFator === "pendente") {
      if (r.dados.segundoFatorConfigurado) setPedirCodigo(true);
      else window.location.assign("/segundo-fator");
      return;
    }
    window.location.assign("/");
  }

  if (pedirCodigo) {
    return (
      <>
        <p>Para sua segurança, digite o código que aparece no aplicativo autenticador do seu celular.</p>
        <ConfirmarCodigoDoAplicativo aoConfirmar={() => window.location.assign("/")} />
      </>
    );
  }

  return (
    <form onSubmit={enviar} noValidate>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <Campo rotulo="Usuário" name="login" autoComplete="username" autoCapitalize="none" required />
      <Campo rotulo="Senha" name="senha" type="password" autoComplete="current-password" required />
      <Botao type="submit" variante="primario" disabled={enviando}>
        {enviando ? "Entrando..." : "Entrar"}
      </Botao>
    </form>
  );
}
