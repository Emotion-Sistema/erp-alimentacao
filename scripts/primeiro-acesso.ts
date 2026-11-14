// Primeiro acesso de um servidor novo: pergunta no terminal o nome da empresa, da loja e o
// login do dono, e a senha sem mostrar na tela. Só funciona com o banco vazio de pessoas.
// Uso (no servidor): erp-primeiro-acesso   (chama este arquivo dentro do contêiner)
import { createInterface } from "node:readline";
import { criarBanco } from "../packages/banco/src/index";
import { ErroDeRegra, prepararPrimeiroAcesso, SENHA_MINIMO } from "../packages/dominio/src/index";

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let calado = false;
// Enquanto `calado`, o que a pessoa digita não aparece (senha).
const escrever = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
  if (!calado || s.includes("\n")) escrever(calado ? "\n" : s);
};

function perguntar(texto: string, secreto = false): Promise<string> {
  return new Promise((ok) => {
    rl.question(texto, (r) => {
      calado = false;
      ok(r);
    });
    calado = secreto;
  });
}

const db = criarBanco(undefined, 2);
try {
  console.log("\nPrimeiro acesso: vamos criar o seu login de dono.\n");
  const empresa = await perguntar("Nome da empresa: ");
  const unidade = await perguntar("Nome da loja (unidade): ");
  const nome = await perguntar("Seu nome: ");
  const login = await perguntar("Seu login (ex.: maria.silva): ");
  let senha = "";
  for (;;) {
    senha = await perguntar(`Sua senha (pelo menos ${SENHA_MINIMO} caracteres; não aparece na tela): `, true);
    const confirma = await perguntar("Digite a senha de novo: ", true);
    if (senha === confirma) break;
    console.log("As duas senhas não são iguais. Vamos de novo.");
  }
  await prepararPrimeiroAcesso(db, { empresa, unidade, nome, login, senha });
  console.log(`\nPronto. Entre com o login "${login.trim().toLowerCase()}" e a sua senha.`);
  console.log("No primeiro acesso o sistema pede para configurar o código do aplicativo autenticador.\n");
} catch (e) {
  console.error(`\nNão foi possível: ${e instanceof ErroDeRegra ? e.message : (e as Error).message}\n`);
  process.exitCode = 1;
} finally {
  rl.close();
  await db.destroy();
}
