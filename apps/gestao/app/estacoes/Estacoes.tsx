"use client";

import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Cartao, Etiqueta } from "@erp/interface";
import { BotaoExemplos, Campo } from "../Campo";
import { chamar } from "../chamar";

type Estacao = {
  id: number;
  nome: string;
  pessoas: { id: number; nome: string; cargo: string; ativa: boolean }[];
};

export function Estacoes({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [lista, setLista] = useState<Estacao[] | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "perigo"; texto: string } | null>(null);
  const [revogando, setRevogando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamar<Estacao[]>("/api/estacoes");
    if (r.ok && r.dados) setLista(r.dados);
    else setMensagem({ tipo: "perigo", texto: r.mensagem });
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function cadastrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setMensagem(null);
    const nome = String(new FormData(form).get("nome") ?? "");
    const r = await chamar("/api/estacoes", "POST", { nome });
    if (r.ok) {
      // O servidor encerra o seu acesso neste aparelho: a partir de agora ele é só a estação.
      window.location.assign("/estacao");
    } else setMensagem({ tipo: "perigo", texto: r.mensagem });
  }

  async function revogar(id: number) {
    setMensagem(null);
    const r = await chamar(`/api/estacoes/${id}/revogar`, "POST");
    setRevogando(null);
    if (r.ok) {
      setMensagem({ tipo: "sucesso", texto: "Estação desligada." });
      await carregar();
    } else setMensagem({ tipo: "perigo", texto: r.mensagem });
  }

  return (
    <>
      <h1>Estações da cozinha</h1>
      <BotaoExemplos />
      <p>Cada estação é um tablet da cozinha. Aqui você vê quem está em cada uma.</p>
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      {podeGerenciar && (
        <Cartao>
          <h2>Cadastrar ESTE aparelho como estação</h2>
          <p>Faça isso no próprio tablet da cozinha. Ao cadastrar, o seu acesso neste aparelho é encerrado e ele passa a mostrar a tela da estação.</p>
          <form onSubmit={cadastrar} noValidate>
            <Campo
              rotulo="Nome da estação (ex.: Cozinha 1)"
              explicacao="O nome que aparece para a equipe. Use algo que diga onde fica o tablet."
              exemplo="Cozinha 1, Chapa, Bar."
              name="nome" autoComplete="off" required />
            <Botao type="submit">Cadastrar ESTE aparelho como estação</Botao>
          </form>
        </Cartao>
      )}
      {!lista ? (
        <p>Carregando...</p>
      ) : lista.length === 0 ? (
        <p>Nenhuma estação cadastrada ainda.</p>
      ) : (
        <ul className="lista-simples">
          {lista.map((e) => (
            <li key={e.id}>
              <Cartao data-testid={`estacao-${e.nome}`}>
                <h2>{e.nome}</h2>
                {e.pessoas.length === 0 ? (
                  <p>Ninguém está nesta estação agora.</p>
                ) : (
                  <ul className="lista-simples">
                    {e.pessoas.map((p) => (
                      <li key={p.id} className={p.ativa ? "pessoa-ativa" : undefined}>
                        {p.nome} {p.ativa && <Etiqueta tipo="sucesso">Ativa agora</Etiqueta>}
                      </li>
                    ))}
                  </ul>
                )}
                {podeGerenciar &&
                  (revogando === e.id ? (
                    <Aviso tipo="atencao">
                      <p>Desligar a estação tira o acesso deste tablet na hora. Confirmar?</p>
                      <Botao variante="perigo" onClick={() => void revogar(e.id)}>
                        Sim, desligar {e.nome}
                      </Botao>{" "}
                      <Botao variante="secundario" onClick={() => setRevogando(null)}>
                        Cancelar
                      </Botao>
                    </Aviso>
                  ) : (
                    <Botao variante="perigo" onClick={() => setRevogando(e.id)}>
                      Desligar estação
                    </Botao>
                  ))}
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
