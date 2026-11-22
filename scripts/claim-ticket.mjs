// RETRO-AUD-02: reclamar un ticket antes de abrir el worktree evita que dos
// sesiones (o un subagente y la sesión principal) implementen el mismo issue.
// Uso: node scripts/claim-ticket.mjs claim <issue.md> <id-de-sesión>
//      node scripts/claim-ticket.mjs release <issue.md> <id-de-sesión>
//      node scripts/claim-ticket.mjs status [directorio-de-issues]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLAIM = /^\*\*Claim:\*\*\s*(.+)$/m;

function archivosIssue(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entrada of readdirSync(dir).sort()) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) out.push(...archivosIssue(ruta));
    else if (entrada.endsWith(".md")) out.push(ruta);
  }
  return out;
}

function claimDe(texto) {
  return texto.match(CLAIM)?.[1]?.trim() ?? "libre";
}

function fijarClaim(texto, valor) {
  if (CLAIM.test(texto)) return texto.replace(CLAIM, `**Claim:** ${valor}`);
  const status = texto.match(/^\*\*Status:\*\*.*$/m);
  if (status) return texto.replace(status[0], `${status[0]}\n**Claim:** ${valor}`);
  return `${texto.trimEnd()}\n\n**Claim:** ${valor}\n`;
}

const [accion, objetivo, quien] = process.argv.slice(2);
if (!accion || !["claim", "release", "status"].includes(accion)) {
  console.error("uso: claim-ticket.mjs claim|release|status <issue.md> [id]");
  process.exit(2);
}

if (accion === "status") {
  const dir = objetivo ? resolve(objetivo) : join(RAIZ, ".scratch");
  let ocupados = 0;
  for (const archivo of archivosIssue(dir)) {
    const claim = claimDe(readFileSync(archivo, "utf8"));
    if (claim === "libre") continue;
    ocupados += 1;
    console.log(`${relative(RAIZ, archivo).replace(/\\/g, "/")} -> ${claim}`);
  }
  if (ocupados === 0) console.log("ningún ticket reclamado");
  process.exit(0);
}

if (!objetivo || !quien) {
  console.error("claim y release necesitan <issue.md> y <id-de-sesión>");
  process.exit(2);
}
const ruta = resolve(objetivo);
if (!existsSync(ruta)) {
  console.error(`no existe: ${objetivo}`);
  process.exit(2);
}
const texto = readFileSync(ruta, "utf8");
const actual = claimDe(texto);
if (accion === "claim") {
  if (actual !== "libre" && actual !== quien) {
    console.error(`${objetivo} ya está reclamado por ${actual}`);
    process.exit(1);
  }
  writeFileSync(ruta, fijarClaim(texto, quien));
  console.log(`${objetivo} reclamado por ${quien}`);
} else {
  if (actual !== quien) {
    console.error(`${objetivo} está reclamado por ${actual}, no por ${quien}`);
    process.exit(1);
  }
  writeFileSync(ruta, fijarClaim(texto, "libre"));
  console.log(`${objetivo} liberado por ${quien}`);
}
