// Lógica pura del guard de merge (testeada en tests/cadena-puede-mergear.test.ts).
import { evaluarRevision } from "./interface-review-lib.mjs";

const PATRON_NO_MERGEAR = /\b(no\s+mergear|do\s+not\s+merge)\b/i;

/** Devuelve la frase encontrada ("No mergear", "DO NOT MERGE", ...) o null. */
export function marcaNoMergear(...textos) {
  for (const t of textos) {
    const m = PATRON_NO_MERGEAR.exec(t ?? "");
    if (m) return m[0];
  }
  return null;
}

/** Tags de migraciones listadas en docs/roadmap/migraciones-aplicadas.md (líneas "- <tag>"). */
export function parsearRegistro(md) {
  const tags = new Set();
  for (const linea of (md ?? "").split(/\r?\n/)) {
    const m = /^\s*[-*]\s+`?([0-9]{4}_[A-Za-z0-9_]+)`?\s*$/.exec(linea);
    if (m) tags.add(m[1]);
  }
  return tags;
}

/** Tags de migraciones SQL que el PR agrega o modifica (archivos drizzle/<tag>.sql). */
export function migracionesDelPr(files) {
  return files
    .filter((f) => f.status !== "removed" && /^drizzle\/[^/]+\.sql$/.test(f.filename))
    .map((f) => f.filename.slice("drizzle/".length, -".sql".length));
}

/** Evalúa el PR. Devuelve { ok, motivos[] }. */
export function evaluar({ titulo, cuerpo, files, registroMd }) {
  const motivos = [];
  const marca = marcaNoMergear(titulo, cuerpo);
  if (marca) motivos.push(`el título o cuerpo dice "${marca}"`);
  const registradas = parsearRegistro(registroMd);
  for (const tag of migracionesDelPr(files)) {
    if (!registradas.has(tag)) {
      motivos.push(`migración drizzle/${tag}.sql no figura en docs/roadmap/migraciones-aplicadas.md de la rama base (no aplicada en la base real)`);
    }
  }
  motivos.push(...evaluarRevision({ cuerpo, files }).motivos);
  return { ok: motivos.length === 0, motivos };
}
