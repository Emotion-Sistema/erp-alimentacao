"use client";

/** Cartão de um tipo de produção: nome, área, capacidade e, para quem gerencia, Editar e Desativar/Reativar. */
import { Botao, Selo } from "@erp/interface";
import { NOME_DA_AREA, type TipoDeProducao } from "@erp/dominio/tipos-producao";
import { TT } from "./textos";

export function CartaoDoTipo({
  tipo,
  podeGerenciar,
  aoEditar,
  aoMudarAtivo,
}: {
  tipo: TipoDeProducao;
  podeGerenciar: boolean;
  aoEditar: () => void;
  aoMudarAtivo: (ativo: boolean) => void;
}) {
  const t = tipo;
  return (
    <article className={["hor-cat", !t.ativo && "hor-cat--inativa"].filter(Boolean).join(" ")} data-testid={`tipo-${t.nome}`}>
      <header className="hor-cat__cabeca">
        <h3 className="hor-cat__nome">{t.nome}</h3>
        <Selo>{NOME_DA_AREA[t.area]}</Selo>
        {!t.ativo && <Selo variante="alerta">{TT.cartao.desativado}</Selo>}
      </header>
      <p className="hor-cat__descricao" data-testid="capacidade-do-tipo">
        {TT.cartao.capacidade(t.capacidade)}
      </p>
      {podeGerenciar && (
        <div className="hor-cat__acoes">
          <Botao variante="secundario" aria-label={TT.cartao.editar(t.nome)} onClick={aoEditar}>
            Editar
          </Botao>
          {t.ativo ? (
            <Botao variante="secundario" aria-label={TT.cartao.desativar(t.nome)} onClick={() => aoMudarAtivo(false)}>
              Desativar
            </Botao>
          ) : (
            <Botao variante="secundario" aria-label={TT.cartao.reativar(t.nome)} onClick={() => aoMudarAtivo(true)}>
              Reativar
            </Botao>
          )}
        </div>
      )}
    </article>
  );
}
