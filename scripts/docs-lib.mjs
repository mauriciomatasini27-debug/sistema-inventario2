import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {Object} DatosFrontmatter
 * @property {string} id
 * @property {string} tipo
 * @property {string} estado
 * @property {string[]} modulos
 * @property {string[]} depende_de
 * @property {string[]} reemplaza
 * @property {string} reemplazado_por
 * @property {string} resumen
 */

/**
 * @typedef {Object} Parseado
 * @property {Record<string, string | string[]>} datos
 * @property {string} cuerpo
 * @property {boolean} tiene
 */

/** @type {string[]} */
const CLAVES = [
  "id",
  "tipo",
  "estado",
  "modulos",
  "depende_de",
  "reemplaza",
  "reemplazado_por",
  "resumen",
];
const LISTAS = new Set(["modulos", "depende_de", "reemplaza"]);

// quita comillas simples/dobles de un escalar
function sinComillas(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    try {
      return t[0] === '"' ? JSON.parse(t) : t.slice(1, -1);
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

function parseLista(s) {
  const t = s.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return null;
  const dentro = t.slice(1, -1).trim();
  if (dentro === "") return [];
  return dentro
    .split(",")
    .map((x) => sinComillas(x))
    .filter((x) => x !== "");
}

function parseBloque(lineas, desde) {
  const cuerpo = [];
  let i = desde;
  while (i < lineas.length && (/^[ \t]/.test(lineas[i]) || lineas[i].trim() === "")) {
    cuerpo.push(lineas[i].replace(/^[ \t]/, "").replace(/^[ \t]/, ""));
    i += 1;
  }
  while (cuerpo.length > 0 && cuerpo[cuerpo.length - 1].trim() === "") cuerpo.pop();
  return { valor: cuerpo.join("\n"), hasta: i };
}

/**
 * @param {unknown} texto
 * @returns {Parseado}
 */
export function parseFrontmatter(texto) {
  const src = String(texto ?? "");
  const lineas = src.split("\n");
  if ((lineas[0] ?? "").trim() !== "---") return { datos: {}, cuerpo: src, tiene: false };
  let cierre = -1;
  for (let i = 1; i < lineas.length; i += 1) {
    if (lineas[i].trim() === "---") {
      cierre = i;
      break;
    }
  }
  if (cierre < 0) return { datos: {}, cuerpo: src, tiene: false };
  const datos = {};
  let i = 1;
  while (i < cierre) {
    const linea = lineas[i];
    if (linea.trim() === "" || linea.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(linea);
    if (!m) {
      i += 1;
      continue;
    }
    const clave = m[1];
    const resto = (m[2] ?? "").trim();
    if (resto === "|") {
      const b = parseBloque(lineas, i + 1);
      datos[clave] = b.valor;
      i = b.hasta;
      continue;
    }
    const lista = parseLista(resto);
    datos[clave] = lista === null ? sinComillas(resto) : lista;
    i += 1;
  }
  return { datos, cuerpo: lineas.slice(cierre + 1).join("\n"), tiene: true };
}

// cita solo si el escalar crudo rompería el YAML
function escScalar(s) {
  const t = String(s ?? "");
  if (t === "") return '""';
  if (/^[A-Za-z0-9][A-Za-z0-9 _./+-]*$/.test(t) && !t.includes(":") && !t.includes("#")) return t;
  return JSON.stringify(t);
}

function escItem(s) {
  const t = String(s ?? "");
  if (t !== "" && /^[^,#:[\]{}]+$/.test(t) && t === t.trim()) return t;
  return JSON.stringify(t);
}

/**
 * @param {Partial<DatosFrontmatter>} datos
 * @returns {string}
 */
export function serializeFrontmatter(datos) {
  const d = datos ?? {};
  const out = ["---"];
  for (const clave of CLAVES) {
    const v = d[clave];
    if (LISTAS.has(clave)) {
      const arr = Array.isArray(v) ? v : [];
      out.push(`${clave}: [${arr.map(escItem).join(", ")}]`);
      continue;
    }
    if (clave === "resumen" && String(v ?? "").includes("\n")) {
      out.push("resumen: |");
      for (const l of String(v).split("\n")) out.push(`  ${l}`);
      continue;
    }
    out.push(`${clave}: ${escScalar(v ?? "")}`);
  }
  out.push("---", "");
  return out.join("\n");
}

function vacio(v) {
  if (Array.isArray(v)) return v.length === 0;
  return String(v ?? "").trim() === "";
}

/**
 * @param {unknown} texto
 * @param {Partial<DatosFrontmatter>} datos
 * @returns {string}
 */
export function aplicarFrontmatter(texto, datos) {
  const src = String(texto ?? "");
  const actual = parseFrontmatter(src);
  const cuerpo = actual.tiene ? actual.cuerpo : src;
  const base = actual.tiene ? actual.datos : {};
  const merged = {};
  for (const clave of CLAVES) {
    const vieja = base[clave];
    merged[clave] = !vacio(vieja) ? vieja : (datos?.[clave] ?? (LISTAS.has(clave) ? [] : ""));
  }
  return serializeFrontmatter(merged) + cuerpo;
}

function normAdr(n) {
  return `ADR-${String(n).padStart(4, "0")}`;
}

function normPrd(xxx, nn) {
  return `PRD-${xxx}-${String(nn).padStart(2, "0")}`;
}

// id desde la ruta del archivo
function idPorRuta(ruta) {
  const p = String(ruta ?? "").replace(/\\/g, "/");
  let m = /docs\/adr\/(\d{2,4})-[^/]*\.md$/i.exec(p);
  if (m) return { id: normAdr(m[1]), tipo: "adr" };
  m = /docs\/diseno\/(PRD-[A-Za-z]+-\d+)-[^/]*\.md$/i.exec(p);
  if (m) {
    const mm = /^PRD-([A-Za-z]+)-(\d+)$/i.exec(m[1]);
    return { id: normPrd(mm[1].toUpperCase(), mm[2]), tipo: "prd" };
  }
  m = /((?:PLAN|EVIDENCIA|SPEC)-[A-Za-z]+-\d+)[^/]*\.md$/i.exec(p);
  if (m) {
    const mm = /^(PLAN|EVIDENCIA|SPEC)-([A-Za-z]+)-(\d+)$/i.exec(m[1]);
    const tipo = mm[1].toLowerCase() === "plan" ? "plan" : "spec";
    return { id: `${mm[1].toUpperCase()}-${mm[2].toUpperCase()}-${String(mm[3]).padStart(2, "0")}`, tipo };
  }
  m = /docs\/(\d{2})-[^/]+\/([^/]+)\.md$/i.exec(p);
  if (m) return { id: `MOD-${m[1]}-${m[2].toUpperCase()}`, tipo: "spec" };
  return null;
}

function slugMayus(ruta) {
  const base = String(ruta ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.md$/i, "");
  return (
    base
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "DOC"
  );
}

// primera línea Estado: (acepta **Estado:**)
function lineaEstado(texto) {
  for (const linea of String(texto ?? "").split("\n")) {
    const sinNegrita = linea.replace(/\*/g, "");
    const m = /^\s*estado\s*:\s*(.*)$/i.exec(sinNegrita);
    if (m) return m[1].trim();
  }
  return "";
}

function mapearEstado(valor) {
  const v = valor.toLowerCase();
  if (/(reemplazad|superseded|sustitu)/.test(v)) return "reemplazado";
  if (/(deprecad|obsolet|archivad)/.test(v)) return "deprecado";
  if (/(hecho|implementad|cerrad|completad)/.test(v)) return "hecho";
  if (/(aceptad)/.test(v)) return "aceptado";
  return "propuesto";
}

const PALABRA_MODULO = new Map([
  ["cash", "caja"],
  ["caja", "caja"],
  ["sales", "ventas"],
  ["ticket", "ventas"],
  ["venta", "ventas"],
  ["ventas", "ventas"],
  ["inventory", "inventario"],
  ["inventario", "inventario"],
  ["stock", "inventario"],
  ["catalog", "inventario"],
  ["catalogo", "inventario"],
  ["pricing", "precios"],
  ["precio", "precios"],
  ["precios", "precios"],
  ["credit", "fiado"],
  ["fiado", "fiado"],
  ["fiados", "fiado"],
  ["credito", "fiado"],
  ["purchase", "compras"],
  ["proveedor", "compras"],
  ["compra", "compras"],
  ["compras", "compras"],
  ["supplier", "compras"],
  ["payment", "pagos"],
  ["pago", "pagos"],
  ["pagos", "pagos"],
  ["fiscal", "fiscal"],
  ["arca", "fiscal"],
  ["whatsapp", "bot"],
  ["bot", "bot"],
  ["waba", "bot"],
  ["email", "email"],
  ["mail", "email"],
  ["resend", "email"],
  ["auth", "auth"],
  ["login", "auth"],
  ["oidc", "auth"],
  ["onboarding", "onboarding"],
  ["admin", "admin"],
  ["panel", "admin"],
  ["landing", "landing"],
  ["offline", "offline"],
  ["outbox", "offline"],
  ["opfs", "offline"],
  ["sqlite", "offline"],
  ["pwa", "offline"],
  ["sync", "offline"],
  ["persistencia", "persistencia"],
  ["drizzle", "persistencia"],
  ["schema", "persistencia"],
  ["repos", "persistencia"],
  ["almacen", "persistencia"],
  ["db", "persistencia"],
  ["postgres", "persistencia"],
  ["design-system", "design-system"],
  ["component", "design-system"],
  ["token", "design-system"],
  ["tenant", "tenant"],
  ["tenants", "tenant"],
  ["multitenant", "tenant"],
  ["multitenancy", "tenant"],
]);

function inferirModulos(ruta, texto) {
  const hallado = new Set();
  const p = `${ruta} ${texto}`.toLowerCase();
  for (const rutaSrc of p.matchAll(/src\/[a-z0-9_./-]+/g)) {
    for (const parte of rutaSrc[0].split(/[/_.-]+/)) {
      const mod = PALABRA_MODULO.get(parte);
      if (mod) hallado.add(mod);
    }
  }
  // Palabras sueltas solo de ruta y título: el cuerpo menciona de todo.
  const titulo = (/^#\s+(.+)$/m.exec(texto)?.[1] ?? "").toLowerCase();
  for (const palabra of `${ruta} ${titulo}`.toLowerCase().split(/[^a-z0-9ñáéíóúü-]+/i)) {
    for (const parte of palabra.split(/[-_]+/)) {
      const mod = PALABRA_MODULO.get(parte);
      if (mod) hallado.add(mod);
    }
  }
  return [...hallado].sort();
}

function menciones(texto, propio) {
  const set = new Set();
  for (const m of texto.matchAll(/ADR-(\d{1,4})/gi)) set.add(normAdr(m[1]));
  for (const m of texto.matchAll(/PRD-([A-Za-z]+)-(\d{1,2})/gi)) {
    set.add(normPrd(m[1].toUpperCase(), m[2]));
  }
  set.delete(propio);
  return [...set].sort().slice(0, 10);
}

function reemplazos(texto) {
  const set = new Set();
  for (const linea of texto.split("\n")) {
    const m = /(?:reemplaza|supersede[sd]?)\s+(?:\w+\s+)?(ADR-\d{1,4}|PRD-[A-Za-z]+-\d{1,2})/i.exec(linea);
    if (!m) continue;
    const id = m[1].toUpperCase();
    const ma = /^ADR-(\d+)$/.exec(id);
    set.add(ma ? normAdr(ma[1]) : id);
  }
  return [...set].sort();
}

/**
 * @param {unknown} ruta
 * @param {unknown} texto
 * @returns {DatosFrontmatter}
 */
export function inferirFrontmatter(ruta, texto) {
  const src = String(texto ?? "");
  const cuerpo = parseFrontmatter(src).cuerpo;
  const porRuta = idPorRuta(ruta);
  const historico = String(ruta ?? "").replace(/\\/g, "/").includes("docs/historico/");
  let id = porRuta?.id ?? slugMayus(ruta);
  let tipo = historico ? "historico" : (porRuta?.tipo ?? "spec");
  const mTitulo = /^#\s*(ADR-\d{1,4}|PRD-[A-Za-z]+-\d{1,2}|PLAN-[A-Za-z0-9-]+|EVIDENCIA-[A-Za-z0-9-]+|SPEC-[A-Za-z0-9-]+)\b/im.exec(
    cuerpo,
  );
  if (mTitulo) {
    const tid = mTitulo[1].toUpperCase();
    const ma = /^ADR-(\d+)$/.exec(tid);
    id = ma ? normAdr(ma[1]) : tid;
    if (tid.startsWith("PRD-")) tipo = historico ? tipo : "prd";
    else if (tid.startsWith("ADR-")) tipo = historico ? tipo : "adr";
    else if (tid.startsWith("PLAN-")) tipo = historico ? tipo : "plan";
  }
  const est = lineaEstado(cuerpo);
  const estado = est ? mapearEstado(est) : historico ? "deprecado" : "propuesto";
  let reemplazadoPor = "";
  if (estado === "reemplazado") {
    const mp = /por\s+(ADR-\d{1,4}|PRD-[A-Za-z]+-\d{1,2})/i.exec(est);
    if (mp) {
      const rid = mp[1].toUpperCase();
      const ma = /^ADR-(\d+)$/.exec(rid);
      reemplazadoPor = ma ? normAdr(ma[1]) : rid;
    }
  }
  return {
    id,
    tipo,
    estado,
    modulos: inferirModulos(ruta, cuerpo),
    depende_de: menciones(cuerpo, id),
    reemplaza: reemplazos(cuerpo),
    reemplazado_por: reemplazadoPor,
    resumen: "",
  };
}

function esDocMd(nombre) {
  return nombre.endsWith(".md") && !nombre.split("/").pop().startsWith("_");
}

/**
 * @param {string} [raiz]
 * @returns {string[]}
 */
export function listarDocs(raiz = "docs") {
  const base = String(raiz ?? "docs");
  const out = [];
  const pila = [""];
  while (pila.length > 0) {
    const rel = pila.pop();
    const abs = rel === "" ? base : join(base, rel);
    let entradas;
    try {
      entradas = readdirSync(abs);
    } catch {
      continue;
    }
    for (const e of entradas) {
      const r = rel === "" ? e : `${rel}/${e}`;
      if (e === "node_modules" || e === "_origen-docx") continue;
      let st;
      try {
        st = statSync(join(base, r));
      } catch {
        continue;
      }
      if (st.isDirectory()) pila.push(r);
      else if (esDocMd(r)) out.push(r);
    }
  }
  return out.sort();
}
