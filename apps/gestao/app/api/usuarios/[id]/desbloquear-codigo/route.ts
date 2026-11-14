import { comParametros } from "@/src/servidor/next";
import { desbloquearCodigoDoUsuario } from "@/src/servidor/rotas";

export const POST = comParametros(desbloquearCodigoDoUsuario);
