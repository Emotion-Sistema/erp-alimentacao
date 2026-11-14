"use client";

import { useEffect, useState } from "react";
import { Aviso } from "@erp/interface";
import { chamar } from "./chamar";
import { formatarDataHora } from "./formatar";

type AvisoDoCargo = { id: string | number; criadoEm: string; tipo: string; texto: string };

export function ListaDeAvisos() {
  const [avisos, setAvisos] = useState<AvisoDoCargo[] | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    void chamar<AvisoDoCargo[]>("/api/avisos").then((r) => {
      if (r.ok && r.dados) setAvisos(r.dados.slice(0, 10));
      else setErro(r.mensagem);
    });
  }, []);
  if (erro) return <Aviso tipo="perigo">{erro}</Aviso>;
  if (!avisos) return <p>Carregando...</p>;
  if (avisos.length === 0) return <p>Nenhum aviso por enquanto.</p>;
  return (
    <ul className="lista-simples">
      {avisos.map((a) => (
        <li key={a.id}>
          <Aviso tipo={a.tipo === "perigo" ? "perigo" : a.tipo === "atencao" ? "atencao" : "info"}>
            <small>{formatarDataHora(a.criadoEm)}</small>
            <div>{a.texto}</div>
          </Aviso>
        </li>
      ))}
    </ul>
  );
}
