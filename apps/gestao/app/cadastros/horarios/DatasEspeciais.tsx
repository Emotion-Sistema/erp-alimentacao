"use client";

/**
 * "Datas especiais": as próximas datas (da loja inteira e de canal ou categoria), com selo "Fechado"
 * ou o horário, o motivo e "Cancelar" (pede confirmação; cancelar desativa, nada se apaga).
 * "Nova data especial" abre a janela.
 */
import { useState } from "react";
import { Aviso, Botao, Icone, Selo } from "@erp/interface";
import { horaCurta } from "@erp/dominio/horarios";
import { dataCurta, datasEmOrdem, nomeDoAlvo, type Categoria, type Horarios, type ItemDeData } from "./contas";
import { JanelaDataEspecial } from "./JanelaDataEspecial";
import type { Gravar } from "./usarHorarios";
import { T } from "./textos";

const chave = (i: ItemDeData) => `${i.tipo}-${i.id}`;

function alvoDe(i: ItemDeData, categorias: Categoria[]): string {
  return i.tipo === "unidade" ? T.datas.lojaInteira : nomeDoAlvo(i.item.canal, i.item.categoriaId, categorias);
}

function SeloDoHorario({ i }: { i: ItemDeData }) {
  if (i.tipo === "unidade") {
    const d = i.item;
    return d.aberta && d.abre && d.ultimoPedido && d.fecha ? (
      <Selo variante="info" icone="relogio">
        {T.datas.horarioLoja(horaCurta(d.abre), horaCurta(d.ultimoPedido), horaCurta(d.fecha))}
      </Selo>
    ) : (
      <Selo variante="perigo">{T.datas.fechado}</Selo>
    );
  }
  const d = i.item;
  return d.modo === "aberto" && d.inicio && d.fim ? (
    <Selo variante="info" icone="relogio">
      {T.datas.horario(horaCurta(d.inicio), horaCurta(d.fim))}
    </Selo>
  ) : (
    <Selo variante="perigo">{T.datas.fechado}</Selo>
  );
}

export function DatasEspeciais({
  horarios,
  categorias,
  podeMudar,
  gravar,
  avisar,
}: {
  horarios: Horarios;
  categorias: Categoria[];
  podeMudar: boolean;
  gravar: Gravar;
  avisar: (texto: string) => void;
}) {
  const [janela, setJanela] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const itens = datasEmOrdem(horarios);

  async function cancelar(i: ItemDeData) {
    setErro("");
    const r = await gravar("/api/horarios/datas/cancelar", { tipo: i.tipo, id: i.id });
    setConfirmando(null);
    if (!r.ok) return setErro(r.mensagem);
    avisar(T.datas.cancelada(dataCurta(i.data)));
  }

  return (
    <section className="hor-secao" aria-labelledby="hor-datas-titulo" data-testid="datas-especiais">
      <div className="hor-secao__cabeca">
        <h2 id="hor-datas-titulo">{T.datas.titulo}</h2>
        {podeMudar && (
          <Botao onClick={() => setJanela(true)} className="hor-secao__acao">
            <Icone nome="calendario" />
            {T.datas.nova}
          </Botao>
        )}
      </div>
      <p className="hor-secao__intro">{T.datas.explicacao}</p>
      <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
      {itens.length === 0 ? (
        <p className="hor-vazio">{T.datas.nenhuma}</p>
      ) : (
        <ul className="hor-lista">
          {itens.map((i) => {
            const quando = dataCurta(i.data);
            const alvo = alvoDe(i, categorias);
            return (
              <li key={chave(i)} className="hor-item" data-testid={`data-${i.data}-${i.tipo === "unidade" ? "loja-inteira" : `${i.item.canal}-${i.item.categoriaId ?? "canal"}`}`}>
                <div className="hor-item__linha">
                  <span className="hor-item__quando">
                    <Icone nome="calendario" />
                    {quando}
                  </span>
                  <Selo>{alvo}</Selo>
                  <SeloDoHorario i={i} />
                </div>
                <p className="hor-item__motivo">{i.item.motivo}</p>
                {podeMudar &&
                  (confirmando === chave(i) ? (
                    <div className="hor-confirmar" role="alertdialog" aria-label={T.datas.confirmar(quando, alvo)}>
                      <p>{T.datas.confirmar(quando, alvo)}</p>
                      <div className="cadastros__botoes">
                        <Botao variante="perigo" onClick={() => void cancelar(i)}>
                          {T.datas.simCancelar}
                        </Botao>
                        <Botao variante="secundario" onClick={() => setConfirmando(null)}>
                          {T.datas.nao}
                        </Botao>
                      </div>
                    </div>
                  ) : (
                    <div className="hor-item__acoes">
                      <Botao variante="secundario" aria-label={T.datas.cancelar(quando)} onClick={() => setConfirmando(chave(i))}>
                        Cancelar
                      </Botao>
                    </div>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {janela && (
        <JanelaDataEspecial
          horarios={horarios}
          categorias={categorias}
          gravar={gravar}
          aoFechar={() => setJanela(false)}
          aoSalvo={(data) => {
            setJanela(false);
            avisar(T.datas.salva(dataCurta(data)));
          }}
        />
      )}
    </section>
  );
}
