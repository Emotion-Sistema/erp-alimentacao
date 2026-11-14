"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso } from "@erp/interface";
import { chamar } from "./chamar";
import { ItemDeAviso, type AvisoDaCaixa } from "./ItemDeAviso";

const A_CADA_MS = 15_000;
const A_CADA_ESCONDIDA_MS = 30_000;

/** Bipe curto (dois se urgente), vibração e notificação do sistema. Tudo opcional: nada aqui pode quebrar a central. */
async function avisarNoAparelho(novos: AvisoDaCaixa[], audio: { current: AudioContext | null }) {
  const urgente = novos.some((n) => n.prioridade === "urgente");
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      audio.current ??= new Ctx();
      const ctx = audio.current;
      if (ctx.state === "suspended") await ctx.resume();
      for (let i = 0; i < (urgente ? 2 : 1); i++) {
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.frequency.value = 880;
        ganho.gain.value = 0.15;
        osc.connect(ganho).connect(ctx.destination);
        const ini = ctx.currentTime + i * 0.3;
        osc.start(ini);
        osc.stop(ini + 0.15);
      }
    }
  } catch {
    /* sem som: segue */
  }
  try {
    navigator.vibrate?.(urgente ? [200, 100, 200] : 200);
  } catch {
    /* sem vibração */
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const titulo = novos.length > 1 ? `${novos.length} avisos novos` : "Aviso novo";
      // Na tela bloqueada outros podem ver: o texto só aparece dentro do aplicativo.
      const urgentes = novos.filter((a) => a.prioridade === "urgente").length;
      const corpo = urgentes > 0 ? "Há aviso urgente. Abra o aplicativo para ver." : "Abra o aplicativo para ver.";
      const registro = await navigator.serviceWorker?.getRegistration();
      if (registro) await registro.showNotification(titulo, { body: corpo, tag: "avisos" });
      else new Notification(titulo, { body: corpo, tag: "avisos" });
    }
  } catch {
    /* sem notificação */
  }
}

const CHAVE_CONHECIDOS = "erp-avisos-conhecidos";
function lerConhecidos(): Set<string> | null {
  try {
    const v = sessionStorage.getItem(CHAVE_CONHECIDOS);
    return v ? new Set(JSON.parse(v) as string[]) : null;
  } catch {
    return null;
  }
}
function gravarConhecidos(ids: Set<string>) {
  try {
    sessionStorage.setItem(CHAVE_CONHECIDOS, JSON.stringify([...ids]));
  } catch {
    /* sem armazenamento: só perde o bipe ao trocar de página */
  }
}

export function CentralDeAvisos() {
  const [avisos, setAvisos] = useState<AvisoDaCaixa[]>([]);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState("");
  const [permissao, setPermissao] = useState<string | null>(null);
  const conhecidos = useRef<Set<string> | null>(null);
  const parou = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const jaMarcados = useRef<Set<string>>(new Set());

  const consultar = useCallback(async () => {
    if (parou.current) return;
    const r = await chamar<AvisoDaCaixa[]>("/api/avisos");
    if (r.status === 401) {
      parou.current = true;
      return;
    }
    if (!r.ok || !r.dados) return;
    const lista = r.dados;
    // Guardado na aba: trocar de página monta a central de novo e não pode perder o bipe.
    const antes = conhecidos.current ?? lerConhecidos();
    conhecidos.current = new Set(lista.map((a) => a.id));
    gravarConhecidos(conhecidos.current);
    if (antes) {
      const novos = lista.filter((a) => a.situacao === "novo" && !antes.has(a.id) && a.prioridade !== "informativo");
      if (novos.length > 0) void avisarNoAparelho(novos, audio);
    }
    setAvisos(lista);
  }, []);

  // Consulta ao montar, a cada 15 s (30 s com a aba escondida) e quando a janela volta ao foco.
  useEffect(() => {
    let tempo: ReturnType<typeof setTimeout>;
    let vivo = true;
    const agendar = () => {
      tempo = setTimeout(
        async () => {
          await consultar();
          if (vivo && !parou.current) agendar();
        },
        document.hidden ? A_CADA_ESCONDIDA_MS : A_CADA_MS,
      );
    };
    void consultar().then(() => vivo && !parou.current && agendar());
    const aoVoltar = () => {
      if (!document.hidden) void consultar();
    };
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      clearTimeout(tempo);
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [consultar]);

  useEffect(() => {
    try {
      if (typeof Notification !== "undefined") {
        setPermissao(Notification.permission);
        if (Notification.permission === "granted") void navigator.serviceWorker?.register("/sw.js").catch(() => undefined);
      }
    } catch {
      /* sem notificação */
    }
  }, []);

  // Com o painel aberto, tudo que aparece como novo passa a "visto".
  useEffect(() => {
    if (!aberto) return;
    const ids = avisos.filter((a) => a.situacao === "novo" && !jaMarcados.current.has(a.id)).map((a) => a.id);
    if (ids.length === 0) return;
    ids.forEach((i) => jaMarcados.current.add(i));
    void chamar("/api/avisos/vistos", "POST", { ids: ids.slice(0, 100).map(Number) }).then((r) => {
      if (!r.ok) {
        ids.forEach((i) => jaMarcados.current.delete(i));
        return;
      }
      const agora = new Date().toISOString();
      setAvisos((l) => l.map((a) => (ids.includes(a.id) && a.situacao === "novo" ? { ...a, situacao: "visto", vistoEm: agora } : a)));
    });
  }, [aberto, avisos]);

  async function resolver(id: string) {
    setErro("");
    const r = await chamar(`/api/avisos/${id}/resolver`, "POST");
    if (!r.ok) {
      setErro(r.mensagem);
      return;
    }
    const agora = new Date().toISOString();
    setAvisos((l) => l.map((a) => (a.id === id ? { ...a, situacao: "resolvido", vistoEm: a.vistoEm ?? agora, resolvidoEm: agora } : a)));
  }

  async function ativarNoAparelho() {
    try {
      setPermissao(await Notification.requestPermission());
      await navigator.serviceWorker?.register("/sw.js");
    } catch {
      /* a central segue funcionando sem isso */
    }
  }

  const novos = avisos.filter((a) => a.situacao === "novo").length;
  const rotulo = novos > 0 ? `Avisos: ${novos} ${novos === 1 ? "aviso novo" : "avisos novos"}` : "Avisos: nenhum aviso novo";
  return (
    <div className="avisos">
      <button type="button" className="avisos__sino" aria-expanded={aberto} aria-controls="painel-avisos" aria-label={rotulo} onClick={() => setAberto((v) => !v)}>
        <span aria-hidden="true">Avisos</span>
        {novos > 0 && (
          <span className="avisos__contador" data-testid="avisos-contador" aria-hidden="true">
            {novos}
          </span>
        )}
      </button>
      {aberto && (
        <section id="painel-avisos" className="avisos__painel" role="dialog" aria-label="Avisos" data-testid="painel-avisos">
          <div className="avisos__cabeca">
            <h2>Avisos</h2>
            <button type="button" className="avisos__fechar" onClick={() => setAberto(false)}>
              Fechar
            </button>
          </div>
          {erro && <Aviso tipo="perigo">{erro}</Aviso>}
          {permissao === "default" && (
            <button type="button" className="avisos__ativar" onClick={() => void ativarNoAparelho()}>
              Ativar avisos no aparelho
            </button>
          )}
          {avisos.length === 0 ? (
            <p>Nenhum aviso por enquanto.</p>
          ) : (
            <ul className="lista-simples">
              {avisos.slice(0, 15).map((a) => (
                <li key={a.id}>
                  <ItemDeAviso aviso={a} aoResolver={(id) => void resolver(id)} />
                </li>
              ))}
            </ul>
          )}
          <Link href="/avisos" className="casca__link" onClick={() => setAberto(false)}>
            Ver todos os avisos
          </Link>
        </section>
      )}
    </div>
  );
}
