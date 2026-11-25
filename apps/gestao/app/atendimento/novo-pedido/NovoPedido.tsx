"use client";

/**
 * Novo pedido (igual à tela do protótipo A, decisão 0028): à esquerda o cardápio (chips de
 * categoria, busca e cartões de produto); à direita a comanda da mesa com - e +, observação e a
 * conta (itens, serviço de 10% e total, tudo em centavos inteiros). No celular, um resumo fixo embaixo.
 *
 * A comanda ainda NÃO é gravada nem vai para a cozinha: isso liga na etapa E13 (pedidos), com preço
 * e receita versionados no pedido e a baixa do estoque uma vez só (RC-01). Por isso o botão de
 * enviar fica desligado e a tela diz isso. O cardápio vem do servidor (GET /api/cardapio).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Aviso, Botao, Icone } from "@erp/interface";
import { contasDaComanda, type ItemDoCardapio } from "@erp/dominio/cardapio";
import { textoDosCentavos } from "@erp/dominio/produtos";
import { chamar } from "../../chamar";
import { Campo } from "../../Campo";

const AVISO_E13 = "O envio para a cozinha liga na etapa E13 (pedidos). Por enquanto a comanda não é gravada.";

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

export function NovoPedido({ mesa, podeVerFoto }: { mesa: { numero: number; nome: string } | null; podeVerFoto: boolean }) {
  const [cardapio, setCardapio] = useState<ItemDoCardapio[] | null>(null);
  const [erro, setErro] = useState("");
  const [categoria, setCategoria] = useState<number | "todas">("todas");
  const [busca, setBusca] = useState("");
  /** Quantidade por produto, na ordem em que foram lançados. */
  const [comanda, setComanda] = useState<{ id: number; quantidade: number }[]>([]);
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    let vivo = true;
    void chamar<ItemDoCardapio[]>("/api/cardapio").then((r) => {
      if (!vivo) return;
      if (r.ok && r.dados) setCardapio(r.dados);
      else setErro(r.mensagem);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const produtos = cardapio ?? [];
  const categorias = produtos
    .map((p) => p.categoria)
    .filter((c, i, l) => l.findIndex((x) => x.id === c.id) === i);
  const termo = semAcento(busca.trim());
  const visiveis = produtos.filter(
    (p) => (categoria === "todas" || p.categoria.id === categoria) && (!termo || semAcento(p.nome).includes(termo)),
  );

  const linhas = comanda
    .map((l) => ({ ...l, produto: produtos.find((p) => p.id === l.id) }))
    .filter((l): l is typeof l & { produto: ItemDoCardapio } => !!l.produto && l.quantidade > 0);
  const contas = contasDaComanda(linhas.map((l) => ({ precoCentavos: l.produto.precoCentavos, quantidade: l.quantidade })));

  function mudar(id: number, delta: number) {
    setComanda((atual) => {
      const ja = atual.find((l) => l.id === id);
      if (!ja) return delta > 0 ? [...atual, { id, quantidade: delta }] : atual;
      return atual.map((l) => (l.id === id ? { ...l, quantidade: Math.max(0, l.quantidade + delta) } : l)).filter((l) => l.quantidade > 0);
    });
  }

  const titulo = mesa ? mesa.nome : "Sem mesa";
  const itensTexto = (n: number) => (n === 1 ? "1 item" : `${n} itens`);

  return (
    <div className="np">
      <div className="np-cardapio">
        <h1>Novo pedido</h1>
        <p className="hor-tela__intro">Toque no item para lançar na comanda.</p>
        {erro && <Aviso tipo="perigo">{erro}</Aviso>}
        {!cardapio && !erro && <p className="np-carregando">Carregando o cardápio…</p>}
        {cardapio && produtos.length === 0 && (
          <p className="hor-vazio">Nenhum produto à venda no cardápio. Quem cuida dos cadastros ativa os produtos em Cadastros, Produtos.</p>
        )}
        {produtos.length > 0 && (
          <>
            <div className="balcao-barra">
              <div className="balcao-chips" role="group" aria-label="Categorias do cardápio">
                <button type="button" className="balcao-chip" aria-pressed={categoria === "todas"} onClick={() => setCategoria("todas")}>
                  Todas <em>{produtos.length}</em>
                </button>
                {categorias.map((c) => (
                  <button key={c.id} type="button" className="balcao-chip" aria-pressed={categoria === c.id} onClick={() => setCategoria(c.id)}>
                    {c.nome} <em>{produtos.filter((p) => p.categoria.id === c.id).length}</em>
                  </button>
                ))}
              </div>
              <div className="balcao-acoes">
                <label className="balcao-busca">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />
                  </svg>
                  <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar, ex.: café"
                    aria-label="Buscar produto"
                  />
                </label>
              </div>
            </div>
            {visiveis.length === 0 ? (
              <p className="hor-vazio">Nenhum produto com &quot;{busca.trim()}&quot; nesta categoria.</p>
            ) : (
              <div className="np-grade">
                {visiveis.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="np-prod"
                    aria-label={`Lançar ${p.nome}, ${textoDosCentavos(p.precoCentavos)}`}
                    onClick={() => mudar(p.id, 1)}
                  >
                    {podeVerFoto && p.fotoId ? (
                      <img className="np-prod__foto" src={`/api/cadastros/produtos/foto/${p.fotoId}`} alt="" loading="lazy" />
                    ) : (
                      <span className="np-prod__foto np-prod__inicial" aria-hidden="true">
                        {p.nome.trim().charAt(0).toLocaleUpperCase("pt-BR")}
                      </span>
                    )}
                    <span className="np-prod__txt">
                      <b>{p.nome}</b>
                      <span className="np-prod__linha">
                        <span className="np-prod__preco">{textoDosCentavos(p.precoCentavos)}</span>
                        <span className="np-prod__add">+ lançar</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <aside className="np-comanda" id="comanda" aria-label="Comanda">
        <div className="np-comanda__cab">
          <div>
            <small>Comanda</small>
            <b data-testid="comanda-mesa">{titulo}</b>
          </div>
          <span className="np-comanda__qtd">{itensTexto(contas.quantidade)}</span>
        </div>
        {!mesa && (
          <p className="np-comanda__sem-mesa">
            <Link href="/atendimento">Escolher a mesa no mapa</Link>
          </p>
        )}
        <div className="np-itens" data-testid="comanda-itens">
          {linhas.length === 0 ? (
            <p className="np-vazio">Toque num item do cardápio para lançar.</p>
          ) : (
            linhas.map((l) => (
              <div key={l.id} className="np-item">
                <b>{l.produto.nome}</b>
                <span className="np-item__valor">{textoDosCentavos(l.produto.precoCentavos * l.quantidade)}</span>
                <span className="np-qtd">
                  <button type="button" aria-label={`Tirar um ${l.produto.nome}`} onClick={() => mudar(l.id, -1)}>
                    <Icone nome="menos" />
                  </button>
                  <span aria-label={`Quantidade de ${l.produto.nome}`}>{l.quantidade}</span>
                  <button type="button" aria-label={`Pôr mais um ${l.produto.nome}`} onClick={() => mudar(l.id, 1)}>
                    <Icone nome="mais" />
                  </button>
                </span>
                <span className="np-item__cada">{textoDosCentavos(l.produto.precoCentavos)} cada</span>
              </div>
            ))
          )}
        </div>
        <div className="np-total">
          <Campo
            rotulo="Observação (opcional)"
            explicacao="Um recado para a cozinha sobre este pedido."
            exemplo="sem cebola no lanche; trazer a bebida primeiro"
            value={observacao}
            maxLength={140}
            onChange={(e) => setObservacao(e.target.value)}
          />
          <div className="np-total__l">
            <span>Itens</span>
            <span data-testid="comanda-itens-valor">{textoDosCentavos(contas.itens)}</span>
          </div>
          <div className="np-total__l">
            <span>Serviço 10%</span>
            <span data-testid="comanda-servico">{textoDosCentavos(contas.servico)}</span>
          </div>
          <div className="np-total__l np-total__l--total">
            <span>Total</span>
            <span data-testid="comanda-total">{textoDosCentavos(contas.total)}</span>
          </div>
          <Botao disabled aria-describedby="np-aviso-e13">
            <Icone nome="enviar" />
            Enviar para a cozinha
          </Botao>
          <p className="np-aviso" id="np-aviso-e13">
            {AVISO_E13}
          </p>
        </div>
      </aside>

      <div className="np-resumo">
        <a href="#comanda" className="np-resumo__texto">
          <b>
            {titulo}, {itensTexto(contas.quantidade)}
          </b>
          <small>Total {textoDosCentavos(contas.total)} com serviço. Toque para ver a comanda.</small>
        </a>
        <Botao disabled aria-describedby="np-aviso-e13">
          <Icone nome="enviar" />
          Enviar
        </Botao>
      </div>
    </div>
  );
}
