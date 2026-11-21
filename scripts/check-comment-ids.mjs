// P10-25: chequea comentarios nuevos en src/ (ADR-0064, PLAN-COM-01-E).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extraerIdsDeTexto, cargarIdsConocidos, sugerirIdDeRama } from "./comentarios-ids-lib.mjs";
import {
  COM_S7_FRASES,
  ENLACE_ISSUE,
  RE_CLASE,
  SOLO_SEPARADOR,
  mensajeComS7,
  mensajeIdDesconocido,
  mensajeJSDoc,
  mensajeSinClase,
  mensajeSinId,
  pieCheckMecanico,
} from "./comentarios-politica.mjs";
import { agruparBloquesLinea, comentariosNuevos } from "./comentarios-scan-lib.mjs";

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function gitOk(...args) {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function commitExiste(ref) {
  return gitOk("cat-file", "-e", `${ref}^{commit}`);
}

function enAlcance(archivo) {
  return archivo.startsWith("src/") && !archivo.endsWith(".md");
}

const explicito = process.argv.slice(2).find((a) => !a.startsWith("-"));
const envBase = String(process.env.COMMENT_CHECK_BASE ?? "").trim();
let baseFijada = "";
try {
  baseFijada = String(JSON.parse(readFileSync("scripts/comment-rule-base.json", "utf8")).base ?? "").trim();
} catch {
  baseFijada = "";
}

const raiz = process.cwd();
let base =
  explicito ||
  envBase ||
  baseFijada ||
  git("merge-base", "HEAD", "origin/main").trim() ||
  git("merge-base", "HEAD", "main").trim();

if (!base) {
  console.error(
    "check-comment-ids: no se pudo resolver la base (probá fetch de origin/main o pasá un SHA con argumento).",
  );
  process.exit(1);
}

if (!commitExiste(base)) {
  console.error(`check-comment-ids: la base no existe en este repo: ${base}`);
  process.exit(1);
}

const idsConocidos = cargarIdsConocidos(raiz);
const sugerenciaRama = sugerirIdDeRama(raiz, base);

function leerEnBase(archivo) {
  try {
    return execFileSync("git", ["show", `${base}:${archivo}`], { encoding: "utf8", cwd: raiz });
  } catch {
    return "";
  }
}

function archivosAEscanear() {
  const set = new Set();
  for (const diff of [
    git("diff", "--name-only", `${base}...HEAD`),
    git("diff", "--name-only", "HEAD"),
    git("ls-files", "--others", "--exclude-standard"),
  ]) {
    for (const f of diff.split("\n").filter(Boolean)) {
      if (enAlcance(f)) set.add(f);
    }
  }
  return [...set].sort();
}

/** @type {{ tipo: string, archivo: string, linea?: number, vista?: string, detalle?: string }[]} */
const problemas = [];

for (const archivo of archivosAEscanear()) {
  const head = existsSync(archivo) ? readFileSync(archivo, "utf8") : "";
  const viejo = leerEnBase(archivo);
  const nuevos = comentariosNuevos(head, viejo, archivo);

  for (const c of nuevos) {
    if (c.kind === "jsdoc") {
      problemas.push({ tipo: "jsdoc", archivo, linea: c.linea, vista: c.texto.trim().slice(0, 80) });
      continue;
    }
    if (c.kind === "line" && SOLO_SEPARADOR.test(c.texto)) continue;

    const textoPlano = c.texto.replace(/^\s*\/\/\s?/, "").replace(/^\/\*+/, "").replace(/\*\/$/, "");
    for (const frase of COM_S7_FRASES) {
      if (frase.patron.test(textoPlano) && !ENLACE_ISSUE.test(textoPlano)) {
        problemas.push({ tipo: "com-s7", archivo, linea: c.linea, vista: c.texto.trim() });
      }
    }
  }

  const bloques = agruparBloquesLinea(nuevos.map((c) => ({ ...c, archivo })));
  for (const b of bloques) {
    const cuerpo = b.lineas.map((l) => l.cuerpo).join("\n");
    if (!cuerpo.trim()) continue;

    const candidatos = extraerIdsDeTexto(cuerpo);
    const idValido = candidatos.find((id) => idsConocidos.has(id));
    const falsoId = candidatos.find((id) => !idsConocidos.has(id));

    if (!idValido) {
      const mal = falsoId ?? candidatos[0];
      if (mal) {
        problemas.push({
          tipo: "id-desconocido",
          archivo,
          linea: b.lineas[0].linea,
          detalle: mensajeIdDesconocido(mal, archivo, b.lineas[0].linea, sugerenciaRama),
        });
      } else {
        problemas.push({
          tipo: "sin-id",
          archivo,
          linea: b.lineas[0].linea,
          detalle: mensajeSinId(archivo, b.lineas[0].linea, sugerenciaRama),
        });
      }
    } else if (!RE_CLASE.test(cuerpo)) {
      problemas.push({
        tipo: "sin-clase",
        archivo,
        linea: b.lineas[0].linea,
      });
    }
  }

  for (const c of nuevos.filter((x) => x.kind === "block" || x.kind === "html")) {
    const cuerpo = c.texto;
    const candidatos = extraerIdsDeTexto(cuerpo);
    const idValido = candidatos.find((id) => idsConocidos.has(id));
    if (candidatos.length && !idValido) {
      const mal = candidatos.find((id) => !idsConocidos.has(id));
      if (mal) {
        problemas.push({
          tipo: "id-desconocido",
          archivo,
          linea: c.linea,
          detalle: mensajeIdDesconocido(mal, archivo, c.linea, sugerenciaRama),
        });
      }
    }
    if (idValido && !RE_CLASE.test(cuerpo)) {
      problemas.push({ tipo: "sin-clase", archivo, linea: c.linea });
    }
    if (!candidatos.length && c.kind !== "html") {
      problemas.push({
        tipo: "sin-id",
        archivo,
        linea: c.linea,
        detalle: mensajeSinId(archivo, c.linea, sugerenciaRama),
      });
    }
  }
}

if (problemas.length) {
  console.error(`check-comment-ids: ${problemas.length} problema(s) (base ${base}, alcance src/):`);
  for (const p of problemas) {
    if (p.tipo === "id-desconocido") console.error(`  ${p.detalle}`);
    else if (p.tipo === "jsdoc") console.error(`  ${mensajeJSDoc(p.archivo, p.linea)}`);
    else if (p.tipo === "sin-id") console.error(`  ${p.detalle}`);
    else if (p.tipo === "sin-clase") console.error(`  ${mensajeSinClase(p.archivo, p.linea)}`);
    else if (p.tipo === "com-s7") console.error(`  ${mensajeComS7(p.archivo, p.linea, p.vista)}`);
  }
  console.error("");
  console.error(pieCheckMecanico());
  console.error("Regenerá punteros: npm run docs:comentarios");
  process.exit(1);
}

console.log(`check-comment-ids ok (base ${base}, alcance src/)`);