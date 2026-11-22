import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  clasificarRamas,
  clasificarWorktrees,
  comandosRestauracion,
  comandosRestauracionRamas,
  estadoBaseline,
  parsearCommitsPosteriores,
  parsearLocales,
  parsearRemotas,
  parsearWorktrees,
} from "./worktrees-check-lib.mjs";

const args = process.argv.slice(2);

function valor(flag, defecto) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : defecto;
}

function git(repo, parametros, opciones = {}) {
  const { raw, ...spawnOpts } = opciones;
  const r = spawnSync("git", ["-C", repo, ...parametros], {
    encoding: "utf8",
    ...spawnOpts,
  });
  const salida = String(r.stdout ?? "").replace(/\r\n/g, "\n");
  return {
    ok: r.status === 0,
    out: raw ? salida : salida.trim(),
    err: String(r.stderr ?? "").trim(),
  };
}

function refPorDefecto(repo) {
  const remotos = git(repo, ["remote"]).out.split(/\r?\n/).filter(Boolean);
  for (const remoto of remotos) {
    const simbolico = git(repo, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remoto}/HEAD`]);
    if (simbolico.ok && simbolico.out.startsWith(`${remoto}/`)) {
      const rama = simbolico.out.slice(remoto.length + 1);
      return { remoto, rama, ref: `refs/remotes/${remoto}/${rama}` };
    }
  }
  return null;
}

function duenosDeclarados() {
  const archivo = valor("--duenos", "");
  if (!archivo) return new Set();
  if (!existsSync(archivo)) {
    console.error(`worktrees-check: no existe el archivo de dueños ${archivo}`);
    process.exit(2);
  }
  return new Set(
    readFileSync(archivo, "utf8")
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter(Boolean)
      .filter((linea) => !linea.startsWith("#")),
  );
}

function estadoDe(ruta, defaultHead) {
  const status = git(ruta, ["status", "--porcelain"], { raw: true });
  const head = git(ruta, ["rev-parse", "HEAD"]).out;
  const gitdir = git(ruta, ["rev-parse", "--git-dir"]);
  const rutaGitdir = gitdir.ok ? resolve(ruta, gitdir.out) : "";
  const mergeHeadPath = rutaGitdir ? resolve(rutaGitdir, "MERGE_HEAD") : "";
  const mergeHead = mergeHeadPath && existsSync(mergeHeadPath) ? String(readFileSync(mergeHeadPath, "utf8")).trim() : null;
  const fecha = git(ruta, ["log", "-1", "--format=%ct"]);
  const modificado = fecha.ok && fecha.out ? Number(fecha.out) * 1000 : statSync(ruta).mtimeMs;
  return {
    status: status.ok ? status.out : "",
    head,
    mergeHead,
    mergeConRamaPorDefecto: mergeHead ? mergeHead === defaultHead : null,
    modificado,
  };
}

function pullRequestsAbiertas(repo) {
  const r = spawnSync("gh", ["pr", "list", "--state", "open", "--limit", "100", "--json", "headRefName", "--jq", ".[].headRefName"], {
    cwd: repo,
    encoding: "utf8",
  });
  if (r.status !== 0) return new Set();
  return new Set(String(r.stdout ?? "").split(/\r?\n/).filter(Boolean));
}

const repo = resolve(valor("--repo", process.cwd()));
if (!git(repo, ["rev-parse", "--git-dir"]).ok) {
  console.error(`worktrees-check: ${repo} no es un repositorio git`);
  process.exit(2);
}

const diasUmbral = Number(valor("--dias", "7"));
if (!Number.isFinite(diasUmbral) || diasUmbral < 0) {
  console.error("worktrees-check: --dias debe ser un número entero no negativo");
  process.exit(2);
}

const porDefecto = refPorDefecto(repo);
if (!porDefecto) {
  console.error("worktrees-check: no se pudo resolver la rama por defecto del remote");
  process.exit(2);
}
const { rama: defaultBranch, ref: defaultRef } = porDefecto;
const defaultHead = git(repo, ["rev-parse", defaultRef]).out;
const worktrees = parsearWorktrees(git(repo, ["worktree", "list", "--porcelain"]).out);
const rutaPrincipal = worktrees[0]?.ruta ?? repo;

const estados = {};
for (const w of worktrees) {
  if (w.prunable) continue;
  estados[w.ruta] = estadoDe(w.ruta, defaultHead);
}

const refsLocales = git(
  repo,
  ["for-each-ref", "--format=%(refname:short)%09%(objectname)%09%(upstream:short)", "refs/heads/"],
  { raw: true },
).out;
const refsRemotas = git(
  repo,
  ["for-each-ref", "--format=%(refname)%09%(objectname)", "refs/remotes/"],
  { raw: true },
).out;
const locales = parsearLocales(refsLocales);
const remotas = parsearRemotas(refsRemotas);
const remotasConocidas = new Set(remotas.map((r) => r.nombre));
const prAbiertas = pullRequestsAbiertas(repo);
const ahora = Date.now();

const merges = {};
const heads = new Set([
  ...Object.values(estados).map((e) => e.head),
  ...locales.map((r) => r.sha),
  ...remotas.map((r) => r.sha),
]);
for (const head of heads) {
  if (!head) continue;
  merges[head] = git(repo, ["merge-base", "--is-ancestor", head, defaultRef]).ok;
}

function totalesDe(salida) {
  const totales = { archivos: 0, inserciones: 0, deletiones: 0 };
  for (const linea of salida.split(/\r?\n/)) {
    const [ins, del] = linea.split("\t");
    if (ins === undefined || del === undefined) continue;
    totales.archivos += 1;
    totales.inserciones += Number(ins) || 0;
    totales.deletiones += Number(del) || 0;
  }
  return totales;
}

const trabajoPosterior = {};
for (const r of [...locales, ...remotas]) {
  if (
    merges[r.sha] !== false ||
    prAbiertas.has(r.nombre) ||
    prAbiertas.has(r.corto) ||
    r.nombre === defaultBranch ||
    r.corto === defaultBranch
  ) {
    continue;
  }
  const ref = locales.includes(r) ? `refs/heads/${r.nombre}` : `refs/remotes/${r.nombre}`;
  const base = git(repo, ["merge-base", defaultRef, ref]);
  if (!base.ok || !base.out) continue;
  const log = git(repo, ["log", "--format=%H%x09%s%x09%ct", `${base.out}..${ref}`], { raw: true }).out;
  if (!log.trim()) continue;
  trabajoPosterior[r.nombre] = parsearCommitsPosteriores(
    log
      .trim()
      .split(/\r?\n/)
      .map((linea) => {
        const sha = linea.split("\t")[0];
        const stats = totalesDe(git(repo, ["show", "--format=", "--numstat", sha], { raw: true }).out);
        return `${linea}\t${stats.archivos}\t${stats.inserciones}\t${stats.deletiones}`;
      })
      .join("\n"),
  );
}

const clasificados = clasificarWorktrees({
  worktrees,
  estados,
  merges,
  rutaPrincipal,
  ramaPorDefecto: defaultBranch,
  ahora,
  diasUmbral,
  pullRequestsAbiertas: prAbiertas,
});

const ramas = clasificarRamas({
  locales,
  remotas,
  ramaPorDefecto: defaultBranch,
  pullRequestsAbiertas: prAbiertas,
  trabajoPosterior,
  merges,
  remotasConocidas,
  ahora,
});

const baseline = estadoBaseline({ clasificados, duenos: duenosDeclarados() });

console.log("# Restauración (SHAs completos; el reflog expira)");
for (const comando of comandosRestauracion(clasificados)) console.log(comando);
for (const comando of comandosRestauracionRamas(ramas)) console.log(comando);
console.log("");
console.log(`# Worktrees: ${clasificados.length} | ramas: ${ramas.locales.length} locales / ${ramas.remotas.length} remotas | rama por defecto: ${defaultBranch} | umbral: ${diasUmbral} días`);
for (const w of clasificados) {
  const id = w.rama ? `${w.rama} @ ${w.headCorto}` : `detached ${w.headCorto}`;
  const extra = w.archivosCambios ? ` (${w.archivosCambios} archivos: ${w.archivos.join(", ")})` : "";
  const merge = w.mergeEnCurso ? ` [merge en curso${w.mergeConRamaPorDefecto ? " vigente" : " viejo"}]` : "";
  console.log(`${w.bucket.padEnd(18)} ${w.ruta.padEnd(48)} ${id}${extra}${merge} — ${w.motivo}`);
}
console.log("");
console.log("# Ramas locales");
for (const r of ramas.locales) console.log(`${r.bucket.padEnd(26)} ${r.nombre.padEnd(42)} @ ${r.sha.slice(0, 8)} — ${r.motivo}`);
console.log("");
console.log("# Ramas remotas");
for (const r of ramas.remotas) console.log(`${r.bucket.padEnd(26)} ${r.nombre.padEnd(42)} @ ${r.sha.slice(0, 8)} — ${r.motivo}`);
if (!baseline.ok) {
  console.log("");
  console.log("# Debajo de la Baseline");
  for (const m of baseline.motivos) console.log(`- ${m.ruta}: ${m.motivo}`);
}
if (args.includes("--json")) {
  console.log("");
  console.log(JSON.stringify({ clasificados, ramas, baseline }, null, 2));
}

process.exit(baseline.ok ? 0 : 1);
