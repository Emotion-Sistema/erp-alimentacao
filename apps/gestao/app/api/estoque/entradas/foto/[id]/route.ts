import { comParametros } from "@/src/servidor/next";
import { verFotoDaNota } from "@/src/servidor/rotas";

export const GET = comParametros(verFotoDaNota);
