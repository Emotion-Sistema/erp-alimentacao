"use client";

import { Aviso, Botao, Dado, FichaDeDados, Selo } from "@erp/interface";
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
const SELO_DA_PRIORIDADE = { urgente: "perigo", normal: "alerta", informativo: "info" } as const;

/** Prioridade em selo: a cor ajuda, mas a palavra sempre aparece. */
export function SeloDaPrioridade({ prioridade }: { prioridade: keyof typeof PRIORIDADE_EM_PALAVRAS }) {
  return (
    <Selo variante={SELO_DA_PRIORIDADE[prioridade]} icone={prioridade === "urgente" ? "alerta" : "info"}>
      {PRIORIDADE_EM_PALAVRAS[prioridade]}
    </Selo>
  );
}

/** Um aviso da caixa: prioridade, texto, data, autor, situação e o botão de resolver. */
export function ItemDeAviso({ aviso: a, aoResolver }: { aviso: AvisoDaCaixa; aoResolver: (id: string) => void }) {
  const tipo = a.situacao === "resolvido" ? "sucesso" : a.prioridade === "urgente" ? "perigo" : a.prioridade === "normal" ? "atencao" : "info";
  return (
    <Aviso tipo={tipo} data-testid="aviso-item" data-situacao={a.situacao} data-prioridade={a.prioridade}>
      <FichaDeDados compacta className="aviso__meta">
        <Dado rotulo="Prioridade">
          <SeloDaPrioridade prioridade={a.prioridade} />
        </Dado>
        <Dado rotulo="Quando" icone="calendario">
          {formatarDataHora(a.criadoEm)}
        </Dado>
        {a.natureza === "comunicado" && (
          <Dado rotulo="De" icone="pessoa">
            {a.autorNome}
          </Dado>
        )}
      </FichaDeDados>
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

/** Vários avisos do mesmo tipo num cartão só: o título com quantos, a lista e "Resolvido" para todos. */
export function GrupoDeAvisos({ titulo, avisos, aoResolver }: { titulo: string; avisos: AvisoDaCaixa[]; aoResolver: (ids: string[]) => void }) {
  const algumNovo = avisos.some((a) => a.situacao === "novo");
  return (
    <Aviso tipo="atencao" data-testid="aviso-grupo" data-situacao={algumNovo ? "novo" : "visto"} data-prioridade="normal">
      <FichaDeDados compacta className="aviso__meta">
        <Dado rotulo="Prioridade">
          <SeloDaPrioridade prioridade="normal" />
        </Dado>
        <Dado rotulo="Quando" icone="calendario">
          {formatarDataHora(avisos[0]!.criadoEm)}
        </Dado>
      </FichaDeDados>
      <p>
        <strong>{titulo}</strong>
      </p>
      <ul>
        {avisos.map((a) => (
          <li key={a.id}>{a.texto}</li>
        ))}
      </ul>
      <p>
        <strong>{algumNovo ? "Novo" : "Visto"}</strong>
      </p>
      <Botao variante="secundario" onClick={() => aoResolver(avisos.map((a) => a.id))}>
        Resolvido (todos)
      </Botao>
    </Aviso>
  );
}
