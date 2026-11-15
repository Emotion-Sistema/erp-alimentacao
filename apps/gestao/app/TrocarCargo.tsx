"use client";

import { useState } from "react";
import { Aviso } from "@erp/interface";
import { Selecao } from "./Campo";
import { chamar } from "./chamar";

export function TrocarCargo({ ativo, cargos }: { ativo: string; cargos: { valor: string; texto: string }[] }) {
  const [erro, setErro] = useState("");
  async function trocar(cargo: string) {
    setErro("");
    const r = await chamar("/api/eu/cargo", "POST", { cargo });
    if (r.ok) window.location.assign("/"); // o lançador leva ao aplicativo do novo cargo
    else setErro(r.mensagem);
  }
  return (
    <div className="casca__troca">
      <Selecao
        rotulo="Trocar de cargo"
        explicacao="Escolha com qual cargo você quer trabalhar agora. A tela muda na hora."
        exemplo="Quem é caixa e também atendente escolhe Atendente para ver as mesas."
        value={ativo}
        opcoes={cargos}
        onChange={(e) => void trocar(e.target.value)}
      />
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
    </div>
  );
}
