"use client";

/**
 * Cartão de um produto: miniatura da foto (só se tiver), lugar na categoria, nome, preço (e, discreto, o do delivery se for outro,
 * quantos tamanhos e grupos de adicionais), tipo de produção (ou "Não passa pela produção"), tempo
 * de preparo, descrição e, para quem gerencia, Editar e Desativar/Reativar.
 * Combo (decisão 0023): selo "Combo" no lugar do tipo, uma linha discreta com as partes e o preço
 * "a partir de" (combo + menor acréscimo de cada parte) quando alguma parte tem acréscimos diferentes.
 */
import { Botao, Selo } from "@erp/interface";
import { acrescimoNoCanal, precoNoCanal, textoDosCentavos, type Produto } from "@erp/dominio/produtos";
import { NOME_DA_AREA_DE_PRODUCAO, type TipoDeProducao } from "@erp/dominio/tipos-producao";
import { enderecoDaFoto } from "./FotoDoProduto";
import { TP } from "./textos";

export function CartaoDoProduto({
  produto,
  posicao,
  tipo,
  nomeDaCategoria,
  podeGerenciar,
  aoEditar,
  aoMudarAtivo,
}: {
  produto: Produto;
  /** Lugar na categoria (1 = primeiro); nulo se desativado. */
  posicao: number | null;
  /** O tipo de produção do produto (se tiver). */
  tipo?: TipoDeProducao;
  /** Mostrado só quando o cartão fica fora do grupo da categoria (desativados). */
  nomeDaCategoria?: string;
  podeGerenciar: boolean;
  aoEditar: () => void;
  aoMudarAtivo: (ativo: boolean) => void;
}) {
  const p = produto;
  // Com tamanhos, o menor preço possível (o acréscimo mais baixo) em cada canal.
  const comTamanhos = p.tamanhos.length > 0;
  // Combo: o menor acréscimo de cada parte; "a partir de" se alguma parte tem acréscimos diferentes.
  const partes = p.combo?.partes.filter((x) => x.opcoes.length > 0) ?? [];
  const acrescimosDoCombo = (canal: "loja" | "delivery") => partes.map((x) => x.opcoes.map((o) => acrescimoNoCanal(o, canal)));
  const variaNoCombo = (canal: "loja" | "delivery") => acrescimosDoCombo(canal).some((a) => Math.min(...a) !== Math.max(...a));
  const menor = (canal: "loja" | "delivery") =>
    precoNoCanal(p, canal) +
    (comTamanhos ? Math.min(...p.tamanhos.map((t) => acrescimoNoCanal(t, canal))) : 0) +
    acrescimosDoCombo(canal).reduce((s, a) => s + Math.min(...a), 0);
  const loja = menor("loja");
  const delivery = menor("delivery");
  const aPartirNaLoja = comTamanhos || variaNoCombo("loja");
  const aPartirNoDelivery = comTamanhos || variaNoCombo("delivery");
  // Linha da lista (visual Balcão, decisão 0028): foto, nome e preparo, preço à direita e as ações.
  return (
    <article className={["hor-cat", "prod-linha", !p.ativo && "hor-cat--inativa"].filter(Boolean).join(" ")} data-testid={`produto-${p.nome}`}>
      {/* Decorativa (alt vazio): o nome está logo ao lado. Sem foto, a inicial no lugar. */}
      {p.fotoId !== null ? (
        <img src={enderecoDaFoto(p.fotoId)} alt="" className="prod-miniatura" width={48} height={48} loading="lazy" decoding="async" data-testid="miniatura-do-produto" />
      ) : (
        <span className="prod-miniatura prod-miniatura--vazia" aria-hidden="true">
          {p.nome.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="prod-linha__corpo">
        <header className="hor-cat__cabeca">
          <h3 className="hor-cat__nome">{p.nome}</h3>
          {posicao !== null && <Selo>{TP.cartao.posicao(posicao)}</Selo>}
          {!p.ativo && <Selo variante="alerta">{TP.cartao.desativado}</Selo>}
        </header>
        <div className="hor-cat__selos" data-testid="producao-do-produto">
          {p.combo ? (
            // Combo não passa pela produção como um todo: cada opção vai para a tela dela.
            <Selo variante="info">{TP.cartao.combo}</Selo>
          ) : p.tipoProducaoId === null ? (
            <Selo>{TP.cartao.semProducao}</Selo>
          ) : (
            <>
              <Selo variante="info">{tipo ? TP.cartao.tipo(tipo.nome, NOME_DA_AREA_DE_PRODUCAO[tipo.area]) : TP.cartao.comProducao}</Selo>
              {p.tempoPreparoMin !== null && <Selo>{TP.cartao.tempo(p.tempoPreparoMin)}</Selo>}
            </>
          )}
          {nomeDaCategoria && <Selo>{TP.cartao.categoria(nomeDaCategoria)}</Selo>}
        </div>
        {p.combo && partes.length > 0 && (
          <p className="prod-extras" data-testid="partes-do-produto">
            {TP.cartao.partes(partes.map((x) => x.nome))}
          </p>
        )}
        {p.descricao && <p className="hor-cat__descricao">{p.descricao}</p>}
      </div>
      <div className="prod-linha__preco">
        <p className="prod-preco" data-testid="preco-do-produto">
          {aPartirNaLoja ? TP.cartao.aPartirDe(textoDosCentavos(loja)) : textoDosCentavos(loja)}
        </p>
        {(delivery !== loja || comTamanhos || p.gruposAdicionais.length > 0) && (
          <p className="prod-extras" data-testid="extras-do-produto">
            {[
              delivery !== loja && TP.cartao.delivery(aPartirNoDelivery ? TP.cartao.aPartirDe(textoDosCentavos(delivery)) : textoDosCentavos(delivery)),
              comTamanhos && TP.cartao.tamanhos(p.tamanhos.length),
              p.gruposAdicionais.length > 0 && TP.cartao.grupos(p.gruposAdicionais.length),
            ]
              .filter(Boolean)
              .join(". ")}
          </p>
        )}
      </div>
      {podeGerenciar && (
        <div className="hor-cat__acoes">
          <Botao variante="secundario" aria-label={TP.cartao.editar(p.nome)} onClick={aoEditar}>
            Editar
          </Botao>
          {p.ativo ? (
            <Botao variante="secundario" aria-label={TP.cartao.desativar(p.nome)} onClick={() => aoMudarAtivo(false)}>
              Desativar
            </Botao>
          ) : (
            <Botao variante="secundario" aria-label={TP.cartao.reativar(p.nome)} onClick={() => aoMudarAtivo(true)}>
              Reativar
            </Botao>
          )}
        </div>
      )}
    </article>
  );
}
