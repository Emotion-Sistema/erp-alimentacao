"use client";

/**
 * Quadro "Quanto fica" da janela do produto (decisão 0021): com `precoDoItem` (a MESMA regra do
 * servidor), mostra o preço de cada tamanho (ou do produto sem tamanho) na loja e no delivery.
 * Se algum grupo ligado é obrigatório, o preço é "a partir de", já somando a escolha obrigatória
 * mais barata. Só leitura: na hora do pedido quem vale é o servidor (`calcularPrecoDoItem`).
 */
import { CANAIS, type Canal } from "@erp/dominio/horarios";
import {
  precoDoAdicionalNoCanal,
  precoDoItem,
  textoDosCentavos,
  type GrupoDeAdicionais,
  type Produto,
} from "@erp/dominio/produtos";
import { TP } from "./textos";

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
export function PreviaDoPreco({ produto, motivo, grupos }: { produto: Produto | null; motivo: string; grupos: GrupoDeAdicionais[] }) {
  let conteudo;
  if (!produto) conteudo = <p className="prod-previa__nota">{motivo}</p>;
  else {
    const porId = new Map(grupos.map((g) => [g.id, g]));
    const oferecidos = produto.gruposAdicionais.map((id) => porId.get(id)).filter((g): g is GrupoDeAdicionais => !!g && g.ativo);
    const obrigatorios = oferecidos.filter((g) => g.minimo > 0);
    const linhas = (produto.tamanhos.length ? produto.tamanhos : [null]).map((t) => ({
      nome: t ? t.nome : TP.janela.previaSemTamanho,
      precos: CANAIS.map((canal) => precoDoItem(produto, grupos, canal, { tamanhoId: t?.id ?? null, adicionais: obrigatoriasMaisBaratas(obrigatorios, canal) })),
    }));
    const falha = linhas.flatMap((l) => l.precos).find((r) => !r.ok);
    const texto = (c: number) => (obrigatorios.length ? TP.janela.previaAPartir(textoDosCentavos(c)) : textoDosCentavos(c));
    conteudo =
      falha && !falha.ok ? (
        <p className="prod-previa__nota">{falha.motivo}</p>
      ) : (
        <>
          <table className="prod-previa__tabela">
            <thead>
              <tr>
                <th scope="col">{TP.janela.previaColTamanho}</th>
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
