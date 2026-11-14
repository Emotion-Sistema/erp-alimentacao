"use client";

import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao } from "@erp/interface";
import { chamar } from "../chamar";

type Pessoa = {
  id: number;
  nome: string;
  cargo: string;
  bloqueado: boolean;
  aqui: boolean;
  emOutraEstacao: boolean;
  ativa: boolean;
};
type Tela = { estacao: { id: number; nome: string }; pessoas: Pessoa[]; acoes: string[] };

const NOME_DA_ACAO: Record<string, string> = {
  "producao.ver": "Ver a fila de produção",
  "producao.operar": "Iniciar e finalizar preparos",
  "producao.sensivel": "Registrar perda, ajuste ou item que acabou",
  "estoque.cozinha": "Estoque da cozinha",
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1]![0]! : "")).toUpperCase();
}

function Foto({ pessoa, grande }: { pessoa: Pessoa; grande?: boolean }) {
  return (
    <span className={`foto${grande ? " foto--grande" : ""}${pessoa.ativa ? " foto--ativa" : ""}`} aria-hidden="true">
      {iniciais(pessoa.nome)}
    </span>
  );
}

export function Estacao() {
  const [tela, setTela] = useState<Tela | null>(null);
  const [semCadastro, setSemCadastro] = useState(false);
  const [erro, setErro] = useState("");
  const [teclado, setTeclado] = useState<Pessoa | null>(null);
  const [menuDe, setMenuDe] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamar<Tela>("/api/estacao");
    if (r.status === 401) {
      setSemCadastro(true);
      return;
    }
    if (r.ok && r.dados) {
      setTela(r.dados);
      setSemCadastro(false);
    } else setErro(r.mensagem);
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 30_000);
    return () => clearInterval(t);
  }, [carregar]);

  async function acao(url: string, corpo: unknown) {
    setErro("");
    const r = await chamar(url, "POST", corpo);
    if (!r.ok) setErro(r.mensagem);
    setMenuDe(null);
    await carregar();
  }

  if (semCadastro) {
    return (
      <main className="estacao estacao--vazia">
        <Aviso tipo="atencao">Este aparelho não está cadastrado como estação. Peça ao gerente.</Aviso>
      </main>
    );
  }
  if (!tela) {
    return <main className="estacao">{erro ? <Aviso tipo="perigo">{erro}</Aviso> : <p>Carregando...</p>}</main>;
  }

  const aqui = tela.pessoas.filter((p) => p.aqui);

  function tocarNaPessoa(p: Pessoa) {
    if (p.aqui) {
      if (!p.ativa) void acao("/api/estacao/ativar", { usuarioId: p.id });
    } else if (!p.bloqueado) {
      setErro("");
      setTeclado(p);
    }
  }

  return (
    <main className="estacao">
      <header className="estacao__topo">
        <h1>{tela.estacao.nome}</h1>
        <ul className="estacao__aqui lista-simples" aria-label="Quem está aqui">
          {aqui.length === 0 && <li>Ninguém entrou ainda. Toque na sua foto abaixo.</li>}
          {aqui.map((p) => (
            <li key={p.id} className="aqui">
              <button
                type="button"
                className={`aqui__foto${p.ativa ? " aqui__foto--ativa" : ""}`}
                onClick={() => tocarNaPessoa(p)}
                aria-label={p.ativa ? `${p.nome}, ativa agora` : `Tornar ${p.nome} a pessoa ativa`}
                aria-pressed={p.ativa}
              >
                <Foto pessoa={p} grande />
              </button>
              <button type="button" className="aqui__nome" onClick={() => setMenuDe(menuDe === p.id ? null : p.id)} aria-label={`Opções de ${p.nome}`}>
                {p.nome}
                {p.ativa && <strong> (ativa)</strong>}
              </button>
              {menuDe === p.id && (
                <Botao variante="secundario" className="botao-grande" onClick={() => void acao("/api/estacao/sair", { usuarioId: p.id })}>
                  Sair
                </Botao>
              )}
            </li>
          ))}
        </ul>
      </header>

      {erro && <Aviso tipo="perigo">{erro}</Aviso>}

      <section className="estacao__centro" aria-label="Produção">
        <h2>As telas de produção chegam na etapa E14</h2>
        {tela.acoes.length > 0 ? (
          <>
            <p>O cargo ativo poderá usar:</p>
            <ul>
              {tela.acoes.map((a) => (
                <li key={a}>{NOME_DA_ACAO[a] ?? a}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>Nenhuma pessoa ativa. Toque em uma foto para começar.</p>
        )}
      </section>

      <section aria-label="Equipe da cozinha">
        <h2>Equipe da cozinha</h2>
        <ul className="grade-pessoas lista-simples">
          {tela.pessoas.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`pessoa${p.aqui ? " pessoa--aqui" : ""}${p.bloqueado ? " pessoa--bloqueada" : ""}`}
                disabled={p.bloqueado}
                onClick={() => tocarNaPessoa(p)}
              >
                <Foto pessoa={p} grande />
                <span className="pessoa__nome">{p.nome}</span>
                <span className="pessoa__estado">
                  {p.bloqueado ? "Código bloqueado: chame o supervisor" : p.aqui ? (p.ativa ? "Ativa agora" : "Está aqui") : p.emOutraEstacao ? "Em outra estação" : "Toque para entrar"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {teclado && (
        <Teclado
          pessoa={teclado}
          aoFechar={() => {
            setTeclado(null);
            void carregar();
          }}
          aoEntrar={async () => {
            setTeclado(null);
            await carregar();
          }}
        />
      )}
    </main>
  );
}

function Teclado({ pessoa, aoFechar, aoEntrar }: { pessoa: Pessoa; aoFechar: () => void; aoEntrar: () => Promise<void> }) {
  const [digitos, setDigitos] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(codigo: string) {
    setEnviando(true);
    const r = await chamar("/api/estacao/entrar", "POST", { usuarioId: pessoa.id, codigo });
    setEnviando(false);
    if (r.ok) {
      await aoEntrar();
      return;
    }
    setDigitos("");
    setErro(r.mensagem);
  }

  function tocar(d: string) {
    if (enviando || digitos.length >= 4) return;
    const novo = digitos + d;
    setErro("");
    setDigitos(novo);
    if (novo.length === 4) void enviar(novo);
  }

  return (
    <div className="teclado-fundo" role="dialog" aria-modal="true" aria-label={`Código de ${pessoa.nome}`}>
      <div className="teclado">
        <h2>{pessoa.nome}, digite seu código</h2>
        <div className="teclado__visor" aria-label={`${digitos.length} de 4 números digitados`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`teclado__bolinha${i < digitos.length ? " teclado__bolinha--cheia" : ""}`} />
          ))}
        </div>
        <div aria-live="assertive">{erro && <Aviso tipo="perigo">{erro}</Aviso>}</div>
        <div className="teclado__teclas">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" className="tecla" onClick={() => tocar(d)}>
              {d}
            </button>
          ))}
          <button type="button" className="tecla tecla--suave" onClick={() => setDigitos(digitos.slice(0, -1))}>
            Apagar
          </button>
          <button type="button" className="tecla" onClick={() => tocar("0")}>
            0
          </button>
          <button type="button" className="tecla tecla--suave" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
