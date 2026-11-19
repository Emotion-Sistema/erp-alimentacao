"use client";

/**
 * Janela "Agendar campanha" (ou editar uma agendada): título (até 50), texto (até 180, com
 * contador), público, loja (escondida quando só há uma) e dia e hora (`datetime-local`, valor
 * "AAAA-MM-DDTHH:MM" enviado como `enviarEm`, na hora local da loja). Mostra como a notificação
 * aparece no celular. Grava em POST /api/clube/campanhas; casa aberta, prazo e limite da semana
 * quem confere é o servidor, e a mensagem dele aparece aqui.
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao } from "@erp/interface";
import { NOME_DO_PUBLICO, PUBLICOS, type Campanha, type Publico } from "@erp/dominio/clube";
import { chamar } from "../chamar";
import { AreaDeTexto, BotaoExemplos, Campo, Selecao } from "../Campo";
import { JanelaModal, usarPedirFechar } from "../cadastros/JanelaModal";
import type { PainelDoClube } from "./contas";
import { TC } from "./textos";

const TITULO_MAXIMO = 50;
const TEXTO_MAXIMO = 180;

function BotaoCancelar() {
  const pedirFechar = usarPedirFechar();
  return (
    <Botao variante="secundario" onClick={pedirFechar}>
      {TC.campanha.cancelar}
    </Botao>
  );
}

export function JanelaDaCampanha({
  campanha,
  unidades,
  aoFechar,
  aoSalvo,
}: {
  campanha?: Campanha;
  unidades: PainelDoClube["unidades"];
  aoFechar: () => void;
  aoSalvo: (c: Campanha, criada: boolean) => void;
}) {
  const [sujo, setSujo] = useState(false);
  const [titulo, setTitulo] = useState(campanha?.titulo ?? "");
  const [texto, setTexto] = useState(campanha?.texto ?? "");
  const [publico, setPublico] = useState<Publico>(campanha?.publico ?? "todos");
  const [unidade, setUnidade] = useState(String(campanha?.unidadeId ?? unidades[0]?.id ?? ""));
  const [quando, setQuando] = useState(campanha?.enviarEm ?? "");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (titulo.trim().length < 2) return setErro(TC.campanha.erroTitulo);
    if (texto.trim().length < 2) return setErro(TC.campanha.erroTexto);
    if (!quando) return setErro(TC.campanha.erroQuando);
    setGravando(true);
    const r = await chamar<Campanha>("/api/clube/campanhas", "POST", {
      ...(campanha ? { id: campanha.id } : {}),
      unidadeId: Number(unidade),
      titulo: titulo.trim(),
      texto: texto.trim(),
      publico,
      enviarEm: quando.slice(0, 16),
    });
    setGravando(false);
    if (!r.ok || !r.dados) return setErro(r.mensagem);
    aoSalvo(r.dados, !campanha);
  }

  return (
    <JanelaModal titulo={campanha ? TC.campanha.editar(campanha.titulo) : TC.campanha.nova} sujo={sujo} aoMexer={() => setSujo(true)} aoFechar={aoFechar} data-testid="janela-campanha">
      <BotaoExemplos />
      <form className="hor-form" onSubmit={(e) => void salvar(e)} noValidate>
        <div className="clube__com-contador">
          <Campo rotulo={TC.campanha.titulo} explicacao={TC.campanha.tituloAjuda} exemplo={TC.campanha.tituloExemplo} value={titulo} maxLength={TITULO_MAXIMO} autoComplete="off" required onChange={(e) => setTitulo(e.target.value)} />
          <p className="clube__contador">{TC.campanha.contador(titulo.length, TITULO_MAXIMO)}</p>
        </div>
        <div className="clube__com-contador">
          <AreaDeTexto rotulo={TC.campanha.texto} explicacao={TC.campanha.textoAjuda} exemplo={TC.campanha.textoExemplo} value={texto} maxLength={TEXTO_MAXIMO} rows={3} onChange={(e) => setTexto(e.target.value)} />
          <p className="clube__contador" aria-live="polite" data-testid="contador-do-texto">
            {TC.campanha.contador(texto.length, TEXTO_MAXIMO)}
          </p>
        </div>
        <Selecao
          rotulo={TC.campanha.publico}
          explicacao={TC.campanha.publicoAjuda}
          exemplo={TC.campanha.publicoExemplo}
          opcoes={PUBLICOS.map((p) => ({ valor: p, texto: NOME_DO_PUBLICO[p] }))}
          value={publico}
          onChange={(e) => setPublico(e.target.value as Publico)}
        />
        {unidades.length > 1 && (
          <Selecao
            rotulo={TC.campanha.unidade}
            explicacao={TC.campanha.unidadeAjuda}
            exemplo={TC.campanha.unidadeExemplo}
            opcoes={unidades.map((u) => ({ valor: String(u.id), texto: u.nome }))}
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
          />
        )}
        <Campo rotulo={TC.campanha.quando} explicacao={TC.campanha.quandoAjuda} exemplo={TC.campanha.quandoExemplo} type="datetime-local" value={quando} step={60} onChange={(e) => setQuando(e.target.value)} />
        <figure className="clube__celular" aria-label={TC.campanha.previa} data-testid="previa-da-notificacao">
          <figcaption className="clube__celular-legenda">{TC.campanha.previa}</figcaption>
          <div className="clube__notificacao">
            <p className="clube__notificacao-app">
              <span>{TC.campanha.app}</span>
              <span>{TC.campanha.agora}</span>
            </p>
            <p className="clube__notificacao-titulo">{titulo.trim() || TC.campanha.previaTitulo}</p>
            <p className="clube__notificacao-texto">{texto.trim() || TC.campanha.previaTexto}</p>
          </div>
        </figure>
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={gravando}>
            {campanha ? TC.campanha.salvar : TC.campanha.agendar}
          </Botao>
          <BotaoCancelar />
        </div>
      </form>
    </JanelaModal>
  );
}
