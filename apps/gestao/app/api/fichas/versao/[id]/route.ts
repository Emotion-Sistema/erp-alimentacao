import { comParametros } from "@/src/servidor/next";
import { verUmaVersaoDaFicha } from "@/src/servidor/rotas";

export const GET = comParametros(verUmaVersaoDaFicha);
