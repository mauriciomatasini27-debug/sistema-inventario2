import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAREJAS, evaluar, renderMd, tokensDeCss } from './check-contrast-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
const filas = evaluar(PAREJAS, tokensDeCss(css));

if (process.argv.includes('--md')) {
  process.stdout.write(renderMd(filas));
} else {
  for (const f of filas) {
    const valor = f.valor === null ? 'ausente' : `${f.valor.toFixed(2)}:1`;
    process.stdout.write(`${f.resultado} ${f.nombre}: ${f.fgHex ?? '?'} sobre ${f.bgHex ?? '?'} = ${valor} (umbral ${f.umbral})\n`);
  }
  const fallidos = filas.filter((f) => f.resultado !== 'PASS').length;
  process.stdout.write(`${filas.length - fallidos}/${filas.length} pares en verde\n`);
}

process.exit(filas.some((f) => f.resultado !== 'PASS') ? 1 : 0);
