"use client";

/**
 * Histórico de versões da ficha aberta. Cada versão antiga abre por GET /api/fichas/versao/[id] e é
 * comparada com a atual por `compararVersoes` (a mesma função do domínio): o que entrou, saiu ou
 * mudou, cada linha com ícone e palavra (nunca só a cor).
 */
import { useState } from "react";
import { Aviso, Botao, Icone, Selo, type NomeDeIcone, type VarianteDoSelo } from "@erp/interface";
import type { FichaCompleta } from "@erp/dominio";
import { compararVersoes, type MudancaDaFicha, type VersaoDaFicha } from "@erp/dominio/fichas";
import { chamar } from "../../chamar";
import { quando, quantidadeLegivel } from "./contas";
import { TF } from "./textos";

const H = TF.historico;

const JEITO: Record<MudancaDaFicha["tipo"], { icone: NomeDeIcone; selo: VarianteDoSelo; texto: string }> = {
  entrou: { icone: "mais", selo: "sucesso", texto: H.entrou },
  saiu: { icone: "fechar", selo: "perigo", texto: H.saiu },
  mudou: { icone: "desfazer", selo: "info", texto: H.mudou },
};

export function HistoricoDaFicha({ ficha }: { ficha: FichaCompleta }) {
  const [aberta, setAberta] = useState<VersaoDaFicha | null>(null);
  const [carregando, setCarregando] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const atual = ficha.versao;

  async function abrir(id: number) {
    setErro("");
    setCarregando(id);
    const r = await chamar<VersaoDaFicha>(`/api/fichas/versao/${id}`);
    setCarregando(null);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    setAberta(r.dados);
  }

  const mudancas = aberta && atual ? compararVersoes(aberta, atual) : [];

  return (
    <section className="hor-secao" aria-labelledby="ficha-historico" data-testid="historico">
      <h2 id="ficha-historico">{H.titulo}</h2>
      <p className="hor-secao__intro">{H.intro}</p>
      <ol className="fichas-historico">
        {ficha.historico.map((h) => {
          const ehAtual = atual?.id === h.id;
          return (
            <li key={h.id} className="fichas-historico__item" data-testid={`versao-${h.numero}`}>
              <div className="fichas-historico__texto">
                <span className="linha-editavel__titulo">
                  {H.versao(h.numero)} {ehAtual && <Selo variante="info">{H.atual}</Selo>}
                </span>
                <span className="linha-editavel__detalhe">{H.quem(h.criadaPor, quando(h.criadaEm))}</span>
                <span className="linha-editavel__detalhe">{h.motivo ?? H.semMotivo}</span>
              </div>
              {!ehAtual && atual && (
                <Botao variante="secundario" aria-label={H.comparar(h.numero)} disabled={carregando === h.id} onClick={() => void abrir(h.id)}>
                  {carregando === h.id ? H.carregando : H.compararCurto}
                </Botao>
              )}
            </li>
          );
        })}
      </ol>
      <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
      {aberta && atual && (
        <div className="fichas-comparar" data-testid="comparacao">
          <div className="fichas-comparar__cabeca">
            <h3>{H.comparando(aberta.numero, atual.numero)}</h3>
            <Botao variante="secundario" onClick={() => setAberta(null)}>
              <Icone nome="fechar" />
              {H.fechar}
            </Botao>
          </div>
          {mudancas.length === 0 ? (
            <p className="hor-vazio">{H.igual}</p>
          ) : (
            <ul className="fichas-mudancas">
              {mudancas.map((m, k) => {
                const j = JEITO[m.tipo];
                return (
                  <li key={k} className={`fichas-mudancas__item fichas-mudancas__item--${m.tipo}`} data-tipo={m.tipo}>
                    <Selo variante={j.selo} icone={j.icone}>
                      {j.texto}
                    </Selo>
                    <span>{m.texto}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <details className="fichas-comparar__antiga">
            <summary>{H.itensDaAntiga(aberta.numero)}</summary>
            <ul>
              {aberta.itens.map((i) => (
                <li key={i.ordem}>
                  {i.nome}: {i.quantidade === null ? TF.ficha.semQuantidade : quantidadeLegivel(i.quantidade, i.unidade)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
