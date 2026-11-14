"use client";

import { Aviso, Botao } from "@erp/interface";
import { formatarDataHora } from "./formatar";

export type AvisoDaCaixa = {
  id: string;
  criadoEm: string;
  tipo: string;
  texto: string;
  prioridade: "urgente" | "normal" | "informativo";
  natureza: "operacional" | "comunicado";
  autorNome: string | null;
  situacao: "novo" | "visto" | "resolvido";
  vistoEm: string | null;
  resolvidoEm: string | null;
};

export function situacaoEmPalavras(a: AvisoDaCaixa): string {
  if (a.situacao === "resolvido") return a.natureza === "comunicado" ? "Leitura confirmada" : "Resolvido";
  return a.situacao === "visto" ? "Visto" : "Novo";
}

const PRIORIDADE_EM_PALAVRAS = { urgente: "Urgente", normal: "Normal", informativo: "Informativo" } as const;

/** Um aviso da caixa: prioridade, texto, data, autor, situação e o botão de resolver. */
export function ItemDeAviso({ aviso: a, aoResolver }: { aviso: AvisoDaCaixa; aoResolver: (id: string) => void }) {
  const tipo = a.situacao === "resolvido" ? "sucesso" : a.prioridade === "urgente" ? "perigo" : a.prioridade === "normal" ? "atencao" : "info";
  return (
    <Aviso tipo={tipo} data-testid="aviso-item" data-situacao={a.situacao} data-prioridade={a.prioridade}>
      <small>
        {PRIORIDADE_EM_PALAVRAS[a.prioridade]} · {formatarDataHora(a.criadoEm)}
        {a.natureza === "comunicado" && a.autorNome ? ` · de ${a.autorNome}` : ""}
      </small>
      <p>{a.texto}</p>
      <p>
        <strong>{situacaoEmPalavras(a)}</strong>
      </p>
      {a.situacao !== "resolvido" && (
        <Botao variante="secundario" onClick={() => aoResolver(a.id)}>
          {a.natureza === "comunicado" ? "Li e entendi" : "Resolvido"}
        </Botao>
      )}
    </Aviso>
  );
}
