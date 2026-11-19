"use client";

/**
 * Quadro "Quanto fica" da janela do produto (decisão 0021): com `precoDoItem` (a MESMA regra do
 * servidor), mostra o preço de cada tamanho (ou do produto sem tamanho) na loja e no delivery.
 * Se algum grupo ligado é obrigatório, o preço é "a partir de", já somando a escolha obrigatória
 * mais barata. Combo (decisão 0023): duas linhas, "A partir de" (a opção de menor acréscimo em cada
 * parte) e "Até" (a de maior acréscimo), contando só as opções à venda. Só leitura: na hora do pedido quem vale é o servidor (`calcularPrecoDoItem`).
 */
import { CANAIS, type Canal } from "@erp/dominio/horarios";
import {
  acrescimoNoCanal,
  precoDoAdicionalNoCanal,
  precoDoItem,
  textoDosCentavos,
  type GrupoDeAdicionais,
  type Produto,
} from "@erp/dominio/produtos";
import { opcaoDisponivel } from "./PartesDoCombo";
import { TP } from "./textos";

type Extremo = "menor" | "maior";

/** Em cada parte, a opção à venda de menor (ou maior) acréscimo no canal; nulo se alguma parte não tem nenhuma. */
function escolhaDoCombo(produto: Produto, porId: Map<number, Produto>, canal: Canal, extremo: Extremo) {
  const combo = produto.combo!;
  const escolha: { parteId: number; opcaoId: number }[] = [];
  for (const parte of combo.partes) {
    const aVenda = parte.opcoes.filter((o) => opcaoDisponivel(o, porId, produto.id || null));
    if (!aVenda.length) return { escolha: null, parte: parte.nome };
    const valor = (o: (typeof aVenda)[number]) => acrescimoNoCanal(o, canal);
    const melhor = aVenda.reduce((a, b) => ((extremo === "menor" ? valor(b) < valor(a) : valor(b) > valor(a)) ? b : a));
    escolha.push({ parteId: parte.id, opcaoId: melhor.id });
  }
  return { escolha, parte: "" };
}

/** As escolhas obrigatórias mais baratas no canal (para o "a partir de"). */
function obrigatoriasMaisBaratas(oferecidos: GrupoDeAdicionais[], canal: Canal) {
  const escolhas: { id: number; quantidade: number }[] = [];
  for (const g of oferecidos) {
    let falta = g.minimo;
    const itens = g.itens.filter((i) => i.ativo).sort((a, b) => precoDoAdicionalNoCanal(a, canal) - precoDoAdicionalNoCanal(b, canal) || a.ordem - b.ordem);
    for (const i of itens) {
      if (falta <= 0) break;
      const q = Math.min(falta, i.maximoPorItem);
      escolhas.push({ id: i.id, quantidade: q });
      falta -= q;
    }
  }
  return escolhas;
}

/**
 * `produto`: como está na janela agora (tamanhos com ids provisórios); nulo quando algum preço
 * ou acréscimo ainda não é válido (`motivo` diz o que falta).
 */
export function PreviaDoPreco({
  produto,
  motivo,
  grupos,
  produtos = [],
}: {
  produto: Produto | null;
  motivo: string;
  grupos: GrupoDeAdicionais[];
  /** Combo: todos os produtos (os das opções, como estão agora). */
  produtos?: Produto[];
}) {
  let conteudo;
  if (!produto) conteudo = <p className="prod-previa__nota">{motivo}</p>;
  else {
    const porId = new Map(grupos.map((g) => [g.id, g]));
    const oferecidos = produto.gruposAdicionais.map((id) => porId.get(id)).filter((g): g is GrupoDeAdicionais => !!g && g.ativo);
    const obrigatorios = oferecidos.filter((g) => g.minimo > 0);
    const produtosPorId = new Map(produtos.map((p) => [p.id, p]));
    const linhas = produto.combo
      ? (["menor", "maior"] as const).map((extremo) => ({
          nome: extremo === "menor" ? TP.janela.previaAPartirDe : TP.janela.previaAte,
          precos: CANAIS.map((canal) => {
            const { escolha, parte } = escolhaDoCombo(produto, produtosPorId, canal, extremo);
            if (!escolha) return { ok: false as const, motivo: TP.janela.previaParteSemOpcao(parte) };
            return precoDoItem(produto, grupos, canal, { adicionais: obrigatoriasMaisBaratas(obrigatorios, canal), combo: escolha }, produtos);
          }),
        }))
      : (produto.tamanhos.length ? produto.tamanhos : [null]).map((t) => ({
          nome: t ? t.nome : TP.janela.previaSemTamanho,
          precos: CANAIS.map((canal) => precoDoItem(produto, grupos, canal, { tamanhoId: t?.id ?? null, adicionais: obrigatoriasMaisBaratas(obrigatorios, canal) })),
        }));
    const falha = linhas.flatMap((l) => l.precos).find((r) => !r.ok);
    // No combo, a linha já diz "A partir de" ou "Até": o valor vai sem o prefixo.
    const texto = (c: number) => (obrigatorios.length && !produto.combo ? TP.janela.previaAPartir(textoDosCentavos(c)) : textoDosCentavos(c));
    conteudo =
      falha && !falha.ok ? (
        <p className="prod-previa__nota">{falha.motivo}</p>
      ) : (
        <>
          <table className="prod-previa__tabela">
            <thead>
              <tr>
                <th scope="col">{produto.combo ? TP.janela.previaColCombo : TP.janela.previaColTamanho}</th>
                <th scope="col">{TP.janela.previaColLoja}</th>
                <th scope="col">{TP.janela.previaColDelivery}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, k) => (
                <tr key={k} data-testid={`previa-${l.nome}`}>
                  <th scope="row">{l.nome}</th>
                  {l.precos.map((r, c) => (
                    <td key={c}>{r.ok ? texto(r.unitarioCentavos) : ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {produto.combo && <p className="prod-previa__nota">{TP.janela.previaComboNota}</p>}
          {obrigatorios.length > 0 && <p className="prod-previa__nota">{TP.janela.previaObrigatorios(obrigatorios.map((g) => g.nome).join(", "))}</p>}
          {oferecidos.length > obrigatorios.length && <p className="prod-previa__nota">{TP.janela.previaOpcionais}</p>}
        </>
      );
  }
  return (
    <section className="prod-previa" aria-labelledby="prod-previa-titulo" data-testid="previa-do-preco">
      <h3 id="prod-previa-titulo" className="prod-previa__titulo">
        {TP.janela.previa}
      </h3>
      {conteudo}
      <p className="prod-previa__nota">{TP.janela.previaServidor}</p>
    </section>
  );
}
