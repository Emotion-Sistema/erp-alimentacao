import { comParametros } from "@/src/servidor/next";
import { gravarAlergenicosDoIngrediente } from "@/src/servidor/rotas";

export const POST = comParametros(gravarAlergenicosDoIngrediente);
