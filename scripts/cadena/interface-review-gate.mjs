#!/usr/bin/env node
// Chequeo local del gate `interface-review` antes de abrir un PR.
// Uso: npm run review:gate -- --body-file <archivo.md> [--base origin/main]
// Exit 0 = pasa o no aplica; 1 = bloqueado; 2 = error de uso/git.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { evaluarRevision } from "./interface-review-lib.mjs";

const argv = process.argv.slice(2);
const valor = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};
const bodyFile = valor("--body-file");
const base = valor("--base") ?? "origin/main";
if (!bodyFile || !base) {
  console.error("uso: review:gate.mjs --body-file <archivo.md> [--base origin/main]");
  process.exit(2);
}

let cuerpo;
try {
  cuerpo = readFileSync(bodyFile, "utf8");
} catch (e) {
  console.error(`review:gate: no pude leer ${bodyFile}: ${e.message}`);
  process.exit(2);
}

const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let files;
try {
  files = [];
  for (const linea of git(["diff", "--name-status", `${base}...HEAD`]).split("\n")) {
    if (!linea.trim()) continue;
    const partes = linea.split("\t");
    const estado = (partes[0] ?? "")[0];
    const nombre = partes[partes.length - 1];
    files.push({ filename: nombre, status: estado === "D" ? "removed" : estado === "A" ? "added" : "modified" });
  }
  for (const f of git(["ls-files", "--others", "--exclude-standard"]).split("\n")) {
    if (f.trim()) files.push({ filename: f.trim(), status: "added" });
  }
} catch (e) {
  console.error(`review:gate: error de git: ${String(e?.stderr || e?.message || e).trim()}`);
  process.exit(2);
}

const r = evaluarRevision({ cuerpo, files });
if (!r.aplica) {
  console.log("review:gate: no aplica (sin archivos visuales)");
  process.exit(0);
}
if (r.motivos.length === 0) {
  console.log("review:gate: OK");
  process.exit(0);
}
console.log("review:gate: BLOQUEADO");
for (const m of r.motivos) console.log(`- ${m}`);
process.exit(1);
