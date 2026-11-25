"use client";

/** Envio de formulário do estoque com chave e trava contra toque duplo (o servidor devolve o já gravado). */
import { useRef, useState } from "react";
import { chamar } from "../chamar";
import { novaChave } from "./comum";

/** Envio com chave e trava contra toque duplo; devolve a resposta pronta. */
export function useEnvio() {
  const [chave, setChave] = useState(novaChave);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const travado = useRef(false);
  async function enviar<T>(url: string, corpo: Record<string, unknown>): Promise<T | null> {
    if (travado.current) return null;
    travado.current = true;
    setOcupado(true);
    setErro("");
    const r = await chamar<T>(url, "POST", { ...corpo, chave });
    travado.current = false;
    setOcupado(false);
    if (!r.ok || !r.dados) {
      setErro(r.mensagem);
      return null;
    }
    setChave(novaChave());
    return r.dados;
  }
  return { enviar, ocupado, erro, setErro };
}
