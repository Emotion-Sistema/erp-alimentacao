import { comParametros } from "@/src/servidor/next";
import { reiniciarSegundoFatorDoUsuario } from "@/src/servidor/rotas";

export const POST = comParametros(reiniciarSegundoFatorDoUsuario);
