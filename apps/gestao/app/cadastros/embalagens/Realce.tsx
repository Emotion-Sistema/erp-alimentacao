/** Texto com o trecho buscado em destaque (<mark>). Sem busca, o texto puro. */
import { trechosComRealce } from "./contas";

export function Realce({ texto, termo }: { texto: string; termo?: string }) {
  if (!termo?.trim()) return <>{texto}</>;
  return (
    <>
      {trechosComRealce(texto, termo).map((p, i) =>
        p.achado ? (
          <mark key={i} className="emb-realce">
            {p.texto}
          </mark>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  );
}
