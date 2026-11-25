/**
 * Cardápio para lançar pedido (tela "Novo pedido" do atendimento). Só leitura, sob a ação
 * `pedidos.lancar` (decisão 0011): produtos ativos de categorias ativas, com o preço da loja e o
 * tempo de preparo. Nunca custo, ficha técnica, preço de delivery nem outro dado interno.
 */
import type { Banco } from "@erp/banco";
import type { ItemDoCardapio } from "./cardapio-comum";
import { fotosAtivas } from "./fotos";
import { exigir, type Ator } from "./sessao";

export async function cardapioParaLancar(db: Banco, ator: Ator | null): Promise<ItemDoCardapio[]> {
  await exigir(db, ator, "pedidos.lancar", { tipo: "cardapio" });
  const linhas = await db
    .selectFrom("produto as p")
    .innerJoin("categoria as c", "c.id", "p.categoria_id")
    .where("p.ativo", "=", true)
    .where("c.ativo", "=", true)
    .select([
      "p.id",
      "p.nome",
      "p.preco_centavos as precoCentavos",
      "p.tempo_preparo_min as tempoPreparoMin",
      "c.id as categoriaId",
      "c.nome as categoriaNome",
      "c.ordem as categoriaOrdem",
    ])
    .orderBy("c.ordem")
    .orderBy("c.id")
    .orderBy("p.ordem")
    .orderBy("p.nome")
    .orderBy("p.id")
    .execute();
  const fotos = await fotosAtivas(db, linhas.map((l) => l.id));
  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    categoria: { id: l.categoriaId, nome: l.categoriaNome, ordem: l.categoriaOrdem },
    precoCentavos: l.precoCentavos,
    fotoId: fotos.get(l.id) ?? null,
    tempoPreparoMin: l.tempoPreparoMin,
  }));
}
