import { comParametros } from "@/src/servidor/next";
import { gravarConversao } from "@/src/servidor/rotas";

export const POST = comParametros(gravarConversao);
