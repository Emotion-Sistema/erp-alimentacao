"use client";

import { useState } from "react";
import { Aviso, Botao, Campo } from "@erp/interface";

export function FormularioEntrada() {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const dados = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/sessao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login: dados.get("login"), senha: dados.get("senha") }),
      });
      if (r.ok) {
        window.location.assign("/");
        return;
      }
      const corpo = (await r.json().catch(() => null)) as { mensagem?: string } | null;
      setErro(corpo?.mensagem ?? "Não foi possível entrar.");
    } catch {
      setErro("Sem conexão com o servidor. Confira a internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
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
