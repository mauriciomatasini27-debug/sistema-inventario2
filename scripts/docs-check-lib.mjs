import { parseFrontmatter } from "./docs-lib.mjs";

export const TIPOS_VALIDOS = ["adr", "prd", "plan", "spec", "historico"];
export const ESTADOS_VALIDOS = ["propuesto", "aceptado", "en curso", "hecho", "reemplazado", "deprecado"];
const LISTAS = ["modulos", "depende_de", "reemplaza"];

function normRuta(ruta) {
  return String(ruta ?? "").replace(/\\/g, "/");
}

export function esEsquemaDoc(ruta) {
  return !normRuta(ruta).split("/").includes("roadmap");
}

function comoTexto(v) {
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
}

function lineaDe(texto, clave) {
  const lineas = String(texto ?? "").split("\n");
  if ((lineas[0] ?? "").trim() !== "---") return 1;
  for (let i = 1; i < lineas.length; i += 1) {
    if (lineas[i].trim() === "---") break;
    if (new RegExp(`^${clave}\\s*:`).test(lineas[i].trim())) return i + 1;
  }
  return 1;
}

function idDe(datos, ruta) {
  const id = comoTexto(datos.id) || comoTexto(datos.item);
  return id === "" ? "" : id;
}

export function formatoError(e) {
  return `${e.ruta}:${e.linea} ${e.mensaje}`;
}

export function checkEsquema(archivos) {
  const errores = [];
  const vistos = new Map();
  for (const a of archivos ?? []) {
    if (!esEsquemaDoc(a.ruta)) continue;
    const parsed = parseFrontmatter(a.texto);
    if (!parsed.tiene) continue;
    const d = parsed.datos ?? {};
    const id = idDe(d, a.ruta);
    if (id === "") {
      errores.push({ ruta: a.ruta, linea: 1, mensaje: "falta id en frontmatter" });
    } else if (vistos.has(id)) {
      vistos.get(id).push(a.ruta);
    } else {
      vistos.set(id, [a.ruta]);
    }
    const tipo = comoTexto(d.tipo).toLowerCase();
    if (!TIPOS_VALIDOS.includes(tipo)) {
      errores.push({
        ruta: a.ruta,
        linea: lineaDe(a.texto, "tipo"),
        mensaje: `tipo inválido "${comoTexto(d.tipo)}": esperados ${TIPOS_VALIDOS.join(", ")}`,
      });
    }
    const estado = comoTexto(d.estado).toLowerCase();
    if (!ESTADOS_VALIDOS.includes(estado)) {
      errores.push({
        ruta: a.ruta,
        linea: lineaDe(a.texto, "estado"),
        mensaje: `estado inválido "${comoTexto(d.estado)}": esperados ${ESTADOS_VALIDOS.join(", ")}`,
      });
    }
    for (const clave of LISTAS) {
      if (!Array.isArray(d[clave])) {
        errores.push({
          ruta: a.ruta,
          linea: lineaDe(a.texto, clave),
          mensaje: `${clave} debe ser lista [...]`,
        });
      }
    }
    const resumenLineas = String(d.resumen ?? "").split("\n").filter((l) => l !== "");
    const totalLineas = String(d.resumen ?? "") === "" ? 0 : String(d.resumen).split("\n").length;
    if (totalLineas > 3 || resumenLineas.length > 3) {
      errores.push({
        ruta: a.ruta,
        linea: lineaDe(a.texto, "resumen"),
        mensaje: `resumen supera 3 líneas (${Math.max(totalLineas, resumenLineas.length)})`,
      });
    }
    if (estado === "reemplazado" && comoTexto(d.reemplazado_por) === "") {
      errores.push({
        ruta: a.ruta,
        linea: lineaDe(a.texto, "reemplazado_por"),
        mensaje: "reemplazado_por vacío con estado=reemplazado",
      });
    }
  }
  for (const [id, rutas] of vistos) {
    if (rutas.length < 2) continue;
    for (const ruta of rutas) {
      const otras = rutas.filter((r) => r !== ruta).join(", ");
      const texto = (archivos ?? []).find((a) => a.ruta === ruta)?.texto ?? "";
      errores.push({ ruta, linea: lineaDe(texto, "id"), mensaje: `id duplicado "${id}" también en ${otras}` });
    }
  }
  errores.sort((x, y) => (x.ruta < y.ruta ? -1 : x.ruta > y.ruta ? 1 : x.linea - y.linea));
  return errores;
}

function refsDe(datos) {
  const out = [];
  for (const a of Array.isArray(datos.depende_de) ? datos.depende_de : []) {
    out.push({ campo: "depende_de", id: String(a ?? "").trim() });
  }
  for (const a of Array.isArray(datos.reemplaza) ? datos.reemplaza : []) {
    out.push({ campo: "reemplaza", id: String(a ?? "").trim() });
  }
  const por = comoTexto(datos.reemplazado_por);
  if (por !== "") out.push({ campo: "reemplazado_por", id: por });
  return out.filter((r) => r.id !== "");
}

export function checkIds(archivos) {
  const porId = new Set();
  const parsed = [];
  for (const a of archivos ?? []) {
    if (!esEsquemaDoc(a.ruta)) continue;
    const p = parseFrontmatter(a.texto);
    if (!p.tiene) continue;
    const id = idDe(p.datos ?? {}, a.ruta);
    if (id !== "") porId.add(id);
    parsed.push({ ruta: a.ruta, texto: a.texto, datos: p.datos ?? {} });
  }
  const errores = [];
  for (const d of parsed) {
    for (const r of refsDe(d.datos)) {
      if (!porId.has(r.id)) {
        errores.push({
          ruta: d.ruta,
          linea: lineaDe(d.texto, r.campo),
          mensaje: `${r.campo} apunta a id inexistente "${r.id}"`,
        });
      }
    }
  }
  errores.sort((x, y) => (x.ruta < y.ruta ? -1 : x.ruta > y.ruta ? 1 : x.linea - y.linea));
  return errores;
}

export function extraerEnlaces(texto) {
  const out = [];
  const lineas = String(texto ?? "").split("\n");
  lineas.forEach((linea, i) => {
    for (const m of linea.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const crudo = String(m[1] ?? "").trim();
      if (crudo === "") continue;
      const primero = crudo.split(/\s+/)[0].replace(/^<|>$/g, "").trim();
      if (primero !== "") out.push({ destino: primero, linea: i + 1 });
    }
  });
  return out;
}

export function resolverEnlace(rutaOrigen, destino) {
  const limpio = String(destino ?? "").split("#")[0].trim();
  if (limpio.startsWith("/")) return limpio.replace(/^\/+/, "");
  const base = normRuta(rutaOrigen).split("/").slice(0, -1);
  const partes = [];
  for (const seg of [...base, ...limpio.split("/")]) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") partes.pop();
    else partes.push(seg);
  }
  return partes.join("/");
}

function destinoIgnorado(limpio) {
  const segs = String(limpio).replace(/\\/g, "/").split("/");
  return segs.includes("_origen-docx") || segs.includes("archivo");
}

export function checkEnlaces(archivos, existentes) {
  const hay = (r) => (existentes instanceof Set ? existentes.has(r) : existentes(r));
  const errores = [];
  for (const a of archivos ?? []) {
    for (const e of extraerEnlaces(a.texto)) {
      const d = e.destino;
      if (/^(https?:\/\/|mailto:)/i.test(d)) continue;
      const limpio = d.split("#")[0].trim();
      if (limpio === "") continue;
      if (!limpio.endsWith(".md")) continue;
      if (destinoIgnorado(limpio)) continue;
      const resuelto = resolverEnlace(a.ruta, limpio);
      if (!hay(resuelto)) {
        errores.push({
          ruta: a.ruta,
          linea: e.linea,
          mensaje: `enlace roto a ${limpio} (resuelve a ${resuelto})`,
          destino: limpio,
        });
      }
    }
  }
  errores.sort((x, y) => (x.ruta < y.ruta ? -1 : x.ruta > y.ruta ? 1 : x.linea - y.linea));
  return errores;
}

function claveBaseline(entrada) {
  if (typeof entrada === "string") {
    const i = entrada.indexOf("->");
    if (i < 0) return null;
    const ruta = entrada.slice(0, i).trim();
    const destino = entrada.slice(i + 2).trim();
    if (ruta === "" || destino === "") return null;
    return `${ruta} -> ${destino}`;
  }
  const ruta = String(entrada?.ruta ?? "").trim();
  const destino = String(entrada?.destino ?? "").trim();
  if (ruta === "" || destino === "") return null;
  return `${ruta} -> ${destino}`;
}

function coincideRoto(roto, rutaB, destB) {
  if (roto.ruta !== rutaB) return false;
  if (roto.destino === destB) return true;
  return String(roto.mensaje ?? "").includes(destB);
}

export function aplicarBaseline(rotos, baseline) {
  const claves = [];
  for (const b of baseline ?? []) {
    const k = claveBaseline(b);
    if (k !== null) claves.push(k);
  }
  const usados = new Set();
  const nuevos = [];
  for (const r of rotos ?? []) {
    let ok = false;
    for (const k of claves) {
      const i = k.indexOf("->");
      const rutaB = k.slice(0, i).trim();
      const destB = k.slice(i + 2).trim();
      if (coincideRoto(r, rutaB, destB)) {
        ok = true;
        usados.add(k);
        break;
      }
    }
    if (!ok) nuevos.push(r);
  }
  const obsoletas = claves.filter((k) => !usados.has(k));
  return { nuevos, obsoletas, tolerados: rotos.length - nuevos.length };
}
