"use client";

import { Botao } from "@erp/interface";

export function BotaoSair() {
  return (
    <Botao
      variante="secundario"
      onClick={async () => {
        await fetch("/api/sessao", { method: "DELETE" });
        window.location.assign("/entrar");
      }}
    >
      Sair
    </Botao>
  );
}
