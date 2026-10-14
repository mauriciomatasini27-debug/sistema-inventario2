import { execSync } from 'node:child_process';

const sinAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

export function resumir({ tsc, vitest, build, sha }) {
  const lineas = [];
  const errores = sinAnsi(tsc ?? '').split('\n').filter((l) => /error TS\d+/.test(l));
  if (errores.length > 0) {
    for (const e of errores) lineas.push(`- tsc: \`${e.trim()}\``);
  } else {
    lineas.push('- tsc: 0 errores');
  }
  const resumen = sinAnsi(vitest ?? '').split('\n').filter((l) => /Test Files|^\s*Tests\s/.test(l));
  if (resumen.length > 0) {
    for (const r of resumen) lineas.push(`- vitest: \`${r.trim()}\``);
  } else {
    lineas.push('- vitest: sin resumen (falló antes de resumir)');
  }
  const completa = sinAnsi(build ?? '').split('\n').find((l) => /complete!/i.test(l));
  if (completa) {
    lineas.push(`- build: \`${completa.trim()}\``);
  } else {
    lineas.push('- build: sin línea Complete (falló el build)');
  }
  lineas.push(`- sha: \`${(sha ?? '').trim()}\``);
  return lineas.join('\n') + '\n';
}

function correr(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout ?? '') + (e.stderr ?? '');
  }
}

const esDirecto =
  (process.argv[1] ?? '') !== '' && new URL(import.meta.url).pathname === process.argv[1];
if (esDirecto) {
  const tsc = correr('npx tsc --noEmit');
  const vitest = correr('npx vitest run');
  const build = correr('npm run build');
  let sha = '';
  try {
    sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    sha = 'git indisponible';
  }
  process.stdout.write(resumir({ tsc, vitest, build, sha }));
}
