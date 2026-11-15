"use client";

/**
 * Campos de digitar e escolher com AJUDA embaixo (padrão do sistema, decisão 0012, 15/11/2026).
 * Todo campo mostra: (a) uma linha de explicação sempre visível; (b) um botão "Ver exemplo"
 * que abre e fecha um exemplo. O botão "Mostrar todos os exemplos" (BotaoExemplos), no topo
 * da tela, abre ou fecha todos de uma vez e a escolha fica guardada neste aparelho.
 * Nenhum campo novo deve usar <input>, <select> ou <textarea> solto: use estes componentes.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const CHAVE_GUARDADA = "erp.exemplos.todos";

type Contexto = { todos: boolean; geracao: number; definir: (valor: boolean) => void };
const ContextoDeAjuda = createContext<Contexto>({ todos: false, geracao: 0, definir: () => undefined });

/** Guarda a escolha "mostrar todos os exemplos" (por aparelho). Sem armazenamento, funciona igual, só não lembra. */
export function ProvedorDeAjuda({ children }: { children: ReactNode }) {
  const [todos, setTodos] = useState(false);
  const [geracao, setGeracao] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CHAVE_GUARDADA) === "1") setTodos(true);
    } catch {
      /* sem armazenamento: segue sem lembrar */
    }
  }, []);

  const definir = useCallback((valor: boolean) => {
    setTodos(valor);
    setGeracao((g) => g + 1);
    try {
      window.localStorage.setItem(CHAVE_GUARDADA, valor ? "1" : "0");
    } catch {
      /* idem */
    }
  }, []);

  const valor = useMemo(() => ({ todos, geracao, definir }), [todos, geracao, definir]);
  return <ContextoDeAjuda.Provider value={valor}>{children}</ContextoDeAjuda.Provider>;
}

/** Botão do topo das telas com formulário. */
export function BotaoExemplos() {
  const { todos, definir } = useContext(ContextoDeAjuda);
  return (
    <p className="ajuda__todos">
      <button type="button" className="ajuda__botao-todos" data-testid="exemplos-todos" onClick={() => definir(!todos)}>
        {todos ? "Esconder todos os exemplos" : "Mostrar todos os exemplos"}
      </button>
    </p>
  );
}

type TextoDeAjuda = {
  /** Uma linha curta: para que serve o campo e como preencher. */
  explicacao: string;
  /** Exemplo rápido, com dados inventados. Fica escondido até a pessoa pedir. */
  exemplo: string;
};

function useAbertura() {
  const { todos, geracao } = useContext(ContextoDeAjuda);
  // Um toque individual vale até a próxima escolha do botão "todos".
  const [local, setLocal] = useState<{ geracao: number; aberto: boolean } | null>(null);
  const aberto = local && local.geracao === geracao ? local.aberto : todos;
  return { aberto, alternar: () => setLocal({ geracao, aberto: !aberto }) };
}

/** Explicação + botão + exemplo. `id` é a base dos ids ligados ao campo. */
function Ajuda({
  id,
  rotulo,
  explicacao,
  exemplo,
  aberto,
  alternar,
}: TextoDeAjuda & {
  id: string;
  rotulo: string;
  aberto: boolean;
  alternar: () => void;
}) {
  return (
    <div className="ajuda">
      <p id={`${id}-explicacao`} className="ajuda__explicacao">
        {explicacao}
      </p>
      <button type="button" className="ajuda__botao" aria-expanded={aberto} aria-controls={`${id}-exemplo`} onClick={alternar}>
        {aberto ? "Esconder exemplo" : "Ver exemplo"}
        <span className="ajuda__so-leitor"> de {rotulo}</span>
      </button>
      <p id={`${id}-exemplo`} className="ajuda__exemplo" hidden={!aberto}>
        <strong>Exemplo:</strong> {exemplo}
      </p>
    </div>
  );
}

/** Liga o campo à explicação (e ao exemplo, quando aberto). */
const ligacao = (id: string, aberto: boolean) => (aberto ? `${id}-explicacao ${id}-exemplo` : `${id}-explicacao`);

export type CampoProps = Omit<InputHTMLAttributes<HTMLInputElement>, "aria-describedby"> & { rotulo: string } & TextoDeAjuda;

export function Campo({ rotulo, explicacao, exemplo, id, className, ...resto }: CampoProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const { aberto, alternar } = useAbertura();
  return (
    <div className="erp-campo" data-campo-ajuda>
      <label className="erp-campo__rotulo" htmlFor={idCampo}>
        {rotulo}
      </label>
      <input id={idCampo} className={["erp-campo__entrada", className].filter(Boolean).join(" ")} aria-describedby={ligacao(idCampo, aberto)} {...resto} />
      <Ajuda id={idCampo} rotulo={rotulo} explicacao={explicacao} exemplo={exemplo} aberto={aberto} alternar={alternar} />
    </div>
  );
}

export type SelecaoProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "aria-describedby"> & {
  rotulo: string;
  opcoes: { valor: string; texto: string }[];
} & TextoDeAjuda;

export function Selecao({ rotulo, opcoes, explicacao, exemplo, id, className, ...resto }: SelecaoProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const { aberto, alternar } = useAbertura();
  return (
    <div className="erp-campo" data-campo-ajuda>
      <label className="erp-campo__rotulo" htmlFor={idCampo}>
        {rotulo}
      </label>
      <select id={idCampo} className={["erp-campo__entrada", className].filter(Boolean).join(" ")} aria-describedby={ligacao(idCampo, aberto)} {...resto}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      <Ajuda id={idCampo} rotulo={rotulo} explicacao={explicacao} exemplo={exemplo} aberto={aberto} alternar={alternar} />
    </div>
  );
}

export type AreaDeTextoProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "aria-describedby"> & { rotulo: string } & TextoDeAjuda;

export function AreaDeTexto({ rotulo, explicacao, exemplo, id, className, ...resto }: AreaDeTextoProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const { aberto, alternar } = useAbertura();
  return (
    <div className="erp-campo" data-campo-ajuda>
      <label className="erp-campo__rotulo" htmlFor={idCampo}>
        {rotulo}
      </label>
      <textarea id={idCampo} className={["erp-campo__entrada", className].filter(Boolean).join(" ")} aria-describedby={ligacao(idCampo, aberto)} {...resto} />
      <Ajuda id={idCampo} rotulo={rotulo} explicacao={explicacao} exemplo={exemplo} aberto={aberto} alternar={alternar} />
    </div>
  );
}

/** Caixa de marcar ou botão de escolha SOZINHO (com a sua própria ajuda). Em conjunto, use Grupo + OpcaoDoGrupo. */
export function Marcador({
  rotulo,
  explicacao,
  exemplo,
  tipo = "checkbox",
  id,
  className,
  ...resto
}: Omit<InputHTMLAttributes<HTMLInputElement>, "aria-describedby" | "type"> & { rotulo: string; tipo?: "checkbox" | "radio" } & TextoDeAjuda) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const { aberto, alternar } = useAbertura();
  return (
    <div className="ajuda__marcador" data-campo-ajuda>
      <label className={className ?? "cadastros__opcao"}>
        <input id={idCampo} type={tipo} aria-describedby={ligacao(idCampo, aberto)} {...resto} />
        {rotulo}
      </label>
      <Ajuda id={idCampo} rotulo={rotulo} explicacao={explicacao} exemplo={exemplo} aberto={aberto} alternar={alternar} />
    </div>
  );
}

const ContextoDoGrupo = createContext<string | null>(null);

/** Conjunto de opções (várias caixas ou escolhas) com UMA ajuda para o conjunto. */
export function Grupo({
  legenda,
  explicacao,
  exemplo,
  children,
  className,
  ajudaNoTopo,
}: {
  legenda: string;
  children: ReactNode;
  className?: string;
  /** Mostra a explicação logo abaixo do título (útil quando o conjunto é longo). */
  ajudaNoTopo?: boolean;
} & TextoDeAjuda) {
  const id = useId();
  const { aberto, alternar } = useAbertura();
  return (
    <fieldset className={className} data-campo-ajuda aria-describedby={ligacao(id, aberto)}>
      <legend>{legenda}</legend>
      {ajudaNoTopo && <Ajuda id={id} rotulo={legenda} explicacao={explicacao} exemplo={exemplo} aberto={aberto} alternar={alternar} />}
      <ContextoDoGrupo.Provider value={ligacao(id, aberto)}>{children}</ContextoDoGrupo.Provider>
      {!ajudaNoTopo && <Ajuda id={id} rotulo={legenda} explicacao={explicacao} exemplo={exemplo} aberto={aberto} alternar={alternar} />}
    </fieldset>
  );
}

/** Opção dentro de um Grupo: usa a explicação do grupo. */
export function OpcaoDoGrupo({
  rotulo,
  tipo = "checkbox",
  className,
  conteudo,
  ...resto
}: Omit<InputHTMLAttributes<HTMLInputElement>, "aria-describedby" | "type"> & {
  rotulo: string;
  tipo?: "checkbox" | "radio";
  /** Conteúdo visual no lugar do texto simples (cartão selecionável). O nome acessível continua sendo o rótulo. */
  conteudo?: ReactNode;
}) {
  const descricao = useContext(ContextoDoGrupo);
  if (descricao === null) throw new Error("OpcaoDoGrupo só pode ser usada dentro de Grupo");
  return (
    <label className={className}>
      <input type={tipo} aria-describedby={descricao} aria-label={conteudo ? rotulo : undefined} {...resto} />
      {conteudo ?? rotulo}
    </label>
  );
}
