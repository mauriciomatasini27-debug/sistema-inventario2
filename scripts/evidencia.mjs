import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const sinAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

const tramo = (fallidos, pasados, total) => {
  const partes = [];
  if (fallidos > 0) partes.push(`${fallidos} failed`);
  if (pasados > 0 || partes.length === 0) partes.push(`${pasados} passed`);
  return `${partes.join(' | ')} (${total})`;
};

export function resumirVitestJson(json) {
  const j = json ?? {};
  // Por qué testResults: en el JSON de vitest numTotalTestSuites cuenta bloques describe, no archivos.
  const archivos = Array.isArray(j.testResults) ? j.testResults : null;
  const suites = archivos
    ? tramo(
        archivos.filter((r) => r.status === 'failed').length,
        archivos.filter((r) => r.status === 'passed').length,
        archivos.length,
      )
    : tramo(
        Number(j.numFailedTestSuites ?? 0),
        Number(j.numPassedTestSuites ?? 0),
        Number(j.numTotalTestSuites ?? 0),
      );
  const tests = tramo(
    Number(j.numFailedTests ?? 0),
    Number(j.numPassedTests ?? 0),
    Number(j.numTotalTests ?? 0),
  );
  return [`- vitest: \`Test Files  ${suites}\``, `- vitest: \`Tests  ${tests}\``].join('\n') + '\n';
}

export function testsCambiados(nombres) {
  const lista = Array.isArray(nombres) ? nombres : String(nombres ?? '').split('\n');
  return lista.map((n) => n.trim()).filter((n) => n.endsWith('.test.ts'));
}

export function compararBaselines(antes, despues) {
  const claves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])].sort();
  const lineas = claves.map((clave) => {
    const a = antes?.[clave];
    const d = despues?.[clave];
    const base = `- baseline ${clave}: ${a} -> ${d}`;
    return a === d ? `${base} (sin cambio)` : base;
  });
  return lineas.join('\n') + '\n';
}

/**
 * @param {{ tsc: string, vitest: string, build: string, sha: string, vitestJson?: object | null, cambiados?: string[] | null, baselinesAntes?: Record<string, number> | null, baselinesDespues?: Record<string, number> | null }} args
 */
export function resumir({ tsc, vitest, build, sha, vitestJson = null, cambiados = null, baselinesAntes = null, baselinesDespues = null }) {
  const lineas = [];
  const errores = sinAnsi(tsc ?? '').split('\n').filter((l) => /error TS\d+/.test(l));
  if (errores.length > 0) {
    for (const e of errores) lineas.push(`- tsc: \`${e.trim()}\``);
  } else {
    lineas.push('- tsc: 0 errores');
  }
  const resumen = sinAnsi(vitest ?? '').split('\n').filter((l) => /Test Files|^\s*Tests\s/.test(l));
  if (vitestJson != null) {
    lineas.push(...resumirVitestJson(vitestJson).trim().split('\n'));
  } else if (resumen.length > 0) {
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
  if (cambiados != null) {
    if (cambiados.length > 0) {
      for (const c of cambiados) lineas.push(`- test cambiado: \`${c}\``);
    } else {
      lineas.push('- tests cambiados: sin cambios');
    }
  }
  if (baselinesAntes != null && baselinesDespues != null) {
    lineas.push(
      ...compararBaselines(baselinesAntes, baselinesDespues)
        .trim()
        .split('\n')
        .filter((l) => l !== ''),
    );
  }
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
  const rutaJson = process.env.EVIDENCIA_VITEST_JSON ?? '.pstack-tmp/vitest.json';
  if (!existsSync(rutaJson)) {
    correr(`npx vitest run --reporter=json --outputFile=${rutaJson}`);
  }
  let vitestJson = null;
  try {
    vitestJson = JSON.parse(readFileSync(rutaJson, 'utf8'));
  } catch {
    vitestJson = null;
  }
  const build = correr('npm run build');
  let sha = '';
  try {
    sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    sha = 'git indisponible';
  }
  let cambiados = null;
  try {
    cambiados = testsCambiados(correr('git diff --name-only origin/main'));
  } catch {
    cambiados = null;
  }
  let baselinesAntes = null;
  let baselinesDespues = null;
  try {
    baselinesAntes = JSON.parse(execSync('git show origin/main:tests/arch/baselines.json', { encoding: 'utf8' }));
    baselinesDespues = JSON.parse(readFileSync('tests/arch/baselines.json', 'utf8'));
  } catch {
    baselinesAntes = null;
    baselinesDespues = null;
  }
  process.stdout.write(resumir({ tsc, vitest: '', build, sha, vitestJson, cambiados, baselinesAntes, baselinesDespues }));
}
