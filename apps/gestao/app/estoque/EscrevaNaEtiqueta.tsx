"use client";

/**
 * "Escreva na etiqueta" (ideia nº 16, versão 1): depois de gravar uma entrada de mercadoria ou uma
 * produção de preparo, uma linha grande por lote com o texto para escrever no pacote
 * (BAC-002 · vence 30/11). Sem etiqueta (o produto não usa), o bloco não aparece.
 */
import type { EtiquetaDoLote } from "@erp/dominio";
import { dia } from "./comum";
import { TE } from "./textos";

const T = TE.etiqueta;
/** "2026-11-30" -> "30/11". */
const ddmm = (iso: string | null) => (iso ? dia(iso).slice(0, 5) : null);

export function EscrevaNaEtiqueta({ etiquetas, tipo, nivel = 3 }: { etiquetas: readonly EtiquetaDoLote[]; tipo: "entrada" | "producao"; nivel?: 2 | 3 }) {
  if (etiquetas.length === 0) return null;
  const Titulo = nivel === 2 ? "h2" : "h3";
  const linha = tipo === "entrada" ? T.entrada : T.producao;
  // Vários itens na mesma nota: o nome aparece embaixo, para saber em qual pacote vai.
  const variosItens = new Set(etiquetas.map((e) => e.itemId)).size > 1;
  return (
    <section className="est-etiquetas" aria-labelledby={`est-etiquetas-${tipo}`} data-testid="escreva-na-etiqueta">
      <Titulo id={`est-etiquetas-${tipo}`}>{T.titulo}</Titulo>
      <p className="est-etiquetas__intro">{T.intro}</p>
      <ul className="est-etiquetas__lista">
        {etiquetas.map((e) => (
          <li key={e.etiqueta} className="est-etiquetas__linha" data-testid={`etiqueta-${e.etiqueta}`}>
            <span className="est-etiquetas__texto">{linha(e.etiqueta, ddmm(e.validade), ddmm(e.dia)!)}</span>
            {variosItens && <span className="est-etiquetas__nome">{e.nome}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
