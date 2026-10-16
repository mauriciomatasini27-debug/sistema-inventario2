#!/usr/bin/env node
// Guard de la cadena: correr antes de cualquier squash-merge.
// Uso: node scripts/cadena/puede-mergear.mjs <número-PR> [--repo owner/name]
// Exit 0 = se puede mergear; 1 = bloqueado (no mergear, avisar a Mauri); 2 = error de uso/API.
// Usa `gh api` con GH_TOKEN del entorno; nunca lo imprime.
import { execFileSync } from "node:child_process";
import { evaluar } from "./puede-mergear-lib.mjs";

const REGISTRO = "docs/roadmap/migraciones-aplicadas.md";

function gh(args) {
  return execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

const argv = process.argv.slice(2);
const pr = argv.find((a) => /^\d+$/.test(a));
const iRepo = argv.indexOf("--repo");
const repo = iRepo >= 0 ? argv[iRepo + 1] : process.env.GH_REPO || "mauriciosoyastor/sistema-inventario";
if (!pr) {
  console.error("uso: puede-mergear.mjs <número-PR> [--repo owner/name]");
  process.exit(2);
}

try {
  const datos = JSON.parse(gh([`repos/${repo}/pulls/${pr}`]));
  const files = gh(["--paginate", "--jq", ".[] | {filename, status}", `repos/${repo}/pulls/${pr}/files?per_page=100`])
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  // El registro se lee de la rama BASE: un PR no puede autorizarse su propia migración.
  let registroMd = "";
  try {
    registroMd = gh(["-H", "Accept: application/vnd.github.raw", `repos/${repo}/contents/${REGISTRO}?ref=${encodeURIComponent(datos.base.ref)}`]);
  } catch (e) {
    console.error(`aviso: no pude leer ${REGISTRO} en ${datos.base.ref}; se trata como vacío`);
  }
  const r = evaluar({ titulo: datos.title, cuerpo: datos.body, files, registroMd });
  if (r.ok) {
    console.log(`puede-mergear #${pr}: OK`);
    process.exit(0);
  }
  console.log(`puede-mergear #${pr}: BLOQUEADO`);
  for (const m of r.motivos) console.log(`- ${m}`);
  console.log("No mergear; avisar a Mauri.");
  process.exit(1);
} catch (e) {
  const msg = String(e?.stderr || e?.message || e).replaceAll(process.env.GH_TOKEN || "\u0000", "***");
  console.error(`puede-mergear #${pr}: error consultando GitHub: ${msg.trim()}`);
  process.exit(2);
}
