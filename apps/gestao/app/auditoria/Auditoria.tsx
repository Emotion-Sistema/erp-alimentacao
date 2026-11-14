"use client";

import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Campo, Celula, Etiqueta, Selecao, Tabela } from "@erp/interface";
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

/** Resume os detalhes em uma linha curta. */
function resumirDetalhes(d: unknown): string {
  if (d === null || d === undefined) return "";
  const texto =
    typeof d === "object"
      ? Object.entries(d as Record<string, unknown>)
          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
          .join("; ")
      : String(d);
  return texto.length > 140 ? `${texto.slice(0, 140)}...` : texto;
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
      <p>Tudo o que foi feito no sistema, com quem fez e quando. Nada aqui pode ser apagado.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAplicados({ ...filtros });
        }}
        noValidate
      >
        <Selecao rotulo="Resultado" value={filtros.resultado} opcoes={RESULTADOS} onChange={(e) => setFiltros({ ...filtros, resultado: e.target.value })} />
        <Campo rotulo="Ação (nome exato, ex.: usuarios.gerenciar)" value={filtros.acao} onChange={(e) => setFiltros({ ...filtros, acao: e.target.value })} />
        <Campo rotulo="De (data)" type="date" value={filtros.de} onChange={(e) => setFiltros({ ...filtros, de: e.target.value })} />
        <Campo rotulo="Até (data)" type="date" value={filtros.ate} onChange={(e) => setFiltros({ ...filtros, ate: e.target.value })} />
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
                <Celula rotulo="Alvo">{[r.alvoTipo, r.alvoId].filter((x) => x !== null && x !== undefined).join(" ")}</Celula>
                <Celula rotulo="Detalhes">{resumirDetalhes(r.detalhes)}</Celula>
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
