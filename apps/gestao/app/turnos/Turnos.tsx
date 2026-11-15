"use client";

import { useEffect, useState } from "react";
import { Aviso, Botao, Cartao, Dado, FichaDeDados } from "@erp/interface";
import { BotaoExemplos, Campo } from "../Campo";
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
      <BotaoExemplos />
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!dados ? (
        !erro && <p>Carregando...</p>
      ) : (
        <>
          <Cartao>
            <h2>Turnos da equipe</h2>
            <div data-testid="lista-turnos">
              <FichaDeDados>
                {dados.turnos.map((t) => (
                  <Dado key={t.id} rotulo={t.nome} icone="relogio">
                    {t.inicio} às {t.fim === "24:00" ? "00:00" : t.fim}
                  </Dado>
                ))}
              </FichaDeDados>
            </div>
            <p>Para mudar os horários dos turnos, peça ao suporte (a tela vem com os horários de venda).</p>
          </Cartao>
          <Cartao>
            <h2>Margem de troca de turno</h2>
            <p>
              Depois do fim de cada turno, quem está saindo ainda recebe os avisos por este tempo, e os avisos do turno
              continuam valendo para quem está chegando. Assim nenhum aviso se perde na troca. A mudança vale para os avisos criados depois dela.
            </p>
            <form onSubmit={(e) => void salvar(e)}>
              <Campo
                rotulo="Minutos (0 a 120)"
                explicacao="Por quantos minutos, depois do fim do turno, quem está saindo ainda recebe os avisos."
                exemplo="30 = a pessoa que sai ainda recebe avisos por mais 30 minutos. 0 = corta na hora."
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
              <Botao type="submit" variante="primario">
                Salvar margem
              </Botao>
            </form>
            {margem === "0" && (
              <Aviso tipo="atencao">Com 0 minutos não há margem: um aviso que nasce perto do fim do turno pode não chegar a quem está entrando.</Aviso>
            )}
            {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
          </Cartao>
        </>
      )}
    </>
  );
}
