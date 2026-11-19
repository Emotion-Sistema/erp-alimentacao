import type { IconeDoMenu } from "@erp/dominio";

/** Desenhos (SVG, traço de 24 px) dos ícones da barra de baixo do celular. */
export const ICONES_DO_MENU: Record<IconeDoMenu, string> = {
  relogio: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  mesa: "M4 8h16M6 8v11M18 8v11M4 8l2-3h12l2 3",
  dinheiro:
    "M3 7h18v10H3zM9.5 12a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M6 10v4M18 10v4",
  moto: "M5 17a3 3 0 1 0 0-.01M19 17a3 3 0 1 0 0-.01M8 17h7l3-6h-4l-2-3H9",
  lista: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  chama: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 2 1 3 3 3 3",
  caixa: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  salao: "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2",
  carrinho: "M3 4h2l2.5 11h11L21 7H7M9 20h.01M18 20h.01",
  ferramenta:
    "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  moeda:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2",
  painel: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  pessoas:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6",
  escudo: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  megafone: "M3 10v4h4l6 4V6L7 10zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14",
  turno: "M12 3a9 9 0 1 0 9 9M12 7v5h5M17 3v4h4",
  tablet: "M5 3h14v18H5zM11 18h2",
  folha: "M5 19c0-8 6-14 14-14 0 8-6 14-14 14zM5 19l7-7",
  pacote: "M4 8l8-4 8 4-8 4zM4 8v8l8 4 8-4V8M12 12v8",
  caminhao:
    "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01",
  xicara:
    "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3",
  etiqueta: "M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01",
  calendario: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4M8 14h3v3H8z",
  grafico: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  recibo: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4",
  documento: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6",
  entrega: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10M7.5 5l9 4",
  adicional: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8",
};

export const ICONE_MAIS = "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z";
export const ICONE_INICIO = "M4 11l8-7 8 7v9h-5v-6H9v6H4z";
