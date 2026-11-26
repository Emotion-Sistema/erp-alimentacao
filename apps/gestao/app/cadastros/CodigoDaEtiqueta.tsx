"use client";

/**
 * Código da etiqueta do lote (ideia nº 16, versão 1): o campo "Código da etiqueta" e a chave "Usa
 * etiqueta", no cadastro do ingrediente e no preparo da casa. Grava em POST /api/cadastros/etiqueta,
 * mandando só o que mudou. O servidor confere a permissão (cadastros.gerenciar), o formato e se o
 * código já é de outro produto; a mensagem dele aparece como veio.
 */
import { useState } from "react";
import { Aviso, Botao, Dado, FichaDeDados } from "@erp/interface";
import { Campo, Marcador } from "../Campo";
import { chamar } from "../chamar";
import { TEXTOS_DA_ETIQUETA as T } from "./textos-da-etiqueta";

export type EtiquetaDoCadastro = { codigo: string; usaEtiqueta: boolean };
export type AlvoDaEtiqueta = { ingredienteId: number } | { preparoId: number };

/** Mesmo formato do servidor (2 a 5, começa com letra). Só para avisar antes; quem decide é o servidor. */
const FORMATO = /^[A-Z][A-Z0-9]{1,4}$/;
/** Como a pessoa digita vira como fica: maiúsculas e sem espaço. */
export const limparCodigo = (v: string) => v.replace(/\s+/g, "").toUpperCase();

/** O que mudou em relação ao gravado (vazio = nada a mandar). Erro de formato vem em `erro`. */
export function mudancasDaEtiqueta(antes: { codigo: string | null; usaEtiqueta: boolean }, depois: EtiquetaDoCadastro): { corpo: Partial<EtiquetaDoCadastro>; erro: string } {
  const corpo: Partial<EtiquetaDoCadastro> = {};
  const codigo = limparCodigo(depois.codigo);
  if (codigo !== (antes.codigo ?? "")) {
    if (!FORMATO.test(codigo)) return { corpo, erro: T.formato };
    corpo.codigo = codigo;
  }
  if (depois.usaEtiqueta !== antes.usaEtiqueta) corpo.usaEtiqueta = depois.usaEtiqueta;
  return { corpo, erro: "" };
}

/** Grava o que mudou. Devolve a mensagem de erro do servidor ou "" (também quando não havia nada). */
export async function gravarEtiqueta(alvo: AlvoDaEtiqueta, corpo: Partial<EtiquetaDoCadastro>): Promise<string> {
  if (corpo.codigo === undefined && corpo.usaEtiqueta === undefined) return "";
  const r = await chamar("/api/cadastros/etiqueta", "POST", { ...alvo, ...corpo });
  return r.ok ? "" : r.mensagem;
}

/** Os dois campos, controlados por quem usa (o formulário do ingrediente grava junto com o resto). */
export function CamposDaEtiqueta({ valor, aoMudar }: { valor: EtiquetaDoCadastro; aoMudar: (v: EtiquetaDoCadastro) => void }) {
  return (
    <div className="cadastros__form-linha" data-testid="campos-da-etiqueta">
      <Campo
        rotulo={T.codigo}
        explicacao={T.codigoAjuda}
        exemplo={T.codigoExemplo}
        value={valor.codigo}
        maxLength={5}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="cadastros__codigo-etiqueta"
        onChange={(e) => aoMudar({ ...valor, codigo: limparCodigo(e.target.value) })}
      />
      <Marcador rotulo={T.usa} explicacao={T.usaAjuda} exemplo={T.usaExemplo} checked={valor.usaEtiqueta} onChange={(e) => aoMudar({ ...valor, usaEtiqueta: e.target.checked })} />
    </div>
  );
}

/**
 * Bloco próprio, com botão de salvar (no preparo da casa, tela da ficha). Quem só consulta vê o
 * código e se usa etiqueta.
 */
export function BlocoDaEtiqueta({ alvo, atual, podeGerenciar, aoGravado }: { alvo: AlvoDaEtiqueta; atual: { codigo: string | null; usaEtiqueta: boolean }; podeGerenciar: boolean; aoGravado: () => Promise<void> | void }) {
  const [valor, setValor] = useState<EtiquetaDoCadastro>({ codigo: atual.codigo ?? "", usaEtiqueta: atual.usaEtiqueta });
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function salvar() {
    setErro("");
    setFeito("");
    const m = mudancasDaEtiqueta(atual, valor);
    if (m.erro) return setErro(m.erro);
    setOcupado(true);
    const falha = await gravarEtiqueta(alvo, m.corpo);
    setOcupado(false);
    if (falha) return setErro(falha);
    setFeito(T.salvo);
    await aoGravado();
  }

  return (
    <section className="hor-secao" aria-labelledby="etiqueta-do-lote" data-testid="etiqueta-do-preparo">
      <h2 id="etiqueta-do-lote">{T.titulo}</h2>
      <p className="hor-secao__intro">{T.intro}</p>
      {podeGerenciar ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
          noValidate
        >
          <CamposDaEtiqueta valor={valor} aoMudar={setValor} />
          <div aria-live="polite">
            {erro && <Aviso tipo="perigo">{erro}</Aviso>}
            {feito && <Aviso tipo="sucesso">{feito}</Aviso>}
          </div>
          <div className="hor-secao__botoes">
            <Botao type="submit" variante="secundario" disabled={ocupado} aria-busy={ocupado}>
              {ocupado ? T.salvando : T.salvar}
            </Botao>
          </div>
        </form>
      ) : (
        <FichaDeDados>
          <Dado rotulo={T.codigo}>{atual.codigo ?? T.semCodigo}</Dado>
          <Dado rotulo={T.usa}>{atual.usaEtiqueta ? "Sim" : T.naoUsa}</Dado>
        </FichaDeDados>
      )}
    </section>
  );
}
