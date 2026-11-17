"use client";

/**
 * Único lugar que fala com /api/horarios (e lê /api/cadastros/categorias para os nomes).
 * Toda gravação devolve o objeto Horarios inteiro, que troca o que a tela mostra.
 * A cada 60 s busca de novo só para atualizar a faixa "Agora" e as pausas (que vencem sozinhas):
 * o que a pessoa está editando não é tocado (cada grade guarda o próprio rascunho e só recomeça
 * quando o que está gravado para ela muda).
 * O servidor confere permissão e regra em cada chamada; a tela só esconde botões.
 */
import { useCallback, useEffect, useState } from "react";
import { chamar, type Resposta } from "../../chamar";
import type { Categoria, Horarios } from "./contas";

export type Gravar = (caminho: string, corpo: unknown) => Promise<Resposta<Horarios>>;

export type DadosDeHorarios = {
  horarios: Horarios | null;
  categorias: Categoria[];
  erro: string;
  /** Hora local (deste aparelho) da última leitura, "14h05". */
  lidoAs: string;
  gravar: Gravar;
  /** Busca tudo de novo (ex.: depois de criar ou desativar uma categoria). */
  recarregar: () => Promise<void>;
};

const INTERVALO_MS = 60_000;
const agoraCurto = () => {
  const d = new Date();
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
};

export function usarHorarios(): DadosDeHorarios {
  const [horarios, setHorarios] = useState<Horarios | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [erro, setErro] = useState("");
  const [lidoAs, setLidoAs] = useState("");

  const recarregarCategorias = useCallback(async () => {
    const r = await chamar<Categoria[]>("/api/cadastros/categorias");
    if (r.ok && r.dados) setCategorias(r.dados);
  }, []);

  const lerTudo = useCallback(async (vivo: () => boolean = () => true) => {
    const [h] = await Promise.all([chamar<Horarios>("/api/horarios"), recarregarCategorias()]);
    if (!vivo()) return;
    if (h.ok && h.dados) {
      setHorarios(h.dados);
      setErro("");
      setLidoAs(agoraCurto());
    } else setErro(h.mensagem);
  }, [recarregarCategorias]);

  useEffect(() => {
    let vivo = true;
    void lerTudo(() => vivo);
    const t = window.setInterval(async () => {
      const h = await chamar<Horarios>("/api/horarios");
      if (!vivo || !h.ok || !h.dados) return;
      const novo = h.dados;
      setHorarios((atual) => (atual ? { ...atual, agora: novo.agora, pausas: novo.pausas, hoje: novo.hoje } : novo));
      setLidoAs(agoraCurto());
    }, INTERVALO_MS);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [lerTudo]);

  const gravar = useCallback<Gravar>(async (caminho, corpo) => {
    const r = await chamar<Horarios>(caminho, "POST", corpo);
    if (r.ok && r.dados) {
      setHorarios(r.dados);
      setLidoAs(agoraCurto());
    }
    return r;
  }, []);

  const recarregar = useCallback(() => lerTudo(), [lerTudo]);
  return { horarios, categorias, erro, lidoAs, gravar, recarregar };
}
