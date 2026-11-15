"use client";

/**
 * Dados do catálogo de embalagens: busca na API, guarda e grava. Um só lugar fala com
 * /api/cadastros/embalagens; as telas só chamam `salvarModelo` e `recarregar`.
 * O servidor confere permissão e regra de novo em cada chamada (a tela só esconde botões).
 *
 * `ProvedorDoCatalogo` deixa os mesmos dados para vários blocos da tela (ex.: cada item do cadastro
 * rápido) sem buscar de novo; `useCatalogoCompartilhado` lê esses dados.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { chamar, type Resposta } from "../../chamar";
import type { UnidadePadrao } from "../auxiliares";
import type { ModeloDeEmbalagem } from "./contas";

export type FornecedorDoCatalogo = { id: number; nome: string; ativo: boolean };
/** Ingrediente como vem de GET /api/cadastros/ingredientes (só o que o catálogo usa). */
export type IngredienteDoCatalogo = {
  id: number;
  nome: string;
  ativo: boolean;
  conversoes: { id: number; nome: string; ativo: boolean; modeloId?: number | null }[];
};
/** Corpo de POST /api/cadastros/embalagens. Sem `id` cria; com `id` altera. */
export type CorpoDoModelo = { id?: number; tipo: string; tamanho: string | null; unidade: string | null; fornecedorId: number | null; ativo?: boolean };

export type Catalogo = {
  modelos: ModeloDeEmbalagem[];
  fornecedores: FornecedorDoCatalogo[];
  /** Só quando pedido (aba Embalagens): para dizer quais ingredientes usam cada modelo. */
  ingredientes: IngredienteDoCatalogo[];
  unidades: UnidadePadrao[];
  carregado: boolean;
  erro: string;
  recarregar: () => Promise<void>;
  salvarModelo: (corpo: CorpoDoModelo) => Promise<Resposta<ModeloDeEmbalagem>>;
};

export function usarCatalogo({ comIngredientes = false }: { comIngredientes?: boolean } = {}): Catalogo {
  const [modelos, setModelos] = useState<ModeloDeEmbalagem[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorDoCatalogo[]>([]);
  const [ingredientes, setIngredientes] = useState<IngredienteDoCatalogo[]>([]);
  const [unidades, setUnidades] = useState<UnidadePadrao[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState("");

  const recarregar = useCallback(async () => {
    const [m, f, i] = await Promise.all([
      chamar<ModeloDeEmbalagem[]>("/api/cadastros/embalagens"),
      chamar<FornecedorDoCatalogo[]>("/api/cadastros/fornecedores"),
      comIngredientes ? chamar<{ ingredientes: IngredienteDoCatalogo[]; unidades: UnidadePadrao[] }>("/api/cadastros/ingredientes") : Promise.resolve(null),
    ]);
    if (m.ok && m.dados) {
      setModelos(m.dados);
      setErro("");
    } else setErro(m.mensagem);
    if (f.ok && f.dados) setFornecedores(f.dados);
    if (i?.ok && i.dados) {
      setIngredientes(i.dados.ingredientes);
      setUnidades(i.dados.unidades);
    }
    setCarregado(true);
  }, [comIngredientes]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const salvarModelo = useCallback(
    async (corpo: CorpoDoModelo) => {
      const r = await chamar<ModeloDeEmbalagem>("/api/cadastros/embalagens", "POST", corpo);
      if (r.ok && r.dados) {
        const salvo = r.dados;
        // Mostra na hora; o recarregar traz o resto (contagem de uso, ordem do servidor).
        setModelos((lista) => (lista.some((x) => x.id === salvo.id) ? lista.map((x) => (x.id === salvo.id ? salvo : x)) : [...lista, salvo]));
        void recarregar();
      }
      return r;
    },
    [recarregar],
  );

  return { modelos, fornecedores, ingredientes, unidades, carregado, erro, recarregar, salvarModelo };
}

const ContextoDoCatalogo = createContext<Catalogo | null>(null);

export function ProvedorDoCatalogo({ catalogo, children }: { catalogo: Catalogo; children: ReactNode }) {
  return <ContextoDoCatalogo.Provider value={catalogo}>{children}</ContextoDoCatalogo.Provider>;
}

/** Os dados do provedor mais próximo. Sem provedor, um catálogo vazio que não quebra a tela. */
export function useCatalogoCompartilhado(): Catalogo {
  const c = useContext(ContextoDoCatalogo);
  return useMemo(
    () =>
      c ?? {
        modelos: [],
        fornecedores: [],
        ingredientes: [],
        unidades: [],
        carregado: false,
        erro: "",
        recarregar: async () => undefined,
        salvarModelo: async () => ({ ok: false, status: 0, dados: null, mensagem: "Catálogo indisponível nesta tela." }),
      },
    [c],
  );
}
