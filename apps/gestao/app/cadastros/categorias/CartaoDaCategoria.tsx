"use client";

/**
 * Cartão de uma categoria: ordem, nome, descrição, selos da situação agora (loja e delivery) e,
 * para quem gerencia, Editar e Desativar/Reativar. "Horário da categoria" abre a grade de 7 dias
 * por canal (a mesma da tela de horários; "Igual ao canal" = segue).
 */
import { useId, useState } from "react";
import { Botao, Selo } from "@erp/interface";
import { NOME_DO_CANAL, textoDaSituacao, type Canal } from "@erp/dominio/horarios";
import { AbasDoCanal } from "../horarios/AbasDoCanal";
import { GradeDeVenda } from "../horarios/GradeDeVenda";
import type { Categoria, Horarios } from "../horarios/contas";
import type { Gravar } from "../horarios/usarHorarios";
import { TC } from "./textos";

export function CartaoDaCategoria({
  categoria,
  horarios,
  podeGerenciar,
  gravar,
  avisar,
  aoEditar,
  aoMudarAtivo,
}: {
  categoria: Categoria;
  horarios: Horarios | null;
  podeGerenciar: boolean;
  gravar: Gravar;
  avisar: (texto: string) => void;
  aoEditar: () => void;
  aoMudarAtivo: (ativo: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [canal, setCanal] = useState<Canal>("loja");
  const idHorario = useId();
  const c = categoria;
  const agora = horarios?.agora.categorias.find((x) => x.categoriaId === c.id);
  return (
    <article className={["hor-cat", !c.ativo && "hor-cat--inativa"].filter(Boolean).join(" ")} data-testid={`categoria-${c.nome}`}>
      <header className="hor-cat__cabeca">
        <Selo>{TC.cartao.ordem(c.ordem)}</Selo>
        <h3 className="hor-cat__nome">{c.nome}</h3>
        {!c.ativo && <Selo variante="alerta">{TC.cartao.desativada}</Selo>}
      </header>
      <p className={c.descricao ? "hor-cat__descricao" : "hor-cat__descricao hor-cat__descricao--vazia"}>{c.descricao ?? TC.cartao.semDescricao}</p>
      {c.ativo && agora && (
        <div className="hor-cat__selos" data-testid="situacao-da-categoria">
          {(["loja", "delivery"] as const).map((k) => (
            <Selo key={k} variante={agora[k].aberta ? "sucesso" : "neutro"}>
              {TC.cartao.situacao(NOME_DO_CANAL[k], textoDaSituacao(agora[k], k))}
            </Selo>
          ))}
        </div>
      )}
      <div className="hor-cat__acoes">
        {c.ativo && horarios && (
          <button type="button" className="emb-uso hor-cat__horario" aria-expanded={aberto} aria-controls={idHorario} aria-label={TC.cartao.horarioNome(c.nome)} onClick={() => setAberto(!aberto)}>
            {TC.cartao.horario}
            <span className="emb-seta" aria-hidden="true" />
          </button>
        )}
        {podeGerenciar && (
          <>
            <Botao variante="secundario" aria-label={TC.cartao.editar(c.nome)} onClick={aoEditar}>
              Editar
            </Botao>
            {c.ativo ? (
              <Botao variante="secundario" aria-label={TC.cartao.desativar(c.nome)} onClick={() => aoMudarAtivo(false)}>
                Desativar
              </Botao>
            ) : (
              <Botao variante="secundario" aria-label={TC.cartao.reativar(c.nome)} onClick={() => aoMudarAtivo(true)}>
                Reativar
              </Botao>
            )}
          </>
        )}
      </div>
      {c.ativo && horarios && aberto && (
        <div id={idHorario} className="hor-cat__grade">
          {!horarios.podeMudar && <p className="hor-secao__intro">{TC.pagina.soLerHorario}</p>}
          <AbasDoCanal canal={canal} aoTrocar={setCanal}>
            <GradeDeVenda
              key={canal}
              canal={canal}
              categoriaId={c.id}
              alvo={`de ${c.nome} ${canal === "delivery" ? "no delivery" : "na loja"}`}
              horarios={horarios}
              podeMudar={horarios.podeMudar}
              gravar={gravar}
              avisar={avisar}
            />
          </AbasDoCanal>
        </div>
      )}
    </article>
  );
}
