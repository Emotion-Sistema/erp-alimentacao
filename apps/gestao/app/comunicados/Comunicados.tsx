"use client";

import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Cartao } from "@erp/interface";
import { chamar } from "../chamar";
import { formatarDataHora } from "../formatar";

type Pessoa = { usuarioId: number; nome: string; situacao: "nao_recebeu" | "novo" | "visto" | "resolvido"; quando: string | null };
type Enviado = {
  id: string;
  criadoEm: string;
  texto: string;
  prioridade: string;
  cargos: { codigo: string; nome: string }[];
  autorNome: string | null;
  confirmaram: number;
  total: number;
  pessoas: Pessoa[];
};

const SITUACAO: Record<Pessoa["situacao"], string> = {
  resolvido: "Confirmou",
  visto: "Viu, não confirmou",
  novo: "Recebeu, não abriu",
  nao_recebeu: "Ainda não entrou no turno",
};

export function Comunicados({ cargos }: { cargos: { valor: string; texto: string }[] }) {
  const [lista, setLista] = useState<Enviado[] | null>(null);
  const [texto, setTexto] = useState("");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [prioridade, setPrioridade] = useState("normal");
  const [validade, setValidade] = useState("ate_ler");
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "perigo"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamar<Enviado[]>("/api/comunicados");
    if (r.ok && r.dados) setLista(r.dados);
    else setMensagem({ tipo: "perigo", texto: r.mensagem });
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const todos = marcados.length === cargos.length;
  const alternar = (c: string) => setMarcados((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMensagem(null);
    setEnviando(true);
    const r = await chamar("/api/comunicados", "POST", { texto, cargos: marcados, prioridade, validade });
    setEnviando(false);
    if (!r.ok) return setMensagem({ tipo: "perigo", texto: r.mensagem });
    setMensagem({ tipo: "sucesso", texto: "Comunicado enviado." });
    setTexto("");
    setMarcados([]);
    await carregar();
  }

  return (
    <>
      <h1>Comunicados</h1>
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      <Cartao>
        <form onSubmit={(e) => void enviar(e)}>
          <div className="erp-campo">
            <label className="erp-campo__rotulo" htmlFor="comunicado-texto">
              Recado
            </label>
            <textarea
              id="comunicado-texto"
              className="erp-campo__entrada"
              rows={4}
              maxLength={500}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <small>{texto.length} de 500 letras</small>
          </div>
          <fieldset className="comunicados__grupo">
            <legend>Para quais cargos</legend>
            <label className="comunicados__opcao">
              <input type="checkbox" checked={todos} onChange={() => setMarcados(todos ? [] : cargos.map((c) => c.valor))} />
              Marcar todos
            </label>
            {cargos.map((c) => (
              <label key={c.valor} className="comunicados__opcao">
                <input type="checkbox" checked={marcados.includes(c.valor)} onChange={() => alternar(c.valor)} />
                {c.texto}
              </label>
            ))}
          </fieldset>
          <div className="erp-campo">
            <label className="erp-campo__rotulo" htmlFor="comunicado-prioridade">
              Prioridade
            </label>
            <select id="comunicado-prioridade" className="erp-campo__entrada" value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
              <option value="normal">Normal</option>
              <option value="urgente">Urgente</option>
              <option value="informativo">Informativo</option>
            </select>
          </div>
          <fieldset className="comunicados__grupo">
            <legend>Por quanto tempo vale</legend>
            <label className="comunicados__opcao">
              <input type="radio" name="validade" checked={validade === "ate_ler"} onChange={() => setValidade("ate_ler")} />
              Até cada um confirmar a leitura
            </label>
            <label className="comunicados__opcao">
              <input type="radio" name="validade" checked={validade === "turno"} onChange={() => setValidade("turno")} />
              Só no turno de hoje
            </label>
          </fieldset>
          <Botao type="submit" disabled={enviando}>
            Enviar comunicado
          </Botao>
        </form>
      </Cartao>

      <h2>Comunicados enviados</h2>
      {!lista ? (
        <p>Carregando...</p>
      ) : lista.length === 0 ? (
        <p>Nenhum comunicado enviado ainda.</p>
      ) : (
        <ul className="lista-simples">
          {lista.map((c) => (
            <li key={c.id} data-testid="comunicado-enviado">
              <Cartao>
                <small>
                  {formatarDataHora(c.criadoEm)} · {c.autorNome ?? "sem autor"} · para {c.cargos.map((x) => x.nome).join(", ")}
                </small>
                <p>{c.texto}</p>
                <p>
                  <strong>
                    {c.confirmaram} de {c.total} confirmaram
                  </strong>
                </p>
                <details>
                  <summary>Ver quem leu</summary>
                  <ul className="lista-simples">
                    {c.pessoas.map((p) => (
                      <li key={p.usuarioId}>
                        {p.nome}: {SITUACAO[p.situacao]}
                        {p.quando ? ` (${formatarDataHora(p.quando)})` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
