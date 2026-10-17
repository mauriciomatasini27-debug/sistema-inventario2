// Lógica pura del gate `interface-review` por PR (testeada en tests/cadena-interface-review.test.ts).
// Sin I/O: recibe el cuerpo del PR y la lista de archivos {filename, status}.

const RX_VISUAL = /^src\/.*\.(?:astro|css|tsx|jsx)$/;

/** true solo para fuentes visuales bajo src: astro, css, tsx, jsx. */
export function esArchivoVisual(path) {
  return typeof path === "string" && RX_VISUAL.test(path);
}

/** Nombres de los archivos visuales que el PR agrega o modifica (descarta status "removed"). */
export function archivosVisuales(files) {
  return (files ?? [])
    .filter((f) => f && f.status !== "removed" && esArchivoVisual(f.filename))
    .map((f) => f.filename);
}

function esEncabezado(linea) {
  return /^(#{1,6})\s+(.*)$/.exec(linea);
}

/** Cuerpo de la primera sección cuyo encabezado markdown contiene "interface-review" (case-insensitive). */
export function seccionRevision(cuerpo) {
  const lineas = String(cuerpo ?? "").split(/\r?\n/);
  let enCodigo = false;
  let nivel = 0;
  let encontrada = false;
  const buffer = [];
  for (const linea of lineas) {
    if (/^\s*```/.test(linea)) {
      enCodigo = !enCodigo;
      if (encontrada) buffer.push(linea);
      continue;
    }
    if (!enCodigo) {
      const m = esEncabezado(linea);
      if (m) {
        if (!encontrada) {
          if (/interface-review/i.test(m[2])) {
            encontrada = true;
            nivel = m[1].length;
            continue;
          }
        } else if (m[1].length <= nivel) {
          return buffer.join("\n");
        }
      }
    }
    if (encontrada) buffer.push(linea);
  }
  return encontrada ? buffer.join("\n") : null;
}

/** "Approve" | "Block" | null de una línea con Verdict/Veredicto seguido de Approve/Block. */
export function veredicto(seccion) {
  if (seccion == null) return null;
  for (const linea of String(seccion).split(/\r?\n/)) {
    const marca = /(verdict|veredicto)/i.exec(linea);
    if (!marca) continue;
    const valor = /\b(Approve|Block)\b/i.exec(linea.slice(marca.index + marca[0].length));
    if (valor) {
      const v = valor[1].toLowerCase();
      return v === "approve" ? "Approve" : "Block";
    }
  }
  return null;
}

function dividirCeldas(linea) {
  let s = linea.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function esSeparador(linea) {
  if (!linea.includes("|")) return false;
  const celdas = dividirCeldas(linea);
  return celdas.length > 0 && celdas.every((c) => /^:?-+:?$/.test(c));
}

function filasDeTabla(seccion) {
  const lineas = String(seccion ?? "").split(/\r?\n/);
  const filas = [];
  let header = null;
  let subseccion = "";
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const enc = esEncabezado(linea);
    if (enc) subseccion = enc[2];
    if (!linea.includes("|")) {
      header = null;
      continue;
    }
    if (header === null) {
      if (i + 1 < lineas.length && esSeparador(lineas[i + 1])) {
        header = dividirCeldas(linea);
        i++;
        continue;
      }
      header = [];
    }
    filas.push({ celdas: dividirCeldas(linea), header, subseccion });
  }
  return filas;
}

// Cierre: en la celda Status ("Regression · Resuelto") o, sin columna Status, una celda que
// sea solo la marca. Nunca por la palabra suelta en Why ("Fixed header tapa...").
const CERRADO = /\b(resuelto|corregido|fixed)\b/i;
const CELDA_CERRADO = /^[^\p{L}\p{N}]*(resuelto|corregido|fixed)[^\p{L}\p{N}]*$/iu;
const PREEXISTENTE = /pre-?existing|preexistente/i;

/** HIGH abiertos: severidad HIGH, sin Status Pre-existing y sin marca de cerrado. */
export function highsAbiertos(seccion) {
  const out = [];
  for (const { celdas, header, subseccion } of filasDeTabla(seccion)) {
    // Formato interface-review: los Pre-existing van en su propia tabla sin Status.
    if (PREEXISTENTE.test(subseccion)) continue;
    const columna = (rx) => header.findIndex((c) => rx.test(c));
    const sevIdx = columna(/^(severity|severidad)$/i);
    const statusIdx = columna(/^(status|estado)$/i);
    const locIdx = columna(/^(location|ubicaci[oó]n)$/i);
    const whyIdx = columna(/^why$/i);
    const celda = (i) => (i >= 0 ? (celdas[i] ?? "") : "");
    const sev = celdas[sevIdx >= 0 ? sevIdx : 0] ?? "";
    if (!/\bhigh\b/i.test(sev) || /~~/.test(sev)) continue;
    if (statusIdx >= 0) {
      if (PREEXISTENTE.test(celda(statusIdx)) || CERRADO.test(celda(statusIdx))) continue;
    } else if (celdas.some((c) => CELDA_CERRADO.test(c))) continue;
    out.push({ location: celda(locIdx), why: celda(whyIdx) });
  }
  return out;
}

function listaNombres(nombres) {
  return nombres.length > 3 ? `${nombres.slice(0, 3).join(", ")}…` : nombres.join(", ");
}

/** { aplica, motivos[] }: aplica cuando el PR toca archivos visuales; motivos explican el bloqueo. */
export function evaluarRevision({ cuerpo, files }) {
  const visuales = archivosVisuales(files);
  if (visuales.length === 0) return { aplica: false, motivos: [] };

  const motivos = [];
  const seccion = seccionRevision(cuerpo);
  if (seccion == null) {
    motivos.push(
      `PR visual (${visuales.length} archivos: ${listaNombres(visuales)}) sin sección \`## interface-review\` en el cuerpo`,
    );
    return { aplica: true, motivos };
  }

  const v = veredicto(seccion);
  if (v === null) motivos.push("falta el veredicto (Approve o Block) en la sección interface-review");
  else if (v === "Block") motivos.push("el veredicto de interface-review es Block");
  for (const h of highsAbiertos(seccion)) {
    motivos.push(`HIGH abierto en interface-review: ${h.location || "sin ubicación"}${h.why ? ` (${h.why})` : ""}`);
  }
  return { aplica: true, motivos };
}
