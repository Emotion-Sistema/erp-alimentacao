"use client";

/**
 * Resumo visual de um ingrediente (unidade, área, fornecedor e embalagens com a equivalência).
 * Usado na lista, no catálogo marcado, na prévia da lista colada e nas sugestões ao digitar.
 */
import type { HTMLAttributes, ReactNode } from "react";
import { BlocoDeConfirmacao, ChipDeEmbalagem, Dado, FichaDeDados, GrupoDeChips, SecaoDoItem, Selo, varianteDaArea } from "@erp/interface";
import { equivalenciaNaUnidade, unidadePorExtenso } from "./auxiliares";

export type EmbalagemDoResumo = { chave: string | number; nome: string; quantidade: string | null; inativa?: boolean };

export function SeloDaArea({ area, nome }: { area: string; nome: string }) {
  return (
    <Selo variante={varianteDaArea(area)} icone="local">
      {nome}
    </Selo>
  );
}

/**
 * A conta de uma embalagem em destaque ("1 saco 25 kg = 25 kg"). Sem nome ou sem quantidade
 * válida, mostra no lugar o que falta, no mesmo bloco.
 */
export function ContaDaEmbalagem({ nome, quantidade, base, exibicao, ...resto }: { nome: string; quantidade: string; base: string; exibicao?: string } & Omit<HTMLAttributes<HTMLParagraphElement>, "children">) {
  const n = nome.trim();
  const equivalencia = equivalenciaNaUnidade(quantidade, base, exibicao);
  if (!n || !equivalencia) {
    return (
      <BlocoDeConfirmacao vazio {...resto}>
        {!n ? "Escreva o nome da embalagem para ver a conta." : "Escreva a quantidade para ver a conta."}
      </BlocoDeConfirmacao>
    );
  }
  return (
    <BlocoDeConfirmacao {...resto}>
      1 {n} = {equivalencia}
    </BlocoDeConfirmacao>
  );
}

export function ResumoDoItem({
  unidadeBase,
  unidadeExibicao,
  area,
  nomeDaArea,
  fornecedor,
  mostrarFornecedor,
  embalagens,
  acaoDasEmbalagens,
}: {
  unidadeBase: string;
  /** Unidade escolhida para ver e informar; sem ela, vale a de dentro. */
  unidadeExibicao?: string;
  area: string;
  nomeDaArea: (a: string) => string;
  fornecedor?: string | null;
  mostrarFornecedor?: boolean;
  embalagens: EmbalagemDoResumo[];
  /** Botão ao lado das embalagens (ex.: Adicionar embalagem). */
  acaoDasEmbalagens?: ReactNode;
}) {
  return (
    <>
      <FichaDeDados>
        <Dado rotulo="Unidade do estoque" icone="balanca">
          {unidadeBase ? unidadePorExtenso(unidadeExibicao || unidadeBase) : null}
        </Dado>
        <Dado rotulo="Área">
          <SeloDaArea area={area} nome={nomeDaArea(area)} />
        </Dado>
        {mostrarFornecedor && (
          <Dado rotulo="Fornecedor" icone="caminhao">
            {fornecedor}
          </Dado>
        )}
      </FichaDeDados>
      <SecaoDoItem titulo="Embalagens" icone="caixa">
        {embalagens.length === 0 ? (
          <p className="erp-vazio">Nenhuma embalagem cadastrada</p>
        ) : (
          <GrupoDeChips rotulo="Embalagens">
            {embalagens.map((e) => (
              <ChipDeEmbalagem key={e.chave} nome={e.nome} quantidade={e.quantidade} unidade={unidadeBase} equivalencia={e.quantidade ? equivalenciaNaUnidade(e.quantidade, unidadeBase, unidadeExibicao) : null} inativa={e.inativa} />
            ))}
          </GrupoDeChips>
        )}
        {acaoDasEmbalagens}
      </SecaoDoItem>
    </>
  );
}
