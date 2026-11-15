"use client";

/**
 * Filtros em chips (tipo, fornecedor, medida), cada um com o contador ao vivo: quantas
 * embalagens aparecem se a pessoa tocar nele (mantendo a busca e os outros filtros).
 * Chip é botão com aria-pressed; o grupo tem nome para o leitor de tela.
 */
import { MEDIDAS, plural, type FiltroDeFornecedor, type Filtros, type Medida } from "./contas";
import { T } from "./textos";

type Contagens = { tipo: Map<string, number>; fornecedor: Map<string, number>; medida: Map<string, number> };

function Chip({ ativo, texto, quantidade, aoTocar }: { ativo: boolean; texto: string; quantidade: number; aoTocar: () => void }) {
  return (
    <button type="button" className="emb-chip" aria-pressed={ativo} onClick={aoTocar} disabled={!ativo && quantidade === 0}>
      <span>{texto}</span>
      <span className="emb-chip__conta">{quantidade}</span>
    </button>
  );
}

function Linha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="emb-filtros__linha" role="group" aria-label={T.filtros.rotuloGrupo(titulo)}>
      <span className="emb-filtros__titulo" aria-hidden="true">
        {titulo}
      </span>
      <div className="emb-filtros__chips">{children}</div>
    </div>
  );
}

export function FiltrosDoCatalogo({
  tipos,
  fornecedores,
  filtros,
  contagens,
  aoMudar,
}: {
  tipos: string[];
  fornecedores: { id: number; nome: string }[];
  filtros: Filtros;
  contagens: Contagens;
  aoMudar: (f: Filtros) => void;
}) {
  const fornecedor = (v: FiltroDeFornecedor) => aoMudar({ ...filtros, fornecedor: filtros.fornecedor === v ? "todos" : v });
  const medida = (v: Medida) => aoMudar({ ...filtros, medida: filtros.medida === v ? null : v });
  return (
    <div className="emb-filtros">
      <Linha titulo={T.filtros.tipo}>
        <Chip ativo={filtros.tipo === null} texto={T.filtros.todos} quantidade={contagens.tipo.get("") ?? 0} aoTocar={() => aoMudar({ ...filtros, tipo: null })} />
        {tipos.map((t) => (
          <Chip
            key={t}
            ativo={filtros.tipo === t}
            texto={plural(t)}
            quantidade={contagens.tipo.get(t) ?? 0}
            aoTocar={() => aoMudar({ ...filtros, tipo: filtros.tipo === t ? null : t })}
          />
        ))}
      </Linha>
      <Linha titulo={T.filtros.fornecedor}>
        <Chip ativo={filtros.fornecedor === "todos"} texto={T.filtros.todos} quantidade={contagens.fornecedor.get("") ?? 0} aoTocar={() => fornecedor("todos")} />
        <Chip ativo={filtros.fornecedor === "qualquer"} texto={T.filtros.qualquer} quantidade={contagens.fornecedor.get("qualquer") ?? 0} aoTocar={() => fornecedor("qualquer")} />
        {fornecedores.map((f) => (
          <Chip key={f.id} ativo={filtros.fornecedor === f.id} texto={f.nome} quantidade={contagens.fornecedor.get(String(f.id)) ?? 0} aoTocar={() => fornecedor(f.id)} />
        ))}
      </Linha>
      <Linha titulo={T.filtros.medida}>
        <Chip ativo={filtros.medida === null} texto={T.filtros.todas} quantidade={contagens.medida.get("") ?? 0} aoTocar={() => aoMudar({ ...filtros, medida: null })} />
        {MEDIDAS.map((m) => (
          <Chip key={m} ativo={filtros.medida === m} texto={T.filtros.medidas[m]} quantidade={contagens.medida.get(m) ?? 0} aoTocar={() => medida(m)} />
        ))}
      </Linha>
    </div>
  );
}
