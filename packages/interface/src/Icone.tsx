import type { ReactNode } from "react";

/**
 * Pequeno conjunto de ícones desenhados aqui mesmo (SVG inline, sem biblioteca externa).
 * São enfeite: ficam escondidos de leitor de tela (aria-hidden) e sempre andam ao lado de um texto.
 * O tamanho vem do tema (--tamanho-icone) e a cor é a do texto ao redor.
 */
export type NomeDeIcone =
  | "balanca"
  | "caixa"
  | "local"
  | "caminhao"
  | "relogio"
  | "telefone"
  | "email"
  | "documento"
  | "pessoa"
  | "calendario"
  | "alerta"
  | "ok"
  | "erro"
  | "info"
  | "busca"
  | "mais"
  | "fechar"
  | "desfazer";

const DESENHOS: Record<NomeDeIcone, ReactNode> = {
  balanca: (
    <>
      <path d="M12 3v17M7 20h10M4 7h16" />
      <path d="M4 7l-2.5 7a3 3 0 0 0 5 0L4 7zM20 7l-2.5 7a3 3 0 0 0 5 0L20 7z" />
    </>
  ),
  caixa: (
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  local: (
    <>
      <path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  caminhao: (
    <>
      <path d="M2 6h11v11H2zM13 10h5l3 3.5V17H13z" />
      <circle cx="6.5" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  telefone: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />
  ),
  email: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  documento: <path d="M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6" />,
  pessoa: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  calendario: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  alerta: <path d="M12 3l10 18H2L12 3zM12 10v5M12 18v.01" />,
  ok: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  erro: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  busca: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  desfazer: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
};

export function Icone({
  nome,
  className,
}: {
  nome: NomeDeIcone;
  className?: string;
}) {
  return (
    <svg
      className={["erp-icone", className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {DESENHOS[nome]}
    </svg>
  );
}
