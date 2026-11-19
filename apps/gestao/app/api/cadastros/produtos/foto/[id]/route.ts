import { comParametros } from "@/src/servidor/next";
import { verFotoDoProduto } from "@/src/servidor/rotas";

export const GET = comParametros(verFotoDoProduto);
