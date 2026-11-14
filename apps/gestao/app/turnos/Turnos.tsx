"use client";

import { useEffect, useState } from "react";
import { Aviso, Botao, Cartao } from "@erp/interface";
import { chamar } from "../chamar";

type Dados = { turnos: { id: number; nome: string; inicio: string; fim: string }[]; margemMinutos: number };

export function Turnos() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [margem, setMargem] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    void chamar<Dados>("/api/turnos").then((r) => {
      if (!r.ok || !r.dados) return setErro(r.mensagem);
      setDados(r.dados);
      setMargem(String(r.dados.margemMinutos));
    });
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setOk("");
    const r = await chamar<Dados>("/api/turnos", "POST", { minutos: Number(margem) });
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setDados(r.dados);
    setMargem(String(r.dados.margemMinutos));
    setOk("Margem salva.");
  }

  return (
    <>
      <h1>Turnos</h1>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!dados ? (
        !erro && <p>Carregando...</p>
      ) : (
        <>
          <Cartao>
            <h2>Turnos da equipe</h2>
            <ul className="lista-simples" data-testid="lista-turnos">
              {dados.turnos.map((t) => (
                <li key={t.id}>
                  <strong>{t.nome}</strong>: {t.inicio} às {t.fim === "24:00" ? "00:00" : t.fim}
                </li>
              ))}
            </ul>
            <p>Para mudar os horários dos turnos, peça ao suporte (a tela vem com os horários de venda).</p>
          </Cartao>
          <Cartao>
            <h2>Margem de troca de turno</h2>
            <p>
              Depois do fim de cada turno, quem está saindo ainda recebe os avisos por este tempo, e os avisos do turno
              continuam valendo para quem está chegando. Assim nenhum aviso se perde na troca.
            </p>
            <form onSubmit={(e) => void salvar(e)}>
              <label>
                Minutos (0 a 120)
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  step={1}
                  required
                  value={margem}
                  onChange={(e) => setMargem(e.target.value)}
                  data-testid="margem-minutos"
                />
              </label>
              <Botao type="submit" variante="primario">
                Salvar margem
              </Botao>
            </form>
            {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
          </Cartao>
        </>
      )}
    </>
  );
}
