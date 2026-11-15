"use client";

/**
 * Cartão de um modelo do catálogo: nome grande ("Saco 25 kg"), selo do fornecedor ("Padrão de
 * Atacado X" ou "Qualquer fornecedor"), quantos ingredientes usam (abre a lista de nomes) e as
 * ações de quem gerencia. Também serve de prévia no painel (sem ações).
 */
import { useId, useState } from "react";
import { Botao, Icone, Selo } from "@erp/interface";
import type { UnidadePadrao } from "../auxiliares";
import { medidaDoModelo, nomeDoModeloParaMostrar, type ModeloDeEmbalagem } from "./contas";
import { Realce } from "./Realce";
import { T } from "./textos";

export type UsoDoModelo = { nome: string; ativo: boolean }[];

export function SeloDoFornecedor({ fornecedor }: { fornecedor: string | null }) {
  return fornecedor ? (
    <Selo variante="info" icone="caminhao">
      {T.cartao.padraoDe(fornecedor)}
    </Selo>
  ) : (
    <Selo>{T.cartao.qualquer}</Selo>
  );
}

export function CartaoDoModelo({
  modelo,
  unidades,
  termo,
  uso,
  podeGerenciar,
  previa,
  aoEditar,
  aoDesativar,
  aoReativar,
}: {
  modelo: Pick<ModeloDeEmbalagem, "tipo" | "tamanho" | "unidade" | "fornecedor" | "ativo" | "emUso"> & { id?: number };
  unidades: UnidadePadrao[];
  termo?: string;
  /** Ingredientes que usam (nome e se está ativo). */
  uso?: UsoDoModelo;
  podeGerenciar?: boolean;
  /** Prévia no painel: sem ações e sem o botão de uso. */
  previa?: boolean;
  aoEditar?: () => void;
  aoDesativar?: () => void;
  aoReativar?: () => void;
}) {
  const nome = nomeDoModeloParaMostrar(modelo);
  const medida = medidaDoModelo(modelo, unidades);
  const [verUso, setVerUso] = useState(false);
  const idUso = useId();
  return (
    <article
      className={["emb-cartao", !modelo.ativo && "emb-cartao--inativo", previa && "emb-cartao--previa"].filter(Boolean).join(" ")}
      data-testid={previa ? "previa-do-modelo" : `modelo-${nome}${modelo.fornecedor ? ` (${modelo.fornecedor})` : ""}`}
      aria-label={previa ? T.painel.previa : undefined}
    >
      <header className="emb-cartao__cabeca">
        <span className="emb-cartao__icone" aria-hidden="true">
          <Icone nome="caixa" />
        </span>
        <h3 className="emb-cartao__nome">
          <Realce texto={nome} termo={termo} />
        </h3>
        <span className="emb-cartao__medida">{T.medidaDoCartao[medida]}</span>
      </header>
      <div className="emb-cartao__selos">
        {modelo.fornecedor ? (
          <Selo variante="info" icone="caminhao">
            <Realce texto={T.cartao.padraoDe(modelo.fornecedor)} termo={termo} />
          </Selo>
        ) : (
          <Selo>{T.cartao.qualquer}</Selo>
        )}
        {!modelo.ativo && <Selo variante="alerta">{T.cartao.desativada}</Selo>}
        {!previa &&
          (modelo.emUso > 0 ? (
            <button type="button" className="emb-uso" aria-expanded={verUso} aria-controls={idUso} onClick={() => setVerUso(!verUso)}>
              <Icone nome="ok" />
              {T.cartao.usadaEm(modelo.emUso)}
              <span className="emb-seta" aria-hidden="true" />
            </button>
          ) : (
            <span className="emb-cartao__sem-uso">{T.cartao.naoUsada}</span>
          ))}
      </div>
      {!previa && modelo.emUso > 0 && (
        <ul id={idUso} className="emb-uso__lista" hidden={!verUso} aria-label={T.cartao.usadaEmRotulo(nome)}>
          {(uso ?? []).map((u) => (
            <li key={u.nome}>
              {u.nome}
              {!u.ativo && <span className="emb-uso__inativo"> {T.cartao.ingredienteDesativado}</span>}
            </li>
          ))}
        </ul>
      )}
      {podeGerenciar && !previa && (
        <div className="emb-cartao__acoes">
          <Botao variante="secundario" aria-label={T.cartao.editar(nome)} onClick={aoEditar}>
            Editar
          </Botao>
          {modelo.ativo ? (
            <Botao variante="secundario" aria-label={T.cartao.desativar(nome)} onClick={aoDesativar}>
              Desativar
            </Botao>
          ) : (
            <Botao variante="secundario" aria-label={T.cartao.reativar(nome)} onClick={aoReativar}>
              Reativar
            </Botao>
          )}
        </div>
      )}
    </article>
  );
}
