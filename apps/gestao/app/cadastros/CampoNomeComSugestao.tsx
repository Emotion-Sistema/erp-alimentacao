"use client";

/**
 * Campo "Nome" do ingrediente com sugestões do catálogo pronto enquanto a pessoa digita
 * (padrão combobox/listbox: setas, Enter, Esc). Escolher uma sugestão devolve o item inteiro
 * (unidade, área e embalagens) para o formulário preencher; a pessoa confirma antes de gravar.
 */
import { useId, useMemo, useState } from "react";
import { buscarNoCatalogo, chaveDeBusca, type ItemDoCatalogo } from "@erp/dominio/catalogo";
import { Campo } from "../Campo";

export function CampoNomeComSugestao({
  id,
  valor,
  aoMudar,
  aoEscolher,
  jaCadastrados,
  nomeDaArea,
  ativa = true,
}: {
  id: string;
  valor: string;
  aoMudar: (v: string) => void;
  aoEscolher: (item: ItemDoCatalogo) => void;
  /** Nomes (ativos) que já existem: aparecem marcados e não dá para escolher. */
  jaCadastrados: ReadonlySet<string>;
  nomeDaArea: (a: string) => string;
  ativa?: boolean;
}) {
  const idLista = useId();
  const [fechada, setFechada] = useState(false);
  const [ativo, setAtivo] = useState(-1);

  const sugestoes = useMemo(() => (ativa ? buscarNoCatalogo(valor, 6) : []), [valor, ativa]);
  const aberta = ativa && !fechada && sugestoes.length > 0;
  const jaTem = (i: ItemDoCatalogo) => jaCadastrados.has(chaveDeBusca(i.nome));
  const idOpcao = (n: number) => `${idLista}-${n}`;

  function escolher(i: ItemDoCatalogo) {
    if (jaTem(i)) return;
    setFechada(true);
    setAtivo(-1);
    aoEscolher(i);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && aberta) {
      e.preventDefault();
      setFechada(true);
      setAtivo(-1);
      return;
    }
    if (!sugestoes.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!aberta) {
        setFechada(false);
        setAtivo(e.key === "ArrowDown" ? 0 : sugestoes.length - 1);
        return;
      }
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setAtivo((a) => (a < 0 ? (passo === 1 ? 0 : sugestoes.length - 1) : (a + passo + sugestoes.length) % sugestoes.length));
      return;
    }
    if (e.key === "Enter" && aberta && ativo >= 0 && sugestoes[ativo]) {
      e.preventDefault();
      escolher(sugestoes[ativo]!);
    }
  }

  return (
    <div className="sugestao">
      <Campo
        id={id}
        rotulo="Nome"
        explicacao="Nome do ingrediente como a equipe o conhece. Ao digitar, aparecem sugestões prontas: escolha uma e a unidade, a área e as embalagens vêm preenchidas."
        exemplo="Digite mussa e escolha Mussarela: vem em g, na cozinha, com as embalagens de costume."
        value={valor}
        onChange={(e) => {
          setFechada(false);
          setAtivo(-1);
          aoMudar(e.target.value);
        }}
        onKeyDown={aoTeclar}
        onBlur={() => setFechada(true)}
        onFocus={() => setFechada(false)}
        autoComplete="off"
        required
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={aberta}
        aria-controls={idLista}
        aria-activedescendant={aberta && ativo >= 0 ? idOpcao(ativo) : undefined}
      />
      <ul id={idLista} role="listbox" aria-label="Sugestões do catálogo" className="sugestao__lista" hidden={!aberta}>
        {aberta &&
          sugestoes.map((s, n) => {
            const ja = jaTem(s);
            return (
              <li
                key={s.nome}
                id={idOpcao(n)}
                role="option"
                aria-selected={n === ativo}
                aria-disabled={ja || undefined}
                className={`sugestao__opcao${n === ativo ? " sugestao__opcao--ativa" : ""}`}
                // mouseDown (e não click): o campo não perde o foco antes de a escolha valer.
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(s);
                }}
              >
                <strong>{s.nome}</strong>
                <span>
                  {ja ? "já cadastrado" : `${s.unidadeBase} · ${nomeDaArea(s.area)}${s.embalagens.length ? ` · ${s.embalagens.map(([n2]) => n2).join(", ")}` : ""}`}
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
