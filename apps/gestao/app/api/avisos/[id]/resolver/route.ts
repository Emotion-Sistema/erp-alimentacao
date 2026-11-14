import { comParametros } from "@/src/servidor/next";
import { resolverUmAviso } from "@/src/servidor/rotas";

export const POST = comParametros(resolverUmAviso);
