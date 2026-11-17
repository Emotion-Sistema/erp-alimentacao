"use client";

/**
 * Janela "Pausar agora": o quê (Tudo / Só a loja / Só o delivery / Uma categoria num canal), por
 * quanto tempo (15 min, 30 min, 1 h, 2 h, Até eu retomar) e o motivo (obrigatório; as sugestões
 * tocáveis preenchem o campo). Grava em /api/horarios/pausas.
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao } from "@erp/interface";
import { CANAIS, NOME_DO_CANAL, type Canal } from "@erp/dominio/horarios";
import { Campo, Grupo, OpcaoDoGrupo, Selecao } from "../../Campo";
import { JanelaModal, usarPedirFechar } from "../JanelaModal";
import { DURACOES, nomeDoAlvo, type Categoria } from "./contas";
import type { Gravar } from "./usarHorarios";
import { T } from "./textos";

type OQue = "tudo" | "loja" | "delivery" | "categoria";

function BotaoCancelar() {
  const pedirFechar = usarPedirFechar();
  return (
    <Botao variante="secundario" onClick={pedirFechar}>
      {T.janelaPausa.cancelar}
    </Botao>
  );
}

export function JanelaPausa({
  categorias,
  gravar,
  aoFechar,
  aoSalvo,
}: {
  categorias: Categoria[];
  gravar: Gravar;
  aoFechar: () => void;
  aoSalvo: (alvo: string) => void;
}) {
  const ativas = categorias.filter((c) => c.ativo);
  const [sujo, setSujo] = useState(false);
  const [oque, setOque] = useState<OQue>("delivery");
  const [categoriaId, setCategoriaId] = useState<number | null>(ativas[0]?.id ?? null);
  const [canal, setCanal] = useState<Canal>("delivery");
  const [duracao, setDuracao] = useState<string>("30");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  async function pausar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (motivo.trim().length < 2) return setErro(T.janelaPausa.faltaMotivo);
    if (oque === "categoria" && categoriaId === null) return setErro("Escolha a categoria.");
    const canalDaPausa: Canal | null = oque === "tudo" ? null : oque === "categoria" ? canal : oque;
    const cat = oque === "categoria" ? categoriaId : null;
    setGravando(true);
    const r = await gravar("/api/horarios/pausas", {
      canal: canalDaPausa,
      categoriaId: cat,
      minutos: DURACOES.find((d) => d.valor === duracao)?.minutos ?? null,
      motivo: motivo.trim(),
    });
    setGravando(false);
    if (!r.ok) return setErro(r.mensagem);
    aoSalvo(nomeDoAlvo(canalDaPausa, cat, categorias));
  }

  const opcoes: OQue[] = ["tudo", "loja", "delivery", "categoria"];

  return (
    <JanelaModal titulo={T.janelaPausa.titulo} sujo={sujo} aoMexer={() => setSujo(true)} aoFechar={aoFechar} data-testid="janela-pausa">
      <form className="hor-form" onSubmit={(e) => void pausar(e)} noValidate>
        <Grupo legenda={T.janelaPausa.oQue} explicacao={T.janelaPausa.oQueAjuda} exemplo={T.janelaPausa.oQueExemplo} className="hor-escolhas">
          {opcoes.map((o) => (
            <OpcaoDoGrupo key={o} tipo="radio" name="o-que" rotulo={T.janelaPausa.opcoes[o]} className="hor-escolha" checked={oque === o} onChange={() => setOque(o)} />
          ))}
        </Grupo>
        {oque === "categoria" && (
          <div className="cadastros__form-linha">
            <Selecao
              rotulo={T.janelaData.categoria}
              explicacao={T.janelaPausa.categoriaAjuda}
              exemplo={T.janelaPausa.categoriaExemplo}
              opcoes={ativas.map((c) => ({ valor: String(c.id), texto: c.nome }))}
              value={categoriaId === null ? "" : String(categoriaId)}
              onChange={(e) => setCategoriaId(Number(e.target.value))}
            />
            <Selecao
              rotulo={T.janelaData.canal}
              explicacao={T.janelaPausa.canalAjuda}
              exemplo={T.janelaPausa.canalExemplo}
              opcoes={CANAIS.map((c) => ({ valor: c, texto: NOME_DO_CANAL[c] }))}
              value={canal}
              onChange={(e) => setCanal(e.target.value as Canal)}
            />
          </div>
        )}
        <Grupo legenda={T.janelaPausa.tempo} explicacao={T.janelaPausa.tempoAjuda} exemplo={T.janelaPausa.tempoExemplo} className="hor-escolhas">
          {DURACOES.map((d) => (
            <OpcaoDoGrupo key={d.valor} tipo="radio" name="duracao" rotulo={d.texto} className="hor-escolha" checked={duracao === d.valor} onChange={() => setDuracao(d.valor)} />
          ))}
        </Grupo>
        <Campo
          rotulo={T.janelaPausa.motivo}
          explicacao={T.janelaPausa.motivoAjuda}
          exemplo={T.janelaPausa.motivoExemplo}
          value={motivo}
          maxLength={120}
          onChange={(e) => setMotivo(e.target.value)}
          required
        />
        <div className="hor-sugestoes" role="group" aria-label={T.janelaPausa.sugestoesRotulo}>
          {T.janelaPausa.sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              className="emb-chip"
              aria-pressed={motivo === s}
              onClick={() => {
                setMotivo(s);
                setSujo(true);
              }}
            >
              <span>{s}</span>
            </button>
          ))}
        </div>
        <div aria-live="polite">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={gravando}>
            {T.janelaPausa.confirmar}
          </Botao>
          <BotaoCancelar />
        </div>
      </form>
    </JanelaModal>
  );
}
