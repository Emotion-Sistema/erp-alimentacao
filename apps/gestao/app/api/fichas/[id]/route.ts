import { comParametros } from "@/src/servidor/next";
import { verUmaFicha } from "@/src/servidor/rotas";

export const GET = comParametros(verUmaFicha);
