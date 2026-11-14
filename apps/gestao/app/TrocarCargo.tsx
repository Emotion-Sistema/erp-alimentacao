"use client";

import { useState } from "react";
import { Aviso, Selecao } from "@erp/interface";
import { chamar } from "./chamar";

export function TrocarCargo({ ativo, cargos }: { ativo: string; cargos: { valor: string; texto: string }[] }) {
  const [erro, setErro] = useState("");
  async function trocar(cargo: string) {
    setErro("");
    const r = await chamar("/api/eu/cargo", "POST", { cargo });
    if (r.ok) window.location.reload();
    else setErro(r.mensagem);
  }
  return (
    <div className="casca__troca">
      <Selecao rotulo="Trocar de cargo" value={ativo} opcoes={cargos} onChange={(e) => void trocar(e.target.value)} />
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
    </div>
  );
}
