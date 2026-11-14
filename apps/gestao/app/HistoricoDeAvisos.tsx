"use client";

import { useEffect, useState } from "react";
import { Aviso, Botao } from "@erp/interface";
import { chamar } from "./chamar";
import { ItemDeAviso, type AvisoDaCaixa } from "./ItemDeAviso";

export function HistoricoDeAvisos() {
  const [avisos, setAvisos] = useState<AvisoDaCaixa[] | null>(null);
  const [erro, setErro] = useState("");
  const [temMais, setTemMais] = useState(false);
  const POR_PAGINA = 50;
  async function carregar(antesDe?: string) {
    const r = await chamar<AvisoDaCaixa[]>(antesDe ? `/api/avisos?antesDe=${encodeURIComponent(antesDe)}` : "/api/avisos");
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    const pagina = r.dados;
    setTemMais(pagina.length === POR_PAGINA);
    setAvisos((l) => (antesDe && l ? [...l, ...pagina] : pagina));
  }
  useEffect(() => {
    void carregar();
  }, []);

  async function resolver(id: string) {
    setErro("");
    const r = await chamar(`/api/avisos/${id}/resolver`, "POST");
    if (!r.ok) return setErro(r.mensagem);
    const agora = new Date().toISOString();
    setAvisos((l) => l && l.map((a) => (a.id === id ? { ...a, situacao: "resolvido", vistoEm: a.vistoEm ?? agora, resolvidoEm: agora } : a)));
  }

  return (
    <>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!avisos ? (
        !erro && <p>Carregando...</p>
      ) : avisos.length === 0 ? (
        <p>Nenhum aviso por enquanto.</p>
      ) : (
        <ul className="lista-simples" aria-label="Todos os avisos">
          {avisos.map((a) => (
            <li key={a.id}>
              <ItemDeAviso aviso={a} aoResolver={(id) => void resolver(id)} />
            </li>
          ))}
        </ul>
      )}
      {avisos && temMais && (
        <Botao type="button" onClick={() => void carregar(avisos[avisos.length - 1]!.id)}>
          Ver mais avisos
        </Botao>
      )}
    </>
  );
}
