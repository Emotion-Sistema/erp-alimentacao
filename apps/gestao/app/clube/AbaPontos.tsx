"use client";

/**
 * Aba "Pontos e prêmios": pontos por real pago (0 a 100, com a frase "R$ 25,90 pago = 25 pontos"
 * calculada pela regra do servidor, `pontosDoPagamento`) e o catálogo de prêmios. Prêmio novo e
 * Editar abrem a janela; Desativar tem "Desfazer". Nada se apaga: inativos ficam esmaecidos no fim.
 */
import { useState } from "react";
import { Aviso, Botao, Icone, Selo } from "@erp/interface";
import { PONTOS_POR_REAL_MAXIMO, pontosDoPagamento, type Premio } from "@erp/dominio/clube";
import { textoDosCentavos } from "@erp/dominio/produtos";
import { chamar } from "../chamar";
import { Campo } from "../Campo";
import { inteiroDoTexto } from "./contas";
import { JanelaDoPremio } from "./JanelaDoPremio";
import type { PropsDaAba } from "./TelaDoClube";
import { TC } from "./textos";

const EXEMPLO_PAGO = 2590;

export function AbaPontos({ painel, podeGerenciar, avisar, recarregar }: PropsDaAba) {
  const [porReal, setPorReal] = useState(String(painel.regras.pontosPorReal));
  const [erro, setErro] = useState("");
  const [erroPremio, setErroPremio] = useState("");
  const [gravando, setGravando] = useState(false);
  const [janela, setJanela] = useState<{ premio?: Premio } | null>(null);
  const n = inteiroDoTexto(porReal, 0, PONTOS_POR_REAL_MAXIMO);
  const mudou = n !== painel.regras.pontosPorReal;
  const premios = [...painel.premios.filter((p) => p.ativo), ...painel.premios.filter((p) => !p.ativo)];
  const nomeDoProduto = (id: number | null) => (id === null ? null : (painel.produtos.find((p) => p.id === id)?.nome ?? null));

  async function salvarPontos() {
    setErro("");
    if (n === null) return setErro(TC.pontos.erro);
    setGravando(true);
    const r = await chamar("/api/clube/regras", "POST", { pontosPorReal: n });
    setGravando(false);
    if (!r.ok) return setErro(r.mensagem);
    avisar(TC.pontos.salvo);
    await recarregar();
  }

  async function mudarAtivo(p: Premio, ativo: boolean, desfazendo = false) {
    setErroPremio("");
    const r = await chamar<Premio>("/api/clube/premios", "POST", { id: p.id, ativo });
    if (!r.ok) return setErroPremio(r.mensagem);
    await recarregar();
    if (desfazendo) return avisar(`Pronto: ${p.nome} voltou.`);
    if (ativo) return avisar(`Prêmio ${p.nome} reativado.`);
    avisar(`Prêmio ${p.nome} desativado.`, { desfazer: () => void mudarAtivo(p, true, true), focar: true });
  }

  return (
    <>
      <section className="hor-secao" aria-labelledby="clube-pontos-titulo" data-testid="aba-pontos">
        <h2 id="clube-pontos-titulo">{TC.pontos.titulo}</h2>
        <p className="hor-secao__intro">{TC.pontos.intro}</p>
        <div className="hor-form">
          <Campo
            rotulo={TC.pontos.porReal}
            explicacao={TC.pontos.porRealAjuda}
            exemplo={TC.pontos.porRealExemplo}
            value={porReal}
            inputMode="numeric"
            maxLength={3}
            autoComplete="off"
            className="linha-editavel__numero"
            disabled={!podeGerenciar}
            onChange={(e) => setPorReal(e.target.value)}
          />
          <p className="clube__previa-frase" aria-live="polite" data-testid="frase-dos-pontos">
            {n === null ? TC.pontos.erro : TC.pontos.frase(textoDosCentavos(EXEMPLO_PAGO), pontosDoPagamento({ ligado: true, pontosPorReal: n }, EXEMPLO_PAGO))}
          </p>
          <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
          {podeGerenciar && (
            <div className="hor-secao__botoes">
              <Botao onClick={() => void salvarPontos()} disabled={!mudou || gravando}>
                {TC.pontos.salvar}
              </Botao>
            </div>
          )}
        </div>
      </section>
      <section className="hor-secao" aria-labelledby="clube-premios-titulo" data-testid="premios">
        <div className="hor-secao__cabeca">
          <h2 id="clube-premios-titulo">{TC.pontos.premios}</h2>
          {podeGerenciar && (
            <Botao onClick={() => setJanela({})} className="hor-secao__acao">
              <Icone nome="mais" />
              {TC.pontos.novo}
            </Botao>
          )}
        </div>
        <p className="hor-secao__intro">{TC.pontos.premiosIntro}</p>
        <div aria-live="polite">{erroPremio && <Aviso tipo="perigo">{erroPremio}</Aviso>}</div>
        {premios.length === 0 ? (
          <p className="hor-vazio">{TC.pontos.nenhum}</p>
        ) : (
          <ul className="hor-cats clube__lista">
            {premios.map((p) => {
              const produto = nomeDoProduto(p.produtoId);
              return (
                <li key={p.id} className="hor-cats__item">
                  <article className={["hor-cat", !p.ativo && "hor-cat--inativa"].filter(Boolean).join(" ")} data-testid={`premio-${p.nome}`}>
                    <header className="hor-cat__cabeca">
                      <h3 className="hor-cat__nome">{p.nome}</h3>
                      {!p.ativo && <Selo variante="alerta">{TC.pontos.desativado}</Selo>}
                    </header>
                    <div className="hor-cat__selos">
                      <Selo variante={p.ativo ? "info" : undefined} data-testid="pontos-do-premio">
                        {TC.pontos.pontosDoPremio(p.pontos)}
                      </Selo>
                      {produto && <Selo>{TC.pontos.produto(produto)}</Selo>}
                    </div>
                    {p.descricao && <p className="hor-cat__descricao">{p.descricao}</p>}
                    {podeGerenciar && (
                      <div className="hor-cat__acoes">
                        <Botao variante="secundario" aria-label={TC.pontos.editar(p.nome)} onClick={() => setJanela({ premio: p })}>
                          Editar
                        </Botao>
                        {p.ativo ? (
                          <Botao variante="secundario" aria-label={TC.pontos.desativar(p.nome)} onClick={() => void mudarAtivo(p, false)}>
                            Desativar
                          </Botao>
                        ) : (
                          <Botao variante="secundario" aria-label={TC.pontos.reativar(p.nome)} onClick={() => void mudarAtivo(p, true)}>
                            Reativar
                          </Botao>
                        )}
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {janela && (
        <JanelaDoPremio
          premio={janela.premio}
          produtos={painel.produtos}
          aoFechar={() => setJanela(null)}
          aoSalvo={(p, criado) => {
            setJanela(null);
            void recarregar();
            avisar(criado ? `Prêmio ${p.nome} criado.` : `Prêmio ${p.nome} salvo.`);
          }}
        />
      )}
    </>
  );
}
