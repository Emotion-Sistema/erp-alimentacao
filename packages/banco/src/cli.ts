import { migrar, reverterUltima } from "./migrar";
import { urlDoBanco } from "./conexao";

const comando = process.argv[2];
process.on("uncaughtException", (e: Error & { code?: string }) => {
  if (e.code === "ECONNREFUSED") console.error(`Banco não respondeu em ${urlDoBanco().replace(/:[^:@/]*@/, ":***@")}.`);
  else console.error(e.message);
  process.exit(1);
});
const url = urlDoBanco();
if (comando === "migrar") {
  const feitas = await migrar(url);
  if (feitas.length === 0) console.log("banco já está na última versão.");
} else if (comando === "reverter") {
  const v = await reverterUltima(url);
  console.log(v ? `revertida a ${v}` : "nada para reverter.");
} else {
  console.error("uso: cli.ts migrar | reverter");
  process.exit(1);
}
