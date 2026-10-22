import { parseFrontmatter } from "./docs-lib.mjs";

const RX_MIGRACION = /^-\s+(\S+)\s*$/;

function comoTexto(v) {
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
}

function primeraLineaNoVacia(texto) {
  for (const linea of String(texto ?? "").split("\n")) {
    const t = linea.trim();
    if (t !== "") return t;
  }
  return "";
}

function recortar(texto, ancho) {
  const t = String(texto ?? "").trim();
  if (t.length <= ancho) return t;
  const corte = t.slice(0, ancho);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > ancho * 0.6 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}

/**
 * @typedef {Object} Avance
 * @property {string} item
 * @property {string} estado
 * @property {string} fecha
 * @property {string} adr
 * @property {string} prd
 * @property {string} texto
 * @property {string} ruta
 */

/**
 * @param {{ nombre: string, texto: string }[]} archivos
 * @returns {Avance[]}
 */
export function parsearAvances(archivos) {
  const out = [];
  for (const a of archivos ?? []) {
    const parsed = parseFrontmatter(a.texto);
    if (!parsed.tiene) continue;
    const d = parsed.datos ?? {};
    const item = comoTexto(d.item) || String(a.nombre ?? "").replace(/\.md$/, "");
    if (item === "") continue;
    out.push({
      item,
      estado: comoTexto(d.estado),
      fecha: comoTexto(d.fecha),
      adr: comoTexto(d.adr),
      prd: comoTexto(d.prd),
      texto: primeraLineaNoVacia(parsed.cuerpo),
      ruta: `roadmap/avances/${a.nombre}`,
    });
  }
  return out;
}

function esHecho(estado) {
  return /^hecho/i.test(String(estado ?? ""));
}

function esEnCurso(estado) {
  return /en curso|curso/i.test(String(estado ?? "")) && !esHecho(estado);
}

export function clasificarAvances(avances) {
  const lista = Array.isArray(avances) ? [...avances] : [];
  const porFecha = (a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.item < b.item ? -1 : 1);
  const hechos = lista.filter((a) => esHecho(a.estado)).sort(porFecha);
  const enCurso = lista.filter((a) => esEnCurso(a.estado)).sort(porFecha);
  const pendientes = lista.filter((a) => !esHecho(a.estado) && !esEnCurso(a.estado)).sort(porFecha);
  return { hechos, enCurso, pendientes };
}

export function parsearMigraciones(texto) {
  const tags = [];
  for (const linea of String(texto ?? "").split("\n")) {
    const m = RX_MIGRACION.exec(linea.trim());
    if (m && !m[1].startsWith("<")) tags.push(m[1]);
  }
  return tags;
}

function lineaAvance(a, ancho) {
  const fecha = a.fecha === "" ? "sin fecha" : a.fecha;
  return `- ${fecha} · [${a.item}](${a.ruta}) · ${recortar(a.texto, ancho)}`;
}

function seccionBloqueos(bloqueos) {
  const credenciales = Array.isArray(bloqueos?.credenciales) ? bloqueos.credenciales : [];
  const decisiones = Array.isArray(bloqueos?.decisiones) ? bloqueos.decisiones : [];
  const out = [];
  if (credenciales.length > 0) {
    out.push("Credenciales externas:", "");
    for (const b of credenciales) out.push(`- ${b.tema} · depende de ${b.depende}`);
    out.push("");
  }
  if (decisiones.length > 0) {
    out.push("Decisiones de Mauri:", "");
    for (const b of decisiones) out.push(`- ${b.tema} · depende de ${b.depende}`);
    out.push("");
  }
  if (out.length === 0) out.push("Sin bloqueos registrados.", "");
  return out;
}

const GATE = [
  "- `npm run verify` (Node 22, Postgres A/B) debe pasar, y `node scripts/cadena/puede-mergear.mjs <PR>` debe salir 0.",
  "- Squash-merge y borrar la rama.",
  "- Las migraciones solo se aplican con aprobación de Mauri y se registran en `docs/roadmap/migraciones/<tag>.json` antes del merge del PR que las trae.",
];

export function renderEstado(input = {}) {
  const avances = Array.isArray(input.avances) ? input.avances : [];
  const migraciones = Array.isArray(input.migraciones) ? input.migraciones : [];
  const limiteHechos = Number.isInteger(input.limiteHechos) ? input.limiteHechos : 15;
  const anchoTexto = Number.isInteger(input.anchoTexto) ? input.anchoTexto : 130;
  const { hechos, enCurso, pendientes } = clasificarAvances(avances);

  const out = ["# Estado del proyecto", "", "Generado por `npm run docs:estado`. No editar a mano.", ""];

  const cuantos = Math.min(limiteHechos, hechos.length);
  out.push(`## Hecho reciente (últimos ${cuantos} avances)`, "");
  if (hechos.length === 0) out.push("- Sin avances hechos registrados.");
  for (const a of hechos.slice(0, limiteHechos)) out.push(lineaAvance(a, anchoTexto));
  out.push("");

  out.push("## En curso", "");
  if (enCurso.length === 0) out.push("- Sin avances en curso.");
  for (const a of enCurso) out.push(lineaAvance(a, anchoTexto));
  out.push("");

  out.push("## Pendientes y bloqueados", "");
  if (pendientes.length === 0) out.push("- Sin pendientes registrados.");
  for (const a of pendientes) out.push(lineaAvance(a, anchoTexto));
  out.push("");

  out.push("## Migraciones aplicadas", "");
  if (migraciones.length === 0) {
    out.push("Sin migraciones registradas.");
  } else {
    out.push(`Última aplicada: \`${migraciones[migraciones.length - 1]}\`.`);
    out.push(`Total: ${migraciones.length}.`);
  }
  out.push("");

  out.push("## Bloqueado y de quién depende", "");
  out.push(...seccionBloqueos(input.bloqueos));
  out.push("## Gate de merge", "");
  out.push(...GATE);

  return `${out.join("\n")}\n`;
}
