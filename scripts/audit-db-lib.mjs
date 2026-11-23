// AUD-S1 (ADR-0125): diff determinista base real ↔ src/db/schema*.ts ↔ drizzle/*.sql.
// Todo lo de acá es puro: el CLI lee archivos y consulta la base, estas funciones solo comparan.
// El parser de schema no usa el compilador: lee el estilo declarativo de pgTable(...) del repo.

const CONSTRUCTORES_TIPO = {
  uuid: "uuid",
  text: "text",
  varchar: "character varying",
  char: "character",
  bigint: "bigint",
  integer: "integer",
  smallint: "smallint",
  boolean: "boolean",
  jsonb: "jsonb",
  json: "json",
  timestamp: "timestamp without time zone",
  date: "date",
  numeric: "numeric",
  decimal: "numeric",
  real: "real",
  doubleprecision: "double precision",
  time: "time without time zone",
};

const ALIAS_TIPO = {
  varchar: "character varying",
  timestamptz: "timestamp with time zone",
  timestamp: "timestamp without time zone",
  timetz: "time with time zone",
  time: "time without time zone",
  int: "integer",
  int4: "integer",
  int8: "bigint",
  int2: "smallint",
  serial: "integer",
  bigserial: "bigint",
  bool: "boolean",
  float8: "double precision",
  float4: "real",
  decimal: "numeric",
};

const CONTINUACIONES_TIPO = {
  character: ["varying"],
  timestamp: ["with time zone", "without time zone"],
  time: ["with time zone", "without time zone"],
  double: ["precision"],
  bit: ["varying"],
};

/**
 * @typedef {{ tipo: string, notNull: boolean, default: string|null, pk: boolean, unique?: boolean }} ColumnaEsperada
 * @typedef {{ columnas: Record<string, ColumnaEsperada>, indices: Record<string, { columnas: string[], unique: boolean, parcial: boolean, nombre?: string }>, pk: string[] }} TablaEsperada
 * @typedef {{ tabla: string, columnas: string[], refTabla: string, refColumnas: string[] }} FkEsperada
 * @typedef {{ tablas: Record<string, any>, fks: FkEsperada[] }} EstadoEsquema
 */

/** @param {string} tipo @param {{ largo?: number|null }} [opciones] */
export function canonizarTipo(tipo, { largo = null } = {}) {
  if (!tipo) return "";
  let t = String(tipo).trim().toLowerCase().replace(/\s+/g, " ");
  const arreglo = /\[\]$/.test(t) ? "[]" : "";
  t = t.replace(/\[\]$/, "");
  let largoFinal = largo;
  const conParams = t.match(/^([a-z ]+?)\s*\((\d+)(?:\s*,\s*(\d+))?\)$/);
  if (conParams) {
    const p = Number(conParams[2]);
    const s = conParams[3] === undefined ? null : Number(conParams[3]);
    t = conParams[1].trim();
    if (t === "character varying" || t === "character" || t === "varchar") {
      if (largoFinal == null) largoFinal = p;
    } else if (t === "numeric" || t === "decimal") {
      t = `numeric(${p}${s == null ? "" : `,${s}`})`;
    }
  }
  t = ALIAS_TIPO[t] ?? t;
  if (largoFinal != null && (t === "character varying" || t === "character")) {
    t = `${t}(${largoFinal})`;
  }
  return `${t}${arreglo}`;
}

export function canonizarDefault(expr) {
  if (expr == null) return null;
  let d = String(expr).trim();
  if (!d) return null;
  for (let i = 0; i < 4; i += 1) {
    const sinCast = d.replace(/::\s*[a-z_]+(\s+[a-z_ ]+)?(\[\])?$/i, "").trim();
    if (sinCast === d) break;
    d = sinCast;
  }
  d = d.replace(/^\((.*)\)$/s, "$1").trim();
  d = d.replace(/\s+/g, " ").toLowerCase();
  if (d === "null") return null;
  if (/^current_timestamp(\(\d\))?$/.test(d)) d = "now()";
  if (/^uuid_generate_v4\(\)$/.test(d)) d = "gen_random_uuid()";
  const quotado = /^'([^']*)'$/.exec(d);
  if (quotado) d = quotado[1];
  if (/^-?[\d.]+$/.test(d)) d = d.replace(/^(-?)0+(?=\d)/, "$1");
  return d;
}

// ----------------------------- Esquema Drizzle (TS) -----------------------------

function leerLiteral(texto, i) {
  const c = texto[i];
  if (c !== '"' && c !== "'" && c !== "`") return null;
  let valor = "";
  let j = i + 1;
  while (j < texto.length) {
    if (texto[j] === "\\") {
      valor += texto[j + 1] ?? "";
      j += 2;
      continue;
    }
    if (texto[j] === c) return { valor, fin: j + 1 };
    valor += texto[j];
    j += 1;
  }
  return null;
}

function saltar(texto, i) {
  let j = i;
  while (j < texto.length) {
    if (/\s/.test(texto[j])) {
      j += 1;
      continue;
    }
    if (texto[j] === "/" && texto[j + 1] === "/") {
      const fin = texto.indexOf("\n", j);
      j = fin < 0 ? texto.length : fin + 1;
      continue;
    }
    if (texto[j] === "/" && texto[j + 1] === "*") {
      const fin = texto.indexOf("*/", j + 2);
      j = fin < 0 ? texto.length : fin + 2;
      continue;
    }
    break;
  }
  return j;
}

function buscarCierre(texto, i, abre, cierra) {
  let profundidad = 0;
  let j = i;
  while (j < texto.length) {
    const c = texto[j];
    if (c === '"' || c === "'" || c === "`") {
      const lit = leerLiteral(texto, j);
      if (!lit) return -1;
      j = lit.fin;
      continue;
    }
    if (c === "/" && texto[j + 1] === "/") {
      const fin = texto.indexOf("\n", j);
      j = fin < 0 ? texto.length : fin + 1;
      continue;
    }
    if (c === "/" && texto[j + 1] === "*") {
      const fin = texto.indexOf("*/", j + 2);
      j = fin < 0 ? texto.length : fin + 2;
      continue;
    }
    if (c === abre) profundidad += 1;
    else if (c === cierra) {
      profundidad -= 1;
      if (profundidad === 0) return j;
    }
    j += 1;
  }
  return -1;
}

function dividirTopLevel(texto, separador = ",") {
  const partes = [];
  let actual = "";
  let profundidad = 0;
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '"' || c === "'" || c === "`") {
      const lit = leerLiteral(texto, i);
      if (lit) {
        actual += texto.slice(i, lit.fin);
        i = lit.fin;
        continue;
      }
    }
    if (c === "/" && texto[i + 1] === "/") {
      const fin = texto.indexOf("\n", i);
      i = fin < 0 ? texto.length : fin + 1;
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      const fin = texto.indexOf("*/", i + 2);
      i = fin < 0 ? texto.length : fin + 2;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") profundidad += 1;
    else if (c === ")" || c === "]" || c === "}") profundidad -= 1;
    if (c === separador && profundidad === 0) {
      partes.push(actual);
      actual = "";
      i += 1;
      continue;
    }
    actual += c;
    i += 1;
  }
  partes.push(actual);
  return partes;
}

function indiceTopLevel(texto, buscado) {
  let profundidad = 0;
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '"' || c === "'" || c === "`") {
      const lit = leerLiteral(texto, i);
      if (!lit) return -1;
      i = lit.fin;
      continue;
    }
    if (c === "/" && texto[i + 1] === "/") {
      const fin = texto.indexOf("\n", i);
      i = fin < 0 ? texto.length : fin + 1;
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      const fin = texto.indexOf("*/", i + 2);
      i = fin < 0 ? texto.length : fin + 2;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") profundidad += 1;
    else if (c === ")" || c === "]" || c === "}") profundidad -= 1;
    else if (c === buscado && profundidad === 0) return i;
    i += 1;
  }
  return -1;
}

// `$type<...>()` solo anota tipos de TypeScript: se quita antes de parsear para que
// `jsonb("x").$type<Rec>().notNull()` no corte la cadena en el genérico.
function eliminarTipoGenerico(texto) {
  let salida = "";
  let i = 0;
  for (;;) {
    const inicio = texto.indexOf(".$type", i);
    if (inicio < 0) return salida + texto.slice(i);
    salida += texto.slice(i, inicio);
    let j = inicio + 6;
    while (j < texto.length && /\s/.test(texto[j])) j += 1;
    if (texto[j] !== "<") {
      salida += texto.slice(inicio, j);
      i = j;
      continue;
    }
    let profundidad = 0;
    let k = j;
    for (; k < texto.length; k += 1) {
      if (texto[k] === "<") profundidad += 1;
      else if (texto[k] === ">") {
        profundidad -= 1;
        if (profundidad === 0) {
          k += 1;
          break;
        }
      }
    }
    while (k < texto.length && /\s/.test(texto[k])) k += 1;
    if (texto[k] === "(") {
      const cierre = buscarCierre(texto, k, "(", ")");
      if (cierre > 0) {
        i = cierre + 1;
        continue;
      }
    }
    salida += texto.slice(inicio, k);
    i = k;
  }
}

function parsearCadenaLlamadas(texto) {
  const inicio = saltar(texto, 0);
  const m = /^([A-Za-z_$][\w$]*)\s*\(/.exec(texto.slice(inicio));
  if (!m) return null;
  const abre = inicio + m[0].length - 1;
  const cierre = buscarCierre(texto, abre, "(", ")");
  if (cierre < 0) return null;
  const args = dividirTopLevel(texto.slice(abre + 1, cierre), ",");
  const metodos = [];
  let i = cierre + 1;
  for (let vuelta = 0; vuelta < 20; vuelta += 1) {
    i = saltar(texto, i);
    if (texto[i] !== ".") break;
    const m2 = /^\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(texto.slice(i));
    if (!m2) break;
    const abre2 = i + m2[0].length - 1;
    const cierre2 = buscarCierre(texto, abre2, "(", ")");
    if (cierre2 < 0) break;
    metodos.push({ nombre: m2[1], args: dividirTopLevel(texto.slice(abre2 + 1, cierre2), ",") });
    i = cierre2 + 1;
  }
  return { constructor: m[1], args, metodos };
}

function valorDefaultSql(texto) {
  const t = texto.trim();
  if (t === "true" || t === "false") return t;
  const numerico = t.replace(/_/g, "");
  if (/^-?\d+n$/.test(numerico)) return numerico.slice(0, -1);
  if (/^-?\d+(\.\d+)?$/.test(numerico)) return numerico;
  const sqlTag = /^sql\s*`([\s\S]*)`$/.exec(t);
  if (sqlTag) return sqlTag[1].replace(/\$\{[^}]*\}/g, "").trim();
  const lit = leerLiteral(t, 0);
  if (lit && lit.fin === t.length) return lit.valor;
  return t;
}

function resolverColumnaRef(texto, exportaciones, columnasPorPropiedad) {
  const m = /=>\s*([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)/.exec(texto);
  if (!m) return null;
  const refTabla = exportaciones.get(m[1]);
  const refCol = columnasPorPropiedad.get(refTabla)?.get(m[2]);
  if (!refTabla || !refCol) return null;
  return { refTabla, refColumnas: [refCol] };
}

function resolverArgColumna(arg, mapaPropiedad) {
  const t = arg.trim();
  const m = /^[A-Za-z_$][\w$]*\s*\.\s*([A-Za-z_$][\w$]*)$/.exec(t);
  if (m) return mapaPropiedad.get(m[1]) ?? m[1];
  const mSql = /^sql\s*`([\s\S]*)`$/.exec(t);
  if (mSql) {
    return mSql[1]
      .replace(/\$\{\s*[A-Za-z_$][\w$]*\s*\.\s*([A-Za-z_$][\w$]*)\s*\}/g, (_, p) => mapaPropiedad.get(p) ?? p)
      .replace(/"/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }
  return t.replace(/\s+/g, " ").toLowerCase();
}

function parsearElementoIndice(elemento, mapaPropiedad) {
  const texto = elemento.trim();
  const m = /^(uniqueIndex|index|primaryKey)\s*\(/.exec(texto);
  if (!m) return null;
  const abre = texto.indexOf("(");
  const cierre = buscarCierre(texto, abre, "(", ")");
  if (cierre < 0) return null;
  const args = dividirTopLevel(texto.slice(abre + 1, cierre), ",");
  if (m[1] === "primaryKey") {
    const objeto = args[0] ?? "";
    const mCols = /columns\s*:\s*\[([\s\S]*?)\]/.exec(objeto);
    const columnas = mCols ? dividirTopLevel(mCols[1], ",").map((c) => resolverArgColumna(c, mapaPropiedad)).filter(Boolean) : [];
    return { primaryKey: columnas };
  }
  const nombre = leerLiteral(args[0]?.trim() ?? "", 0)?.valor;
  if (!nombre) return null;
  const indice = { nombre, columnas: [], unique: m[1] === "uniqueIndex", parcial: false };
  let i = cierre + 1;
  for (let vuelta = 0; vuelta < 10; vuelta += 1) {
    i = saltar(texto, i);
    if (texto[i] !== ".") break;
    const m2 = /^\.\s*(on|where)\s*\(/.exec(texto.slice(i));
    if (!m2) break;
    const abre2 = i + m2[0].length - 1;
    const cierre2 = buscarCierre(texto, abre2, "(", ")");
    if (cierre2 < 0) break;
    if (m2[1] === "on") {
      indice.columnas = dividirTopLevel(texto.slice(abre2 + 1, cierre2), ",")
        .map((c) => resolverArgColumna(c, mapaPropiedad))
        .filter(Boolean);
    } else {
      indice.parcial = true;
    }
    i = cierre2 + 1;
  }
  return indice;
}

/** @param {string} fuente @returns {EstadoEsquema} */
export function parsearEsquemaTS(fuente) {
  const texto = eliminarTipoGenerico(String(fuente));
  const exportaciones = new Map();
  const reExport = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*pgTable\s*\(/g;
  for (let m = reExport.exec(texto); m; m = reExport.exec(texto)) {
    const abre = m.index + m[0].length - 1;
    const cierre = buscarCierre(texto, abre, "(", ")");
    if (cierre < 0) continue;
    const nombre = leerLiteral(texto.slice(abre + 1, cierre).trim(), 0)?.valor;
    if (nombre) exportaciones.set(m[1], nombre);
  }

  const definiciones = [];
  const re = /\bpgTable\s*\(/g;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    const abre = m.index + m[0].length - 1;
    const cierre = buscarCierre(texto, abre, "(", ")");
    if (cierre < 0) continue;
    const partes = dividirTopLevel(texto.slice(abre + 1, cierre), ",");
    const nombreTabla = leerLiteral(partes[0]?.trim() ?? "", 0)?.valor;
    const cuerpo = (partes[1] ?? "").trim();
    if (!nombreTabla || !cuerpo.startsWith("{")) continue;
    const cierreObj = buscarCierre(cuerpo, 0, "{", "}");
    if (cierreObj < 0) continue;
    definiciones.push({ nombreTabla, cuerpo: cuerpo.slice(1, cierreObj), tercero: (partes[2] ?? "").trim() });
  }

  const columnasPorPropiedad = new Map();
  for (const def of definiciones) {
    const mapa = new Map();
    for (const propiedad of dividirTopLevel(def.cuerpo, ",")) {
      const corte = indiceTopLevel(propiedad, ":");
      if (corte < 0) continue;
      const clave = propiedad.slice(0, corte).trim().replace(/^["']|["']$/g, "");
      const cadena = parsearCadenaLlamadas(propiedad.slice(corte + 1));
      if (!cadena) continue;
      const col = leerLiteral(cadena.args[0]?.trim() ?? "", 0)?.valor;
      if (col) mapa.set(clave, col);
    }
    columnasPorPropiedad.set(def.nombreTabla, mapa);
  }

  const tablas = {};
  const fks = [];
  for (const def of definiciones) {
    const mapaPropiedad = columnasPorPropiedad.get(def.nombreTabla) ?? new Map();
    const tabla = { columnas: {}, indices: {}, pk: [] };
    for (const propiedad of dividirTopLevel(def.cuerpo, ",")) {
      const corte = indiceTopLevel(propiedad, ":");
      if (corte < 0) continue;
      const cadena = parsearCadenaLlamadas(propiedad.slice(corte + 1));
      if (!cadena) continue;
      const constructor = cadena.constructor.toLowerCase();
      const base = CONSTRUCTORES_TIPO[constructor];
      if (!base) continue;
      const nombreCol = leerLiteral(cadena.args[0]?.trim() ?? "", 0)?.valor;
      if (!nombreCol) continue;

      const opciones = {};
      for (const arg of cadena.args.slice(1)) {
        const t = arg.trim();
        const mLargo = /\blength\s*:\s*(\d+)/.exec(t);
        if (mLargo) opciones.largo = Number(mLargo[1]);
        if (/\bwithTimezone\s*:\s*true\b/.test(t)) opciones.withTimezone = true;
      }

      let tipo = base;
      if (constructor === "timestamp" && opciones.withTimezone) tipo = "timestamp with time zone";
      if (constructor === "time" && opciones.withTimezone) tipo = "time with time zone";
      tipo = canonizarTipo(tipo, { largo: opciones.largo ?? null });

      let notNull = false;
      let pk = false;
      let unique = false;
      let valorDef = null;
      let fk = null;
      for (const metodo of cadena.metodos) {
        if (metodo.nombre === "notNull") notNull = true;
        else if (metodo.nombre === "primaryKey") {
          pk = true;
          notNull = true;
        } else if (metodo.nombre === "unique") unique = true;
        else if (metodo.nombre === "array") tipo = `${tipo}[]`;
        else if (metodo.nombre === "default") valorDef = valorDefaultSql(metodo.args[0] ?? "");
        else if (metodo.nombre === "defaultRandom") valorDef = "gen_random_uuid()";
        else if (metodo.nombre === "defaultNow") valorDef = "now()";
        else if (metodo.nombre === "references") {
          fk = resolverColumnaRef(metodo.args[0] ?? "", exportaciones, columnasPorPropiedad);
        }
      }

      tabla.columnas[nombreCol] = { tipo, notNull, default: valorDef == null ? null : canonizarDefault(valorDef), pk, unique };
      if (pk) tabla.pk.push(nombreCol);
      if (fk) fks.push({ tabla: def.nombreTabla, columnas: [nombreCol], ...fk });
    }

    let tercero = def.tercero;
    const mAarrow = /^\([^)]*\)\s*=>\s*([\s\S]*)$/.exec(tercero);
    if (mAarrow) tercero = mAarrow[1].trim();
    if (tercero.startsWith("[")) {
      const finArr = buscarCierre(tercero, 0, "[", "]");
      if (finArr > 0) tercero = tercero.slice(1, finArr);
    } else {
      tercero = "";
    }
    for (const elemento of dividirTopLevel(tercero, ",")) {
      const parsed = parsearElementoIndice(elemento, mapaPropiedad);
      if (!parsed) continue;
      if (parsed.primaryKey) {
        if (parsed.primaryKey.length) {
          tabla.pk = parsed.primaryKey;
          for (const col of parsed.primaryKey) if (tabla.columnas[col]) tabla.columnas[col].notNull = true;
        }
        continue;
      }
      tabla.indices[parsed.nombre] = parsed;
    }
    tabla.pk.sort();
    tablas[def.nombreTabla] = tabla;
  }

  return { tablas, fks };
}

/** @param {EstadoEsquema} destino @param {EstadoEsquema} origen @returns {EstadoEsquema} */
export function fusionarEstados(destino, origen) {
  for (const [nombre, tabla] of Object.entries(origen.tablas ?? {})) {
    if (!destino.tablas[nombre]) destino.tablas[nombre] = { columnas: {}, indices: {}, pk: [] };
    const actual = destino.tablas[nombre];
    Object.assign(actual.columnas, tabla.columnas);
    Object.assign(actual.indices, tabla.indices);
    if (tabla.pk?.length) actual.pk = [...tabla.pk].sort();
  }
  destino.fks = destino.fks ?? [];
  const claves = new Set(destino.fks.map((fk) => `${fk.tabla}:${fk.columnas.join(",")}->${fk.refTabla}.${fk.refColumnas.join(",")}`));
  for (const fk of origen.fks ?? []) {
    const clave = `${fk.tabla}:${fk.columnas.join(",")}->${fk.refTabla}.${fk.refColumnas.join(",")}`;
    if (!claves.has(clave)) {
      destino.fks.push(fk);
      claves.add(clave);
    }
  }
  return destino;
}

// ----------------------------- SQL de migraciones -----------------------------

export function dividirStatements(sql) {
  const salida = [];
  for (const trozo of String(sql).split(/-->\s*statement-breakpoint/)) {
    let actual = "";
    let estado = "normal";
    let etiquetaDollar = "";
    for (let i = 0; i < trozo.length; i += 1) {
      const c = trozo[i];
      const par = trozo.slice(i, i + 2);
      if (estado === "normal") {
        if (c === "'") {
          estado = "comilla";
          actual += c;
        } else if (c === '"') {
          estado = "comillaDoble";
          actual += c;
        } else if (par === "--") {
          estado = "linea";
          i += 1;
        } else if (par === "/*") {
          estado = "bloque";
          i += 1;
        } else if (c === "$") {
          const m = trozo.slice(i).match(/^\$[A-Za-z_]*\$/);
          if (m) {
            etiquetaDollar = m[0];
            estado = "dollar";
            actual += m[0];
            i += m[0].length - 1;
          } else actual += c;
        } else if (c === ";") {
          if (actual.trim()) salida.push(actual.trim());
          actual = "";
        } else actual += c;
      } else if (estado === "comilla") {
        actual += c;
        if (c === "'") {
          if (trozo[i + 1] === "'") {
            actual += "'";
            i += 1;
          } else estado = "normal";
        }
      } else if (estado === "comillaDoble") {
        actual += c;
        if (c === '"') {
          if (trozo[i + 1] === '"') {
            actual += '"';
            i += 1;
          } else estado = "normal";
        }
      } else if (estado === "linea") {
        if (c === "\n") {
          estado = "normal";
          actual += " ";
        }
      } else if (estado === "bloque") {
        if (par === "*/") {
          estado = "normal";
          i += 1;
        }
      } else if (estado === "dollar") {
        if (trozo.startsWith(etiquetaDollar, i)) {
          actual += etiquetaDollar;
          i += etiquetaDollar.length - 1;
          estado = "normal";
        } else actual += c;
      }
    }
    if (actual.trim()) salida.push(actual.trim());
  }
  return salida;
}

function tokenizarSql(texto) {
  const tokens = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    const inicio = i;
    if (c === '"') {
      i += 1;
      let valor = "";
      while (i < texto.length) {
        if (texto[i] === '"') {
          if (texto[i + 1] === '"') {
            valor += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        valor += texto[i];
        i += 1;
      }
      tokens.push({ t: "palabra", v: valor, inicio, fin: i });
      continue;
    }
    if (c === "'") {
      i += 1;
      while (i < texto.length) {
        if (texto[i] === "'") {
          if (texto[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      tokens.push({ t: "cadena", v: texto.slice(inicio, i), inicio, fin: i });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      while (i < texto.length && /[A-Za-z0-9_$]/.test(texto[i])) i += 1;
      tokens.push({ t: "palabra", v: texto.slice(inicio, i), inicio, fin: i });
      continue;
    }
    if (/[0-9]/.test(c)) {
      while (i < texto.length && /[0-9.]/.test(texto[i])) i += 1;
      tokens.push({ t: "numero", v: texto.slice(inicio, i), inicio, fin: i });
      continue;
    }
    if ("(),[];".includes(c)) {
      i += 1;
      tokens.push({ t: "simbolo", v: c, inicio, fin: i });
      continue;
    }
    i += 1;
    tokens.push({ t: "simbolo", v: c, inicio, fin: i });
  }
  return tokens;
}

function contenidoParentesis(texto, indiceApertura) {
  let profundidad = 0;
  for (let i = indiceApertura; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === "'" || c === '"') {
      const comilla = c;
      i += 1;
      while (i < texto.length) {
        if (texto[i] === comilla) {
          if (texto[i + 1] === comilla) {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === "(") profundidad += 1;
    else if (c === ")") {
      profundidad -= 1;
      if (profundidad === 0) return { contenido: texto.slice(indiceApertura + 1, i), fin: i + 1 };
    }
  }
  return null;
}

function dividirPorComa(texto) {
  const partes = [];
  let actual = "";
  let profundidad = 0;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === "'" || c === '"') {
      const comilla = c;
      actual += c;
      i += 1;
      while (i < texto.length) {
        actual += texto[i];
        if (texto[i] === comilla) {
          if (texto[i + 1] === comilla) {
            actual += texto[i + 1];
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === "(") profundidad += 1;
    if (c === ")") profundidad -= 1;
    if (c === "," && profundidad === 0) {
      partes.push(actual.trim());
      actual = "";
      continue;
    }
    actual += c;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

function leerTipoSql(tokens, desde) {
  const token = tokens[desde];
  if (!token || token.t !== "palabra") return null;
  let base = token.v.toLowerCase();
  let j = desde + 1;
  let params = null;
  const leerParams = () => {
    if (!(tokens[j] && tokens[j].t === "simbolo" && tokens[j].v === "(")) return;
    let profundidad = 0;
    let k = j;
    let texto = "";
    for (; k < tokens.length; k += 1) {
      if (tokens[k].v === "(") profundidad += 1;
      else if (tokens[k].v === ")") profundidad -= 1;
      if (profundidad > 0 && tokens[k].v !== "(") texto += tokens[k].v;
      if (profundidad === 0) break;
    }
    params = texto.trim();
    j = k + 1;
  };
  leerParams();
  const continuaciones = CONTINUACIONES_TIPO[base];
  if (continuaciones) {
    for (const sufijo of continuaciones) {
      const partes = sufijo.split(" ");
      let k = j;
      let ok = true;
      for (const parte of partes) {
        if (!tokens[k] || tokens[k].t !== "palabra" || tokens[k].v.toLowerCase() !== parte) {
          ok = false;
          break;
        }
        k += 1;
      }
      if (ok) {
        base = `${base} ${sufijo}`;
        j = k;
        break;
      }
    }
  }
  leerParams();
  while (tokens[j] && tokens[j].t === "simbolo" && tokens[j].v === "[") {
    if (tokens[j + 1] && tokens[j + 1].v === "]") {
      base += "[]";
      j += 2;
    } else break;
  }
  return { base, params, siguiente: j };
}

function columnasDeLista(texto) {
  return dividirPorComa(texto)
    .map((c) => c.replace(/"([A-Za-z_][\w$]*)"/g, "$1").replace(/^"(.*)"$/s, "$1").trim())
    .filter(Boolean);
}

function largoSiNumerico(params) {
  return params && /^\d+$/.test(params) ? Number(params) : null;
}

function parsearColumnaSql(definicion) {
  const tokens = tokenizarSql(definicion);
  if (tokens.length < 2) return null;
  const nombre = tokens[0].v;
  const tipo = leerTipoSql(tokens, 1);
  if (!tipo) return null;
  const finTipo = tokens[tipo.siguiente - 1].fin;
  const resto = definicion.slice(finTipo);
  const notNull = /\bNOT\s+NULL\b/i.test(resto) || /\bPRIMARY\s+KEY\b/i.test(resto);
  const pk = /\bPRIMARY\s+KEY\b/i.test(resto);
  const unique = /\bUNIQUE\b/i.test(resto);
  const mDefault = resto.match(
    /\bDEFAULT\s+([\s\S]*?)(?=\s+(?:NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|REFERENCES|CHECK|GENERATED|COLLATE)\b|$)/i,
  );
  const mFk = resto.match(/\bREFERENCES\s+(?:"?([\w$]+)"?\s*\.\s*)?"?([\w$]+)"?\s*\(\s*"([\w$]+)"\s*\)/i);
  const mUniqueNombre = resto.match(/\bCONSTRAINT\s+"?([\w$]+)"?\s+UNIQUE\b/i);
  return {
    nombre,
    tipo: canonizarTipo(tipo.base, { largo: largoSiNumerico(tipo.params) }),
    notNull,
    pk,
    unique,
    uniqueNombre: mUniqueNombre ? mUniqueNombre[1] : null,
    default: mDefault ? canonizarDefault(mDefault[1]) : null,
    fk: mFk ? { refTabla: mFk[2], refColumnas: [mFk[3]] } : null,
  };
}

/** @param {Array<{ nombre: string, sql: string }>} archivos @returns {EstadoEsquema} */
export function parsearMigracionesSql(archivos) {
  const estado = { tablas: {}, fks: [] };
  const constraints = new Map();
  const definidas = new Set();
  const asegurar = (tabla) => {
    if (!estado.tablas[tabla]) estado.tablas[tabla] = { columnas: {}, indices: {}, pk: [] };
    return estado.tablas[tabla];
  };

  for (const archivo of archivos) {
    for (const statement of dividirStatements(archivo.sql)) {
      const sql = statement.replace(/\s+/g, " ").trim();
      let m = sql.match(/^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?("?[\w$]+"?(?:\s*\.\s*"?[\w$]+"?)?)\s*\(/i);
      if (m) {
        const nombre = m[2].split(".").pop().replace(/"/g, "");
        if (m[1] && definidas.has(nombre)) continue;
        if (!m[1]) estado.tablas[nombre] = { columnas: {}, indices: {}, pk: [] };
        definidas.add(nombre);
        const cuerpo = contenidoParentesis(sql, sql.indexOf("(", m[0].length - 1));
        if (!cuerpo) continue;
        const tabla = asegurar(nombre);
        for (const item of dividirPorComa(cuerpo.contenido)) {
          if (/^(?:CONSTRAINT\s+"?[\w$]+"?\s+)?(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|LIKE)\b/i.test(item)) {
            const nombreConstraint = item.match(/^CONSTRAINT\s+"?([\w$]+)"?/i)?.[1] ?? null;
            const mPk = item.match(/PRIMARY\s+KEY\s*\(([^)]*)\)/i);
            if (mPk) {
              const columnas = columnasDeLista(mPk[1]);
              tabla.pk = columnas.slice().sort();
              for (const col of columnas) if (tabla.columnas[col]) tabla.columnas[col].notNull = true;
            }
            const mUnique = item.match(/\bUNIQUE\s*\(([^)]*)\)/i);
            if (mUnique && nombreConstraint) {
              tabla.indices[nombreConstraint] = { columnas: columnasDeLista(mUnique[1]), unique: true, parcial: false };
            }
            const mFk = item.match(/FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+(?:"?([\w$]+)"?\s*\.\s*)?"?([\w$]+)"?\s*\(([^)]*)\)/i);
            if (mFk) {
              const columnasFk = columnasDeLista(mFk[1]);
              const refs = columnasDeLista(mFk[4]);
              estado.fks.push({ tabla: nombre, columnas: columnasFk, refTabla: mFk[3], refColumnas: refs });
              if (nombreConstraint) constraints.set(nombreConstraint, { tabla: nombre, tipo: "FOREIGN KEY", columnas: columnasFk });
            }
            continue;
          }
          const col = parsearColumnaSql(item);
          if (!col) continue;
          tabla.columnas[col.nombre] = { tipo: col.tipo, notNull: col.notNull, default: col.default, pk: col.pk, unique: col.unique };
          if (col.pk) tabla.pk.push(col.nombre);
          if (col.uniqueNombre) {
            tabla.indices[col.uniqueNombre] = { columnas: [col.nombre], unique: true, parcial: false };
          }
          if (col.fk) estado.fks.push({ tabla: nombre, columnas: [col.nombre], ...col.fk });
        }
        tabla.pk.sort();
        continue;
      }

      m = sql.match(/^ALTER\s+TABLE\s+(?:ONLY\s+)?("?[\w$]+"?(?:\s*\.\s*"?[\w$]+"?)?)\s+([\s\S]+)$/i);
      if (m) {
        const nombre = m[1].split(".").pop().replace(/"/g, "");
        const tabla = asegurar(nombre);
        const resto = m[2].trim();
        let a;
        a = resto.match(/^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i);
        if (a) {
          const col = parsearColumnaSql(a[1]);
          if (col) {
            tabla.columnas[col.nombre] = { tipo: col.tipo, notNull: col.notNull, default: col.default, pk: col.pk, unique: col.unique };
            if (col.pk && !tabla.pk.includes(col.nombre)) tabla.pk.push(col.nombre);
            if (col.uniqueNombre) {
              tabla.indices[col.uniqueNombre] = { columnas: [col.nombre], unique: true, parcial: false };
            }
            if (col.fk) estado.fks.push({ tabla: nombre, columnas: [col.nombre], ...col.fk });
          }
          continue;
        }
        a = resto.match(/^ADD\s+CONSTRAINT\s+"?([\w$]+)"?\s+(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY)\s*\(([^)]*)\)([\s\S]*)$/i);
        if (a) {
          const tipoConstraint = a[2].toUpperCase().replace(/\s+/g, " ");
          const columnas = columnasDeLista(a[3]);
          constraints.set(a[1], { tabla: nombre, tipo: tipoConstraint, columnas });
          if (tipoConstraint === "PRIMARY KEY") {
            tabla.pk = columnas.slice().sort();
            for (const col of columnas) if (tabla.columnas[col]) tabla.columnas[col].notNull = true;
          }
          if (tipoConstraint === "UNIQUE") {
            tabla.indices[a[1]] = { columnas, unique: true, parcial: false };
          }
          if (tipoConstraint === "FOREIGN KEY") {
            const mf = (a[4] ?? "").match(/REFERENCES\s+(?:"?([\w$]+)"?\s*\.\s*)?"?([\w$]+)"?\s*\(([^)]*)\)/i);
            if (mf) {
              estado.fks.push({ tabla: nombre, columnas, refTabla: mf[2], refColumnas: columnasDeLista(mf[3]) });
            }
          }
          continue;
        }
        a = resto.match(/^ADD\s+PRIMARY\s+KEY\s*\(([^)]*)\)/i);
        if (a) {
          tabla.pk = columnasDeLista(a[1]).sort();
          continue;
        }
        a = resto.match(/^ALTER\s+COLUMN\s+"?([\w$]+)"?\s+(?:SET\s+DATA\s+TYPE|TYPE)\s+([\s\S]+)$/i);
        if (a) {
          const hastaUsing = a[2].replace(/\s+USING\s+[\s\S]*$/i, "").trim();
          const tipo = leerTipoSql(tokenizarSql(hastaUsing), 0);
          if (tipo && tabla.columnas[a[1]]) {
            tabla.columnas[a[1]].tipo = canonizarTipo(tipo.base, { largo: largoSiNumerico(tipo.params) });
          }
          continue;
        }
        a = resto.match(/^ALTER\s+COLUMN\s+"?([\w$]+)"?\s+SET\s+NOT\s+NULL/i);
        if (a) {
          if (tabla.columnas[a[1]]) tabla.columnas[a[1]].notNull = true;
          continue;
        }
        a = resto.match(/^ALTER\s+COLUMN\s+"?([\w$]+)"?\s+DROP\s+NOT\s+NULL/i);
        if (a) {
          if (tabla.columnas[a[1]]) tabla.columnas[a[1]].notNull = false;
          continue;
        }
        a = resto.match(/^ALTER\s+COLUMN\s+"?([\w$]+)"?\s+SET\s+DEFAULT\s+([\s\S]+)$/i);
        if (a) {
          if (tabla.columnas[a[1]]) tabla.columnas[a[1]].default = canonizarDefault(a[2]);
          continue;
        }
        a = resto.match(/^ALTER\s+COLUMN\s+"?([\w$]+)"?\s+DROP\s+DEFAULT/i);
        if (a) {
          if (tabla.columnas[a[1]]) tabla.columnas[a[1]].default = null;
          continue;
        }
        a = resto.match(/^RENAME\s+COLUMN\s+"?([\w$]+)"?\s+TO\s+"?([\w$]+)"?/i);
        if (a) {
          const col = tabla.columnas[a[1]];
          if (col) {
            delete tabla.columnas[a[1]];
            tabla.columnas[a[2]] = col;
          }
          tabla.pk = tabla.pk.map((c) => (c === a[1] ? a[2] : c));
          for (const indice of Object.values(tabla.indices)) {
            indice.columnas = indice.columnas.map((c) => (c === a[1] ? a[2] : c));
          }
          continue;
        }
        a = resto.match(/^DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([\w$]+)"?/i);
        if (a) {
          delete tabla.columnas[a[1]];
          tabla.pk = tabla.pk.filter((c) => c !== a[1]);
          continue;
        }
        a = resto.match(/^DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([\w$]+)"?/i);
        if (a) {
          const guardado = constraints.get(a[1]);
          if (guardado?.tipo === "PRIMARY KEY") tabla.pk = [];
          if (guardado?.tipo === "FOREIGN KEY") {
            const propias = [...guardado.columnas].sort().join(",");
            estado.fks = estado.fks.filter((fk) => !(fk.tabla === nombre && [...fk.columnas].sort().join(",") === propias));
          }
          delete tabla.indices[a[1]];
          constraints.delete(a[1]);
          continue;
        }
        continue;
      }

      m = sql.match(
        /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w$]+"?)\s+ON\s+(?:ONLY\s+)?("?[\w$]+"?(?:\s*\.\s*"?[\w$]+"?)?)(?:\s+USING\s+[\w$]+)?\s*\(/i,
      );
      if (m) {
        const nombre = m[2].replace(/"/g, "");
        const tablaNombre = m[3].split(".").pop().replace(/"/g, "");
        const cuerpo = contenidoParentesis(sql, sql.indexOf("(", m[0].length - 1));
        if (!cuerpo) continue;
        const columnas = columnasDeLista(cuerpo.contenido).map((c) => c.replace(/\s+/g, " ").toLowerCase());
        const parcial = /\bWHERE\b/i.test(sql.slice(cuerpo.fin));
        asegurar(tablaNombre).indices[nombre] = { columnas, unique: Boolean(m[1]), parcial };
        continue;
      }

      // 0012 crea su índice único dentro de un bloque DO: se registran los CREATE INDEX embebidos.
      const reEmbebido = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+/gi;
      for (let mi = reEmbebido.exec(sql); mi; mi = reEmbebido.exec(sql)) {
        const trozo = sql.slice(mi.index);
        const mIdx = trozo.match(
          /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w$]+"?)\s+ON\s+(?:ONLY\s+)?("?[\w$]+"?(?:\s*\.\s*"?[\w$]+"?)?)(?:\s+USING\s+[\w$]+)?\s*\(/i,
        );
        if (!mIdx) continue;
        const cuerpoEmbebido = contenidoParentesis(trozo, mIdx[0].length - 1);
        if (!cuerpoEmbebido) continue;
        const columnas = columnasDeLista(cuerpoEmbebido.contenido).map((c) => c.replace(/\s+/g, " ").toLowerCase());
        const parcial = /\bWHERE\b/i.test(trozo.slice(cuerpoEmbebido.fin, cuerpoEmbebido.fin + 300));
        asegurar(mIdx[3].split(".").pop().replace(/"/g, "")).indices[mIdx[2].replace(/"/g, "")] = {
          columnas,
          unique: Boolean(mIdx[1]),
          parcial,
        };
      }

      m = sql.match(/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?("?[\w$]+"?(?:\s*\.\s*"?[\w$]+"?)?)/i);
      if (m) {
        delete estado.tablas[m[1].split(".").pop().replace(/"/g, "")];
        continue;
      }
      m = sql.match(/^DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?("?[\w$]+"?)/i);
      if (m) {
        const nombre = m[1].replace(/"/g, "");
        for (const tabla of Object.values(estado.tablas)) delete tabla.indices[nombre];
        continue;
      }
    }
  }
  for (const tabla of Object.values(estado.tablas)) tabla.pk.sort();
  return estado;
}

// ----------------------------- Estado de la base -----------------------------

/** @param {string} indexdef @returns {string[]} */
export function columnasDesdeIndexDef(indexdef) {
  const m = String(indexdef).match(/USING\s+[\w$]+\s*\(/i);
  if (!m) return [];
  const cuerpo = contenidoParentesis(indexdef, m.index + m[0].length - 1);
  if (!cuerpo) return [];
  return columnasDeLista(cuerpo.contenido).map((c) => c.replace(/\s+/g, " ").toLowerCase());
}

/**
 * @param {{ tablas: string[], columnas: Array<Record<string, any>>, indices: Array<Record<string, any>>, pks?: Array<Record<string, any>>, fks?: FkEsperada[], constraintsPk?: string[] }} datos
 * @returns {EstadoEsquema}
 */
export function estadoDesdeBase({ tablas, columnas, indices, pks, fks, constraintsPk = [] }) {
  const estado = { tablas: {}, fks: [] };
  const indicesPk = new Set(constraintsPk);
  for (const tabla of tablas) estado.tablas[tabla] = { columnas: {}, indices: {}, pk: [] };
  for (const col of columnas) {
    if (!estado.tablas[col.tabla]) estado.tablas[col.tabla] = { columnas: {}, indices: {}, pk: [] };
    const tipoBase = col.data_type === "ARRAY" && col.udt_name ? `${String(col.udt_name).replace(/^_/, "")}[]` : col.data_type;
    estado.tablas[col.tabla].columnas[col.columna] = {
      tipo: canonizarTipo(tipoBase, { largo: col.largo ?? null }),
      notNull: col.is_nullable === "NO",
      default: canonizarDefault(col.default),
      pk: false,
    };
  }
  for (const pk of pks ?? []) {
    const tabla = estado.tablas[pk.tabla];
    if (!tabla) continue;
    tabla.pk.push(pk.columna);
    if (tabla.columnas[pk.columna]) tabla.columnas[pk.columna].pk = true;
  }
  for (const tabla of Object.values(estado.tablas)) tabla.pk.sort();
  for (const idx of indices ?? []) {
    if (indicesPk.has(idx.nombre)) continue;
    const tabla = estado.tablas[idx.tabla];
    if (!tabla) continue;
    tabla.indices[idx.nombre] = {
      columnas: columnasDesdeIndexDef(idx.indexdef),
      unique: /^CREATE\s+UNIQUE\s+INDEX/i.test(idx.indexdef),
      parcial: /\bWHERE\b/i.test(idx.indexdef),
    };
  }
  estado.fks.push(...(fks ?? []));
  return estado;
}

// ----------------------------- Diff -----------------------------

const ORDEN_CATEGORIAS = [
  "tabla-faltante",
  "tabla-sobrante",
  "columna-faltante",
  "columna-sobrante",
  "tipo",
  "nulabilidad",
  "default",
  "default-sobrante",
  "unique",
  "indice-faltante",
  "indice-sobrante",
  "indice-columnas",
  "pk",
  "fk",
  "fk-sobrante",
];

const normalizarColumnas = (columnas) => [...columnas].map((c) => c.toLowerCase().replace(/\s+/g, " ").trim()).sort();

function compararIndices(base, esperado, { reportarSobrantes }) {
  const hallazgos = [];
  for (const [nombre, indice] of Object.entries(esperado.indices ?? {})) {
    const real = base.indices?.[nombre];
    if (!real) {
      hallazgos.push({ categoria: "indice-faltante", indice: nombre, detalle: `esperado [${indice.columnas.join(", ")}]` });
      continue;
    }
    const a = normalizarColumnas(real.columnas).join(",");
    const b = normalizarColumnas(indice.columnas).join(",");
    if (a !== b) {
      hallazgos.push({ categoria: "indice-columnas", indice: nombre, detalle: `base=[${real.columnas.join(", ")}] esperado=[${indice.columnas.join(", ")}]` });
    } else if (Boolean(real.unique) !== Boolean(indice.unique)) {
      hallazgos.push({ categoria: "indice-columnas", indice: nombre, detalle: `unique base=${real.unique} esperado=${indice.unique}` });
    }
  }
  if (reportarSobrantes) {
    for (const nombre of Object.keys(base.indices ?? {})) {
      if (!esperado.indices?.[nombre]) hallazgos.push({ categoria: "indice-sobrante", indice: nombre, detalle: "" });
    }
  }
  return hallazgos;
}

/**
 * @param {EstadoEsquema} base
 * @param {EstadoEsquema} esperado
 * @param {{ fuente?: string, reportarSobrantesIndices?: boolean, estricto?: boolean }} [opciones]
 * @returns {{ fuente: string|undefined, hallazgos: Hallazgo[] }}
 */
export function diffEstados(base, esperado, { fuente, reportarSobrantesIndices = false, estricto = false } = {}) {
  const hallazgos = [];
  const nombres = new Set([...Object.keys(base.tablas ?? {}), ...Object.keys(esperado.tablas ?? {})]);
  for (const tabla of [...nombres].sort()) {
    const real = base.tablas?.[tabla];
    const decl = esperado.tablas?.[tabla];
    if (decl && !real) {
      hallazgos.push({ tabla, categoria: "tabla-faltante", detalle: "" });
      continue;
    }
    if (!decl && real) {
      hallazgos.push({ tabla, categoria: "tabla-sobrante", detalle: "" });
      continue;
    }
    const columnas = new Set([...Object.keys(real.columnas ?? {}), ...Object.keys(decl.columnas ?? {})]);
    for (const col of [...columnas].sort()) {
      const r = real.columnas?.[col];
      const e = decl.columnas?.[col];
      if (e && !r) {
        hallazgos.push({ tabla, columna: col, categoria: "columna-faltante", detalle: `esperado ${e.tipo}` });
        continue;
      }
      if (!e && r) {
        hallazgos.push({ tabla, columna: col, categoria: "columna-sobrante", detalle: `base ${r.tipo}` });
        continue;
      }
      if (r.tipo !== e.tipo) {
        hallazgos.push({ tabla, columna: col, categoria: "tipo", detalle: `base=${r.tipo} esperado=${e.tipo}` });
      }
      if (!e.pk && !r.pk && Boolean(r.notNull) !== Boolean(e.notNull)) {
        hallazgos.push({
          tabla,
          columna: col,
          categoria: "nulabilidad",
          detalle: `base=${r.notNull ? "NOT NULL" : "NULL"} esperado=${e.notNull ? "NOT NULL" : "NULL"}`,
        });
      }
      if (e.default != null && r.default !== e.default && !String(e.tipo).endsWith("[]")) {
        hallazgos.push({ tabla, columna: col, categoria: "default", detalle: `base=${r.default ?? "sin default"} esperado=${e.default}` });
      }
      if (estricto && e.default == null && r.default != null) {
        hallazgos.push({ tabla, columna: col, categoria: "default-sobrante", detalle: `base=${r.default}` });
      }
      if (e.unique && !e.pk) {
        const cubierta = Object.values(real.indices ?? {}).some((indice) => {
          const cols = normalizarColumnas(indice.columnas);
          return indice.unique && cols.length === 1 && cols[0] === col.toLowerCase();
        });
        if (!cubierta) hallazgos.push({ tabla, columna: col, categoria: "unique", detalle: "base no tiene unique de una sola columna" });
      }
    }
    hallazgos.push(...compararIndices(real, decl, { reportarSobrantes: reportarSobrantesIndices }).map((h) => ({ tabla, ...h })));

    const pkDecl = [...(decl.pk ?? [])].sort().join(",");
    const pkReal = [...(real.pk ?? [])].sort().join(",");
    if (pkDecl && pkDecl !== pkReal) {
      hallazgos.push({ tabla, categoria: "pk", detalle: `base=[${(real.pk ?? []).join(", ")}] esperado=[${(decl.pk ?? []).join(", ")}]` });
    }

    const clave = (fk) => `${[...fk.columnas].sort().join(",")}->${fk.refTabla}.${[...fk.refColumnas].sort().join(",")}`;
    const fksDeclaradas = new Set((esperado.fks ?? []).filter((fk) => fk.tabla === tabla).map(clave));
    if (fksDeclaradas.size) {
      const reales = new Set((base.fks ?? []).filter((fk) => fk.tabla === tabla).map(clave));
      for (const fk of fksDeclaradas) if (!reales.has(fk)) hallazgos.push({ tabla, categoria: "fk", detalle: `esperada ${fk}` });
      if (estricto) for (const fk of reales) if (!fksDeclaradas.has(fk)) hallazgos.push({ tabla, categoria: "fk-sobrante", detalle: `base ${fk}` });
    }
  }
  const orden = (c) => {
    const i = ORDEN_CATEGORIAS.indexOf(c);
    return i < 0 ? 99 : i;
  };
  hallazgos.sort(
    (a, b) =>
      a.tabla.localeCompare(b.tabla) ||
      orden(a.categoria) - orden(b.categoria) ||
      String(a.columna ?? a.indice ?? "").localeCompare(String(b.columna ?? b.indice ?? "")),
  );
  return { fuente, hallazgos };
}
/** @param {{ tabla: string, categoria: string, columna?: string, indice?: string, detalle?: string }} h @returns {string} */
export function formatearHallazgo(h) {
  const sujeto = h.columna ?? h.indice ?? "";
  return `${h.tabla}${sujeto ? ` · ${sujeto}` : ""}: ${h.categoria}${h.detalle ? ` — ${h.detalle}` : ""}`;
}

/** @typedef {{ tabla: string, categoria: string, columna?: string, indice?: string, detalle?: string }} Hallazgo */

/** @param {Array<{ fuente?: string|undefined, hallazgos: Hallazgo[] }>} diferencias @returns {{ total: number, tablas: number, porCategoria: Record<string, number> }} */
export function resumirDiferencias(diferencias) {
  const porCategoria = {};
  const tablas = new Set();
  let total = 0;
  for (const diferencia of diferencias) {
    for (const h of diferencia.hallazgos) {
      porCategoria[h.categoria] = (porCategoria[h.categoria] ?? 0) + 1;
      tablas.add(h.tabla);
      total += 1;
    }
  }
  return { total, tablas: tablas.size, porCategoria };
}

/** @param {{ total: number }} resumen @returns {number} */
export function codigoSalida(resumen) {
  return resumen.total === 0 ? 0 : 1;
}
