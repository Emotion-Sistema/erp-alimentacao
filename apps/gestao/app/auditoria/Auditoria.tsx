"use client";

import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Celula, Dado, Etiqueta, FichaDeDados, Selo, Tabela } from "@erp/interface";
import { BotaoExemplos, Campo, Selecao } from "../Campo";
import { chamar } from "../chamar";
import { formatarDataHora } from "../formatar";

type Registro = {
  id: string | number;
  ocorridoEm: string;
  usuarioId: number | null;
  usuarioNome: string | null;
  acao: string;
  resultado: "permitido" | "recusado" | "falhou";
  alvoTipo: string | null;
  alvoId: string | number | null;
  detalhes: unknown;
};

const POR_PAGINA = 50;
const RESULTADOS = [
  { valor: "", texto: "Todos" },
  { valor: "permitido", texto: "Permitido" },
  { valor: "recusado", texto: "Recusado" },
  { valor: "falhou", texto: "Falhou" },
];

const limitar = (t: string) => (t.length > 80 ? `${t.slice(0, 80)}...` : t);

/** Detalhes do registro como dados com rótulo (até 4), em vez de uma linha corrida. */
function Detalhes({ d }: { d: unknown }) {
  if (d === null || d === undefined || d === "") return <span className="erp-vazio">Sem detalhes</span>;
  if (typeof d !== "object") return <>{limitar(String(d))}</>;
  const itens = Object.entries(d as Record<string, unknown>);
  if (itens.length === 0) return <span className="erp-vazio">Sem detalhes</span>;
  return (
    <FichaDeDados compacta>
      {itens.slice(0, 4).map(([k, v]) => (
        <Dado key={k} rotulo={k}>
          {limitar(typeof v === "object" ? JSON.stringify(v) : String(v))}
        </Dado>
      ))}
      {itens.length > 4 && <Dado rotulo="Mais">{itens.length - 4} item(ns)</Dado>}
    </FichaDeDados>
  );
}

export function Auditoria() {
  const [filtros, setFiltros] = useState({ resultado: "", acao: "", de: "", ate: "" });
  const [aplicados, setAplicados] = useState(filtros);
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const buscar = useCallback(async (f: typeof filtros, antesDe?: string | number) => {
    const p = new URLSearchParams({ limite: String(POR_PAGINA) });
    if (f.resultado) p.set("resultado", f.resultado);
    if (f.acao.trim()) p.set("acao", f.acao.trim());
    // Datas escolhidas no horário de São Paulo (UTC-3, sem horário de verão).
    if (f.de) p.set("de", `${f.de}T00:00:00-03:00`);
    if (f.ate) p.set("ate", `${f.ate}T23:59:59.999-03:00`);
    if (antesDe !== undefined) p.set("antesDe", String(antesDe));
    setCarregando(true);
    setErro("");
    const r = await chamar<Registro[]>(`/api/auditoria?${p}`);
    setCarregando(false);
    if (!r.ok || !r.dados) {
      setErro(r.mensagem);
      return;
    }
    const novos = r.dados;
    setTemMais(novos.length === POR_PAGINA);
    setRegistros((antes) => (antesDe !== undefined && antes ? [...antes, ...novos] : novos));
  }, []);

  useEffect(() => {
    void buscar(aplicados);
  }, [buscar, aplicados]);

  return (
    <>
      <h1>Auditoria</h1>
      <BotaoExemplos />
      <p>Tudo o que foi feito no sistema, com quem fez e quando. Nada aqui pode ser apagado.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAplicados({ ...filtros });
        }}
        noValidate
      >
        <Selecao
          rotulo="Resultado"
          explicacao="Filtra pelo que aconteceu: deu certo ou foi recusado."
          exemplo="Escolha Recusado para ver tentativas que o sistema barrou."
          value={filtros.resultado} opcoes={RESULTADOS} onChange={(e) => setFiltros({ ...filtros, resultado: e.target.value })} />
        <Campo
          rotulo="Ação (nome exato, ex.: usuarios.gerenciar)"
          explicacao="Opcional. O nome técnico da ação, escrito igualzinho. Deixe vazio para ver todas."
          exemplo="usuarios.gerenciar mostra só o que foi feito na tela de funcionários."
          value={filtros.acao} onChange={(e) => setFiltros({ ...filtros, acao: e.target.value })} />
        <Campo
          rotulo="De (data)"
          explicacao="Opcional. Mostra registros a partir deste dia."
          exemplo="01/11/2026 mostra de 1º de novembro em diante."
          type="date"
          value={filtros.de} onChange={(e) => setFiltros({ ...filtros, de: e.target.value })} />
        <Campo
          rotulo="Até (data)"
          explicacao="Opcional. Mostra registros até este dia."
          exemplo="15/11/2026 mostra até o dia 15 de novembro."
          type="date"
          value={filtros.ate} onChange={(e) => setFiltros({ ...filtros, ate: e.target.value })} />
        <Botao type="submit">Filtrar</Botao>
      </form>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!registros ? (
        !erro && <p>Carregando...</p>
      ) : registros.length === 0 ? (
        <p>Nada encontrado com esses filtros.</p>
      ) : (
        <Tabela aria-label="Registros de auditoria">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>Ação</th>
              <th>Resultado</th>
              <th>Alvo</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <Celula rotulo="Quando">{formatarDataHora(r.ocorridoEm)}</Celula>
                <Celula rotulo="Quem">{r.usuarioNome ?? "Sistema ou visitante"}</Celula>
                <Celula rotulo="Ação">{r.acao}</Celula>
                <Celula rotulo="Resultado">
                  <Etiqueta tipo={r.resultado === "permitido" ? "sucesso" : "perigo"}>
                    {r.resultado === "permitido" ? "Permitido" : r.resultado === "recusado" ? "Recusado" : "Falhou"}
                  </Etiqueta>
                </Celula>
                <Celula rotulo="Alvo">
                  {r.alvoTipo || r.alvoId !== null ? (
                    <Selo>{[r.alvoTipo, r.alvoId].filter((x) => x !== null && x !== undefined).join(" ")}</Selo>
                  ) : (
                    <span className="erp-vazio">Nenhum</span>
                  )}
                </Celula>
                <Celula rotulo="Detalhes">
                  <Detalhes d={r.detalhes} />
                </Celula>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
      {temMais && registros && (
        <Botao variante="secundario" disabled={carregando} onClick={() => void buscar(aplicados, registros[registros.length - 1]!.id)}>
          Carregar mais
        </Botao>
      )}
    </>
  );
}
