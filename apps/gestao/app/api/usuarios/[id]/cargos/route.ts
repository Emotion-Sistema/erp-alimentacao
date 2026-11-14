import { comParametros } from "@/src/servidor/next";
import { darCargoAoUsuario, tirarCargoDoUsuario } from "@/src/servidor/rotas";

export const POST = comParametros(darCargoAoUsuario);
export const DELETE = comParametros(tirarCargoDoUsuario);
