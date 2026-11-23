// AUD-S3/ADR-0126: verifica que cada tabla y columna referenciada en el SQL crudo de `src/`
// exista en `src/db/schema*.ts`. Es análisis estático: no abre ninguna base.
//
// Qué cubre (y qué no), para que el gate no dé falsos positivos:
// - Interpolaciones de objetos del schema: `${tabla}` y `${tabla.propiedad}` se resuelven
//   a `"tabla"` y `"tabla"."columna"` y se validan siempre.
// - Sentencias completas (`select`, `insert`, `update`, `delete`): tabla de `from|join|into|update`,
//   columnas calificadas (`alias.columna`), lista de columnas del `insert` y destinos del `set`.
// - Columnas sin calificar solo cuando la sentencia toca una única tabla real (sin CTEs): con
//   joins serían ambiguas.
// - No cubre fragmentos sueltos (`sql\`estado = 'pendiente'\`` dentro de un `sql.join`), CTEs
//   como fuente (`from ranked`) ni SQL armado en runtime con `sql.raw`.
// Los `sql\`` de `src/db/schema*.ts` no se escanean: ese archivo es la referencia.

const CLAVES_TABLA = new Set(["from", "join", "into", "update"]);
const CLAVES_SET_FIN = new Set(["from", "where", "returning"]);

// Palabras que pueden aparecer en el SQL sin ser una columna.
const PALABRAS_SQL = new Set([
  "all",
  "and",
  "any",
  "as",
  "asc",
  "between",
  "by",
  "case",
  "cast",
  "collate",
  "conflict",
  "cross",
  "current_date",
  "current_time",
  "current_timestamp",
  "default",
  "delete",
  "desc",
  "distinct",
  "do",
  "else",
  "end",
  "escape",
  "exists",
  "false",
  "filter",
  "first",
  "for",
  "from",
  "full",
  "group",
  "having",
  "ilike",
  "in",
  "inner",
  "insert",
  "intersect",
  "interval",
  "into",
  "is",
  "join",
  "last",
  "lateral",
  "left",
  "like",
  "limit",
  "natural",
  "next",
  "no",
  "not",
  "nothing",
  "now",
  "null",
  "nulls",
  "offset",
  "on",
  "only",
  "or",
  "order",
  "outer",
  "over",
  "partition",
  "recursive",
  "returning",
  "right",
  "row",
  "rows",
  "select",
  "set",
  "similar",
  "some",
  "then",
  "true",
  "union",
  "update",
  "using",
  "values",
  "when",
  "where",
  "window",
  "with",
  "within",
]);

function esInicioIdentificador(c) {
  return Boolean(c) && /[A-Za-z_]/.test(c);
}

function esParteIdentificador(c) {
  return Boolean(c) && /[\w$]/.test(c);
}

function lineaDe(texto, indice) {
  let linea = 1;
  for (let i = 0; i < indice && i < texto.length; i += 1) if (texto[i] === "\n") linea += 1;
  return linea;
}

/** @param {string} texto @param {number} inicio índice de `{` @returns {number} índice del `}` que cierra */
function finDeExpresion(texto, inicio) {
  let profundidad = 0;
  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === '"' || c === "'" || c === "`") {
      const cierre = saltarCadena(texto, i);
      if (cierre < 0) return -1;
      i = cierre;
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      const fin = texto.indexOf("*/", i + 2);
      if (fin < 0) return -1;
      i = fin + 1;
      continue;
    }
    if (c === "/" && texto[i + 1] === "/") {
      const fin = texto.indexOf("\n", i + 2);
      if (fin < 0) return -1;
      i = fin;
      continue;
    }
    if (c === "{") profundidad += 1;
    else if (c === "}") {
      profundidad -= 1;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

/** @param {string} texto @param {number} inicio índice de la comilla @returns {number} índice de la comilla de cierre */
function saltarCadena(texto, inicio) {
  const comilla = texto[inicio];
  for (let i = inicio + 1; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === "\\") {
      i += 1;
      continue;
    }
    if (c === comilla) {
      if (comilla !== "`" && texto[i + 1] === comilla) {
        i += 1;
        continue;
      }
      return i;
    }
    if (comilla === "`" && c === "$" && texto[i + 1] === "{") {
      const fin = finDeExpresion(texto, i + 1);
      if (fin < 0) return -1;
      i = fin;
    }
  }
  return -1;
}

/**
 * Lee un template `` `...` `` desde el backtick y devuelve el texto con las interpolaciones
 * reemplazadas por `?`, la expresión de cada una y su offset en ese texto.
 */
function leerPlantilla(fuente, inicio) {
  let texto = "";
  const exprs = [];
  let i = inicio + 1;
  while (i < fuente.length) {
    const c = fuente[i];
    if (c === "\\") {
      texto += fuente.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === "`") return { sql: texto, exprs, fin: i + 1 };
    if (c === "$" && fuente[i + 1] === "{") {
      const fin = finDeExpresion(fuente, i + 1);
      if (fin < 0) return null;
      exprs.push({ expr: fuente.slice(i + 2, fin).trim(), offset: texto.length });
      texto += "?";
      i = fin + 1;
      continue;
    }
    texto += c;
    i += 1;
  }
  return null;
}

/**
 * Extrae los template literales `sql\`...\`` de una fuente TypeScript.
 * @param {string} fuente
 * @returns {Array<{ sql: string, exprs: Array<{ expr: string, offset: number }>, linea: number }>}
 */
export function extraerPlantillasSql(fuente) {
  const salida = [];
  const re = /\bsql\s*`/g;
  for (let m = re.exec(fuente); m; m = re.exec(fuente)) {
    const antes = fuente[m.index - 1];
    if (esParteIdentificador(antes)) continue;
    const inicioLinea = fuente.lastIndexOf("\n", m.index) + 1;
    const antesEnLinea = fuente.slice(inicioLinea, m.index);
    if (antesEnLinea.includes("//") || antesEnLinea.trimStart().startsWith("*")) continue;
    const plantilla = leerPlantilla(fuente, m.index + m[0].length - 1);
    if (!plantilla) continue;
    re.lastIndex = plantilla.fin;
    if (!plantilla.sql.trim()) continue;
    salida.push({ sql: plantilla.sql, exprs: plantilla.exprs, linea: lineaDe(fuente, m.index) });
  }
  return salida;
}

/**
 * Resuelve las interpolaciones contra los exports de `src/db/schema*.ts`.
 * @param {{ sql: string, exprs: Array<{ expr: string, offset: number }> }} plantilla
 * @param {Map<string, { tabla: string, propiedades: Record<string, string> }>} exportaciones
 * @returns {{ sql: string, refs: Array<{ tabla: string, columna: string|null }> }}
 */
export function resolverInterpolaciones(plantilla, exportaciones) {
  const refs = [];
  const porOffset = new Map(plantilla.exprs.map((e) => [e.offset, e.expr]));
  let sql = "";
  for (let i = 0; i < plantilla.sql.length; i += 1) {
    const expr = porOffset.get(i);
    if (expr === undefined) {
      sql += plantilla.sql[i];
      continue;
    }
    const punto = /^([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)$/.exec(expr);
    if (punto) {
      const entrada = exportaciones.get(punto[1]);
      const columna = entrada?.propiedades?.[punto[2]];
      if (entrada && columna) {
        sql += `"${entrada.tabla}"."${columna}"`;
        refs.push({ tabla: entrada.tabla, columna });
      } else if (entrada) {
        sql += `"${entrada.tabla}".?`;
      } else {
        sql += "?";
      }
      continue;
    }
    const simple = /^([A-Za-z_$][\w$]*)$/.exec(expr);
    if (simple) {
      const entrada = exportaciones.get(simple[1]);
      if (entrada) {
        sql += `"${entrada.tabla}"`;
        refs.push({ tabla: entrada.tabla, columna: null });
        continue;
      }
    }
    sql += "?";
  }
  return { sql, refs };
}

/** @param {string} sql @returns {Array<{ t: "palabra"|"numero"|"cadena"|"param"|"simbolo", v: string }>} */
export function tokenizar(sqlTexto) {
  const tokens = [];
  let i = 0;
  while (i < sqlTexto.length) {
    const c = sqlTexto[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "-" && sqlTexto[i + 1] === "-") {
      const fin = sqlTexto.indexOf("\n", i + 2);
      i = fin < 0 ? sqlTexto.length : fin + 1;
      continue;
    }
    if (c === "/" && sqlTexto[i + 1] === "*") {
      const fin = sqlTexto.indexOf("*/", i + 2);
      i = fin < 0 ? sqlTexto.length : fin + 2;
      continue;
    }
    if (c === '"') {
      const fin = saltarCadena(sqlTexto, i);
      if (fin < 0) break;
      tokens.push({ t: "palabra", v: sqlTexto.slice(i + 1, fin) });
      i = fin + 1;
      continue;
    }
    if (c === "'") {
      const fin = saltarCadena(sqlTexto, i);
      if (fin < 0) break;
      tokens.push({ t: "cadena", v: sqlTexto.slice(i, fin + 1) });
      i = fin + 1;
      continue;
    }
    if (c === "?" || (c === "$" && /[0-9]/.test(sqlTexto[i + 1] ?? ""))) {
      let fin = i + 1;
      while (fin < sqlTexto.length && /[0-9]/.test(sqlTexto[fin])) fin += 1;
      tokens.push({ t: "param", v: sqlTexto.slice(i, fin) });
      i = fin;
      continue;
    }
    if (esInicioIdentificador(c)) {
      let fin = i + 1;
      while (fin < sqlTexto.length && esParteIdentificador(sqlTexto[fin])) fin += 1;
      tokens.push({ t: "palabra", v: sqlTexto.slice(i, fin) });
      i = fin;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let fin = i + 1;
      while (fin < sqlTexto.length && /[0-9.]/.test(sqlTexto[fin])) fin += 1;
      tokens.push({ t: "numero", v: sqlTexto.slice(i, fin) });
      i = fin;
      continue;
    }
    if (c === ":" && sqlTexto[i + 1] === ":") {
      tokens.push({ t: "simbolo", v: "::" });
      i += 2;
      continue;
    }
    tokens.push({ t: "simbolo", v: c });
    i += 1;
  }
  return tokens;
}

/** Nombres declarados en el `WITH` de una sentencia: no son tablas. */
function nombresCte(tokens) {
  const nombres = new Set();
  if (tokens[0]?.t !== "palabra" || tokens[0].v.toLowerCase() !== "with") return nombres;
  let i = 1;
  if (tokens[i]?.t === "palabra" && tokens[i].v.toLowerCase() === "recursive") i += 1;
  while (i < tokens.length) {
    if (tokens[i]?.t !== "palabra") break;
    const nombre = tokens[i].v.toLowerCase();
    let j = i + 1;
    if (tokens[j]?.v === "(") {
      let profundidad = 0;
      for (; j < tokens.length; j += 1) {
        if (tokens[j].v === "(") profundidad += 1;
        else if (tokens[j].v === ")") {
          profundidad -= 1;
          if (profundidad === 0) {
            j += 1;
            break;
          }
        }
      }
    }
    if (tokens[j]?.t !== "palabra" || tokens[j].v.toLowerCase() !== "as" || tokens[j + 1]?.v !== "(") break;
    nombres.add(nombre);
    let profundidad = 0;
    let k = j + 1;
    for (; k < tokens.length; k += 1) {
      if (tokens[k].v === "(") profundidad += 1;
      else if (tokens[k].v === ")") {
        profundidad -= 1;
        if (profundidad === 0) {
          k += 1;
          break;
        }
      }
    }
    if (tokens[k]?.v !== ",") break;
    i = k + 1;
  }
  return nombres;
}

/**
 * Referencias de tablas y columnas de una sentencia SQL completa.
 * @param {string} sentencia
 * @returns {{ tablas: Array<{ nombre: string, alias: string, cte: boolean }>, columnas: Array<{ tabla: string|null, columna: string }> }}
 */
export function parsearReferencias(sentencia) {
  const tokens = tokenizar(sentencia);
  const ctes = nombresCte(tokens);
  const tablas = [];
  const columnas = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.t !== "palabra") continue;
    const clave = t.v.toLowerCase();
    if (!CLAVES_TABLA.has(clave)) continue;
    let j = i + 1;
    while (tokens[j]?.t === "palabra" && ["only", "lateral"].includes(tokens[j].v.toLowerCase())) j += 1;
    if (tokens[j]?.v === "(") continue;
    if (tokens[j]?.t !== "palabra") continue;
    let nombre = tokens[j].v;
    let k = j;
    if (tokens[j + 1]?.v === "." && tokens[j + 2]?.t === "palabra") {
      nombre = tokens[j + 2].v;
      k = j + 2;
    }
    // En `insert into t (col, ...)` el paréntesis es la lista de columnas, no una función.
    if (tokens[k + 1]?.v === "(" && clave !== "into") continue;
    // `on conflict do update set` no introduce una tabla nueva.
    if (clave === "update" && tokens[i - 1]?.v?.toLowerCase() === "do") continue;
    let alias = nombre;
    if (tokens[k + 1]?.t === "palabra" && tokens[k + 1].v.toLowerCase() === "as" && tokens[k + 2]?.t === "palabra") {
      alias = tokens[k + 2].v;
    } else if (
      tokens[k + 1]?.t === "palabra" &&
      !PALABRAS_SQL.has(tokens[k + 1].v.toLowerCase()) &&
      !["join", "inner", "left", "right", "full", "cross"].includes(tokens[k + 1].v.toLowerCase())
    ) {
      alias = tokens[k + 1].v;
    }
    if (!tablas.some((otra) => otra.alias.toLowerCase() === alias.toLowerCase())) {
      tablas.push({ nombre, alias, cte: ctes.has(nombre.toLowerCase()) });
    }
  }

  const mapaAlias = new Map();
  for (const tabla of tablas) {
    mapaAlias.set(tabla.alias.toLowerCase(), tabla);
    mapaAlias.set(tabla.nombre.toLowerCase(), tabla);
  }

  // Columnas calificadas: alias.columna, en cualquier parte de la sentencia.
  for (let i = 0; i < tokens.length - 2; i += 1) {
    if (tokens[i].t !== "palabra" || tokens[i + 1].v !== "." || tokens[i + 2].t !== "palabra") continue;
    const tabla = mapaAlias.get(tokens[i].v.toLowerCase());
    if (!tabla || tabla.cte) continue;
    columnas.push({ tabla: tabla.nombre, columna: tokens[i + 2].v });
  }

  // INSERT INTO tabla (col1, col2, ...)
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].t !== "palabra" || tokens[i].v.toLowerCase() !== "into") continue;
    let j = i + 1;
    while (tokens[j]?.t === "palabra" && ["only"].includes(tokens[j].v.toLowerCase())) j += 1;
    if (tokens[j]?.t !== "palabra") continue;
    let k = j;
    if (tokens[j + 1]?.v === "." && tokens[j + 2]?.t === "palabra") k = j + 2;
    if (tokens[k + 1]?.v !== "(") continue;
    const tabla = tablas.find((x) => x.nombre.toLowerCase() === tokens[k].v.toLowerCase()) ?? null;
    if (!tabla || tabla.cte) continue;
    let profundidad = 0;
    for (let x = k + 1; x < tokens.length; x += 1) {
      if (tokens[x].v === "(") profundidad += 1;
      else if (tokens[x].v === ")") {
        profundidad -= 1;
        if (profundidad === 0) break;
      } else if (profundidad === 1 && tokens[x].t === "palabra") {
        columnas.push({ tabla: tabla.nombre, columna: tokens[x].v });
      }
    }
  }

  // UPDATE tabla SET destino = ..., destino = ...
  const tablaUpdate = tablas.find((x) => !x.cte && sentencia.trimStart().toLowerCase().startsWith("update"));
  if (tablaUpdate) {
    const iSet = tokens.findIndex((t) => t.t === "palabra" && t.v.toLowerCase() === "set");
    if (iSet >= 0) {
      let profundidad = 0;
      for (let i = iSet + 1; i < tokens.length; i += 1) {
        const t = tokens[i];
        if (t.v === "(") profundidad += 1;
        else if (t.v === ")") profundidad -= 1;
        if (profundidad > 0) continue;
        if (t.t === "palabra" && CLAVES_SET_FIN.has(t.v.toLowerCase())) break;
        if (t.t !== "palabra") continue;
        if (tokens[i - 1]?.v === "." || tokens[i + 1]?.v === ".") continue;
        if (tokens[i + 1]?.v === "=") columnas.push({ tabla: tablaUpdate.nombre, columna: t.v });
      }
    }
  }

  // Columnas sin calificar: solo si la sentencia toca una única tabla real y ninguna CTE.
  const reales = tablas.filter((x) => !x.cte);
  if (reales.length === 1 && tablas.length === 1) {
    const tabla = reales[0];
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (t.t !== "palabra") continue;
      const palabra = t.v.toLowerCase();
      if (PALABRAS_SQL.has(palabra)) continue;
      if (mapaAlias.has(palabra) || ctes.has(palabra)) continue;
      if (tokens[i - 1]?.v?.toLowerCase() === "as" || tokens[i - 1]?.v === "::") continue;
      if (tokens[i + 1]?.v === "(" || tokens[i + 1]?.v === "." || tokens[i - 1]?.v === ".") continue;
      columnas.push({ tabla: tabla.nombre, columna: t.v });
    }
  }

  return { tablas, columnas: deduplicarColumnas(columnas) };
}

/** Una misma columna puede aparecer en el `set`, la lista del `insert` y el `where`. */
function deduplicarColumnas(columnas) {
  const vistas = new Set();
  return columnas.filter((c) => {
    const clave = `${(c.tabla ?? "").toLowerCase()}.${c.columna.toLowerCase()}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

/**
 * Hallazgos de una sentencia contra el estado del schema.
 * @param {{ tablas: Record<string, { columnas: Record<string, unknown> }> }} estado
 * @param {{ tablas: Array<{ nombre: string, cte: boolean }>, columnas: Array<{ tabla: string|null, columna: string }> }} referencias
 * @returns {Array<{ tipo: "tabla"|"columna", tabla: string, columna?: string }>}
 */
export function verificarReferencias(estado, referencias) {
  const hallazgos = [];
  const vistas = new Set();
  for (const tabla of referencias.tablas) {
    if (tabla.cte) continue;
    const clave = `t:${tabla.nombre.toLowerCase()}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    if (!estado.tablas[tabla.nombre]) hallazgos.push({ tipo: "tabla", tabla: tabla.nombre });
  }
  for (const col of referencias.columnas) {
    if (!col.tabla) continue;
    const declarada = estado.tablas[col.tabla];
    if (!declarada) continue;
    const clave = `c:${col.tabla}:${col.columna.toLowerCase()}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    if (!declarada.columnas[col.columna]) hallazgos.push({ tipo: "columna", tabla: col.tabla, columna: col.columna });
  }
  return hallazgos;
}

/**
 * Analiza una fuente TypeScript completa y devuelve los hallazgos con file:line.
 * @param {string} archivo
 * @param {string} fuente
 * @param {{ tablas: Record<string, { columnas: Record<string, unknown> }> }} estado
 * @param {Map<string, { tabla: string, propiedades: Record<string, string> }>} exportaciones
 */
export function analizarFuente(archivo, fuente, estado, exportaciones) {
  const hallazgos = [];
  const vistos = new Set();
  const agregar = (hallazgo) => {
    const clave = `${hallazgo.tipo}:${hallazgo.tabla}:${hallazgo.columna ?? ""}:${hallazgo.linea}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    hallazgos.push(hallazgo);
  };
  for (const plantilla of extraerPlantillasSql(fuente)) {
    const resuelta = resolverInterpolaciones(plantilla, exportaciones);
    for (const ref of resuelta.refs) {
      const declarada = estado.tablas[ref.tabla];
      if (!declarada) {
        agregar({ archivo, linea: plantilla.linea, tipo: "tabla", tabla: ref.tabla });
        continue;
      }
      if (ref.columna && !declarada.columnas[ref.columna]) {
        agregar({ archivo, linea: plantilla.linea, tipo: "columna", tabla: ref.tabla, columna: ref.columna });
      }
    }
    const refs = parsearReferencias(resuelta.sql);
    for (const h of verificarReferencias(estado, refs)) agregar({ archivo, linea: plantilla.linea, ...h });
  }
  return hallazgos;
}

/** @param {{ archivo: string, linea: number, tipo: string, tabla: string, columna?: string }} h */
export function formatearHallazgo(h) {
  const sujeto = h.columna ? `${h.tabla}.${h.columna}` : h.tabla;
  const que = h.columna ? "columna" : "tabla";
  return `${h.archivo}:${h.linea}: ${que} inexistente ${sujeto} (no está en src/db/schema*.ts)`;
}
