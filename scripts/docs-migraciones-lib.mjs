// Lógica pura del registro de migraciones (testeada en tests/docs-migraciones.test.ts).
// Un archivo docs/roadmap/migraciones/<tag>.json por migración; el .md es derivado.

const RX_TAG = /^[0-9]{4}_[A-Za-z0-9_]+$/;
const RX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CLAVES = new Set(["tag", "fecha", "aprobado_por", "evidencia", "backup"]);

export function tagDeArchivo(nombre) {
  const n = String(nombre ?? "");
  return n.endsWith(".json") ? n.slice(0, -".json".length) : null;
}

function textoOpcional(valor, clave, errores, nombre) {
  if (valor === undefined) return "";
  if (typeof valor !== "string" || valor.trim() === "") {
    errores.push({ nombre, mensaje: `${clave} debe ser texto no vacío` });
    return "";
  }
  return valor.trim();
}

export function parsearRegistro(nombre, texto) {
  const errores = [];
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    return { registro: null, errores: [{ nombre, mensaje: `JSON inválido: ${e.message}` }] };
  }
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
    return { registro: null, errores: [{ nombre, mensaje: "el registro debe ser un objeto JSON" }] };
  }
  const esperado = tagDeArchivo(nombre);
  const tag = typeof datos.tag === "string" ? datos.tag.trim() : "";
  if (tag === "") errores.push({ nombre, mensaje: "falta tag" });
  else if (tag !== esperado) errores.push({ nombre, mensaje: `tag "${tag}" no coincide con el archivo "${esperado}"` });
  else if (!RX_TAG.test(tag)) errores.push({ nombre, mensaje: `tag inválido "${tag}": se espera NNNN_slug` });
  for (const clave of Object.keys(datos)) {
    if (!CLAVES.has(clave)) errores.push({ nombre, mensaje: `clave desconocida "${clave}"` });
  }
  const fecha = textoOpcional(datos.fecha, "fecha", errores, nombre);
  if (fecha !== "" && !RX_FECHA.test(fecha)) errores.push({ nombre, mensaje: `fecha inválida "${fecha}": se espera AAAA-MM-DD` });
  const registro = {
    tag: tag || String(esperado ?? ""),
    fecha,
    aprobado_por: textoOpcional(datos.aprobado_por, "aprobado_por", errores, nombre),
    evidencia: textoOpcional(datos.evidencia, "evidencia", errores, nombre),
    backup: textoOpcional(datos.backup, "backup", errores, nombre),
  };
  return { registro, errores };
}

export function validarRegistros(archivos) {
  const registros = [];
  const errores = [];
  for (const a of archivos ?? []) {
    if (a.nombre === "README.md" || !String(a.nombre).endsWith(".json")) continue;
    const r = parsearRegistro(a.nombre, a.texto);
    errores.push(...r.errores);
    if (r.registro) registros.push(r.registro);
  }
  const vistos = new Set();
  for (const r of registros) {
    if (vistos.has(r.tag)) errores.push({ nombre: `${r.tag}.json`, mensaje: `tag duplicado "${r.tag}"` });
    vistos.add(r.tag);
  }
  registros.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  return { registros, errores };
}

function detalleDe(r) {
  let detalle = r.fecha;
  const evidencia = r.evidencia.replace(/\.$/, "");
  if (evidencia) detalle += (detalle ? ": " : "") + evidencia;
  if (r.aprobado_por) detalle += (detalle ? "; " : "") + `aprobada por ${r.aprobado_por}`;
  if (r.backup) detalle += (detalle ? "; " : "") + `backup ${r.backup}`;
  return detalle;
}

export function renderMigraciones(registros) {
  const lineas = [
    "# Migraciones aplicadas en la base real",
    "",
    "Generado por `npm run docs:migraciones` desde `docs/roadmap/migraciones/<tag>.json`. No editar a mano.",
    "",
    "Fuente de verdad para `scripts/cadena/puede-mergear.mjs`: un PR que agrega `drizzle/*.sql` solo se mergea si existe el registro de su tag en la rama base.",
    "",
  ];
  for (const r of registros) {
    lineas.push(`- ${r.tag}`);
    const detalle = detalleDe(r);
    if (detalle !== "") lineas.push(`<!-- ${detalle} -->`);
  }
  lineas.push("");
  return lineas.join("\n");
}
