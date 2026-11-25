/**
 * Fotos antes e depois (decisão 0028): monta uma página com as fotos de duas rodadas do teste das
 * cascas lado a lado, para conferir num PR de visual se nada quebrou sem querer.
 *
 * Uso:
 *   1. Na main: pnpm teste:tela cascas.spec.ts  e copie apps/gestao/test-results/telas para uma pasta "antes".
 *   2. No branch: rode de novo e use apps/gestao/test-results/telas como "depois".
 *   3. pnpm exec tsx scripts/comparar-telas.ts <pasta-antes> <pasta-depois> <saida.html>
 *
 * A página leva as fotos dentro dela (base64), então abre em qualquer lugar sem as pastas.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const [antes, depois, saida] = process.argv.slice(2);
if (!antes || !depois || !saida) {
  console.error("Uso: pnpm exec tsx scripts/comparar-telas.ts <pasta-antes> <pasta-depois> <saida.html>");
  process.exit(1);
}

/** Lista as fotos .png de uma pasta e das subpastas (ex.: celular/, tablet/, computador/). */
function fotos(pasta: string): string[] {
  const lista: string[] = [];
  const andar = (p: string) => {
    for (const nome of readdirSync(p).sort()) {
      const c = join(p, nome);
      if (statSync(c).isDirectory()) andar(c);
      else if (nome.endsWith(".png")) lista.push(relative(pasta, c));
    }
  };
  andar(pasta);
  return lista;
}

const nomes = [...new Set([...fotos(antes), ...fotos(depois)])].sort();
const img = (pasta: string, nome: string) => {
  const c = join(pasta, nome);
  return existsSync(c)
    ? `<img loading="lazy" alt="" src="data:image/png;base64,${readFileSync(c).toString("base64")}">`
    : "<p class=falta>Sem foto</p>";
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Telas antes e depois</title>
<style>
body { margin: 0; padding: 16px; font: 15px/1.5 system-ui, sans-serif; background: #fdf8f0; color: #351e17; }
h1 { font-size: 20px; } h2 { font-size: 15px; margin: 28px 0 8px; }
.par { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.par > div > b { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #6b4a3a; margin-bottom: 4px; }
img { width: 100%; height: auto; border: 1px solid #e9dac4; border-radius: 8px; background: #fff; }
.falta { padding: 24px; border: 1px dashed #8f7663; border-radius: 8px; text-align: center; }
@media (max-width: 700px) { .par { grid-template-columns: 1fr; } }
</style>
<h1>Telas antes e depois (${nomes.length} fotos)</h1>
${nomes
  .map(
    (n: string) => `<h2>${esc(n)}</h2><div class="par"><div><b>Antes</b>${img(antes, n)}</div><div><b>Depois</b>${img(depois, n)}</div></div>`,
  )
  .join("\n")}
</html>`;
writeFileSync(saida, html);
console.log(`${nomes.length} fotos comparadas em ${saida}`);
