"use client";

import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Cartao } from "@erp/interface";
import { AreaDeTexto, BotaoExemplos, Grupo, OpcaoDoGrupo, Selecao } from "../Campo";
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
  nao_recebeu: "Ainda não recebeu (não entrou com esse cargo)",
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
      <BotaoExemplos />
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      <Cartao>
        <form onSubmit={(e) => void enviar(e)}>
          <AreaDeTexto
            id="comunicado-texto"
            rotulo="Recado"
            explicacao="Escreva o aviso curto e direto, até 500 letras. Quem for do cargo escolhido vai ver na tela."
            exemplo="Hoje faltou gás de cozinha. Usem só a chapa elétrica até as 14h."
            rows={4}
            maxLength={500}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <small>{texto.length} de 500 letras</small>
          <Grupo
            className="comunicados__grupo"
            legenda="Para quais cargos"
            explicacao="Marque quem precisa receber. Só os cargos marcados veem o recado."
            exemplo="Marque Cozinheira e Auxiliar de cozinha para um aviso da cozinha. Marcar todos envia para a casa inteira."
          >
            <OpcaoDoGrupo
              className="comunicados__opcao"
              rotulo="Marcar todos"
              checked={todos}
              onChange={() => setMarcados(todos ? [] : cargos.map((c) => c.valor))}
            />
            {cargos.map((c) => (
              <OpcaoDoGrupo
                key={c.valor}
                className="comunicados__opcao"
                rotulo={c.texto}
                checked={marcados.includes(c.valor)}
                onChange={() => alternar(c.valor)}
              />
            ))}
          </Grupo>
          <Selecao
            id="comunicado-prioridade"
            rotulo="Prioridade"
            explicacao="Quanto o aviso deve chamar a atenção. Urgente toca e vibra; informativo é discreto."
            exemplo="Urgente: falta de gás. Normal: troca de turno. Informativo: aniversário do mês."
            value={prioridade}
            onChange={(e) => setPrioridade(e.target.value)}
            opcoes={[
              { valor: "normal", texto: "Normal" },
              { valor: "urgente", texto: "Urgente" },
              { valor: "informativo", texto: "Informativo" },
            ]}
          />
          <Grupo
            className="comunicados__grupo"
            legenda="Por quanto tempo vale"
            explicacao="Escolha até quando o aviso fica aparecendo para cada pessoa."
            exemplo="Até cada um confirmar: regra nova que todos precisam ler. Só neste turno: aviso que perde a validade quando o turno acaba."
          >
            <OpcaoDoGrupo
              className="comunicados__opcao"
              tipo="radio"
              name="validade"
              rotulo="Até cada um confirmar a leitura"
              checked={validade === "ate_ler"}
              onChange={() => setValidade("ate_ler")}
            />
            <OpcaoDoGrupo
              className="comunicados__opcao"
              tipo="radio"
              name="validade"
              rotulo="Só neste turno"
              checked={validade === "turno"}
              onChange={() => setValidade("turno")}
            />
          </Grupo>
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
