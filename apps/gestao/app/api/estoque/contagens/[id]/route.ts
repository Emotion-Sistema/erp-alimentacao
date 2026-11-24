import { comParametros } from "@/src/servidor/next";
import { verUmaContagem } from "@/src/servidor/rotas";

export const GET = comParametros(verUmaContagem);
