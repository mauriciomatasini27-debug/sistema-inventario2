import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

const tokens = {};
for (const m of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) tokens[m[1]] = m[2];

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const ratio = (a, b) => {
  const x = lum(tokens[a]);
  const y = lum(tokens[b]);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const pairs = [
  ['texto principal', 'void', 'canvas'],
  ['texto sobre dark', 'star-white', 'void'],
  ['selección y foco', 'star-white', 'trust'],
  ['CTA llama', 'star-white', 'star-warm'],
  ['CTA llama dark', 'void', 'star-warm'],
  ['CTA hover dark', 'void', 'star-glow'],
  ['CTA primario glow', 'star-white', 'star-glow'],
  ['acento sobre papel', 'trust', 'canvas'],
  ['muted sobre papel', 'ash', 'canvas'],
];

for (const [name, fg, bg] of pairs) {
  if (!tokens[fg] || !tokens[bg]) {
    process.stdout.write(`SKIP ${name}: token ausente\n`);
    continue;
  }
  const r = ratio(fg, bg);
  const verdict = r >= 4.5 ? 'PASS' : r >= 3.0 ? 'SOLO-GRANDE' : 'FAIL';
  process.stdout.write(`${verdict} ${name}: ${tokens[fg]} sobre ${tokens[bg]} = ${r.toFixed(2)}:1\n`);
}
