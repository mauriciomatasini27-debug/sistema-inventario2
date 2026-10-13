import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const results = [];
const check = (id, desc, ok, detail = '') => results.push({ id, desc, ok, detail });

const css = read('src/styles/global.css');
const layout = read('src/layouts/BaseLayout.astro');

check('spec', 'SPEC-UI-00 existe con tickets', existsSync(join(root, 'docs/diseno/SPEC-UI-00-implementacion.md')) && /T-UI-/.test(read('docs/diseno/SPEC-UI-00-implementacion.md')));

check('css-motion', 'kill global con reduce', /prefers-reduced-motion:\s*reduce[\s\S]*?!important/.test(css) && /scroll-behavior:\s*auto/.test(css));

check('css-smooth', 'smooth solo sin preferencia', /prefers-reduced-motion:\s*no-preference[\s\S]*?scroll-behavior:\s*smooth/.test(css));

check('css-focus', ':focus-visible con outline', /:focus-visible\s*\{[^}]*outline/.test(css));

check('css-dvh', '100dvh presente', css.includes('100dvh'));

check('css-input', '16px en coarse pointers', /pointer:\s*coarse[\s\S]*?font-size:\s*16px/.test(css));

check('css-tnum', '.tnum tabular', /\.tnum\s*\{[^}]*tabular-nums/.test(css));

check('layout-viewport', 'viewport-fit cover', layout.includes('viewport-fit=cover'));

check('layout-theme', 'theme-color canvas', layout.includes('content="#f7f5f2"'));

let internal = 'git indisponible';
try {
  internal = execSync('git ls-files "src/pages/_internal/**"', { cwd: root, encoding: 'utf8' }).trim();
} catch {
  internal = existsSync(join(root, 'src/pages/_internal')) ? 'directorio existe' : '';
}
check('no-internal', 'sin harness en el arbol', internal === '', internal.slice(0, 80));

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  process.stdout.write(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.desc}${r.ok || !r.detail ? '' : ` (${r.detail})`}\n`);
}
process.stdout.write(`${results.length - failed}/${results.length} checks en verde\n`);
process.exit(failed ? 1 : 0);
