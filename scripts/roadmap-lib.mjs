const INICIO = "<!-- roadmap:avances:inicio -->";
const FIN = "<!-- roadmap:avances:fin -->";
const RX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CAMPOS = ["item", "estado", "adr", "prd", "fecha"];

export function parsearAvance(texto, nombre) {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  if (lineas[0]?.trim() !== "---") {
    throw new Error(`avance inválido en ${nombre}: falta front-matter --- inicial`);
  }
  const cierre = lineas.indexOf("---", 1);
  if (cierre < 0) {
    throw new Error(`avance inválido en ${nombre}: falta cierre --- del front-matter`);
  }
  const datos = {};
  for (const linea of lineas.slice(1, cierre)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(linea);
    if (m) datos[m[1]] = (m[2] ?? "").trim();
  }
  for (const campo of CAMPOS) {
    if (!datos[campo]) {
      throw new Error(`avance inválido en ${nombre}: falta campo ${campo}`);
    }
  }
  if (!RX_FECHA.test(datos.fecha)) {
    throw new Error(`avance inválido en ${nombre}: fecha debe ser AAAA-MM-DD`);
  }
  const cuerpo = lineas.slice(cierre + 1).filter((l) => l.trim() !== "");
  if (cuerpo.length !== 1) {
    throw new Error(`avance inválido en ${nombre}: se espera exactamente una línea de texto`);
  }
  return {
    item: datos.item,
    estado: datos.estado,
    adr: datos.adr,
    prd: datos.prd,
    fecha: datos.fecha,
    texto: cuerpo[0].trim(),
  };
}

export function renderizarSeccion(avances) {
  const ordenados = [...avances].sort((a, b) =>
    a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.adr < b.adr ? -1 : a.adr > b.adr ? 1 : 0,
  );
  const lineas = [
    "## Avances por PR (generado)",
    "",
    "No se edita a mano: se regenera con `npm run roadmap` desde `docs/roadmap/avances/`.",
    "",
    "| Fecha | Item | Estado | Avance | PRD / ADR |",
    "|---|---|---|---|---|",
  ];
  for (const a of ordenados) {
    const celda = (v) => v.replace(/\|/g, "\\|");
    lineas.push(
      `| ${celda(a.fecha)} | ${celda(a.item)} | ${celda(a.estado)} | ${celda(a.texto)} | ${celda(a.prd)} / ${celda(a.adr)} |`,
    );
  }
  return lineas.join("\n");
}

export function aplicarSeccion(roadmap, seccion) {
  const bloque = `${INICIO}\n${seccion}\n${FIN}`;
  const iInicio = roadmap.indexOf(INICIO);
  const iFin = roadmap.indexOf(FIN);
  if (iInicio >= 0 && iFin > iInicio) {
    const inicioLinea = iInicio === 0 ? 0 : roadmap.lastIndexOf("\n", iInicio - 1) + 1;
    const finLinea = roadmap.indexOf("\n", iFin + FIN.length);
    const fin = finLinea < 0 ? roadmap.length : finLinea;
    return roadmap.slice(0, inicioLinea) + bloque + roadmap.slice(fin);
  }
  const marca = "## Decisiones registradas";
  const idx = roadmap.indexOf(marca);
  if (idx >= 0) {
    const cabeza = roadmap.slice(0, idx).replace(/\n+$/, "");
    return `${cabeza}\n\n${bloque}\n\n${roadmap.slice(idx)}`;
  }
  return `${roadmap.replace(/\n+$/, "")}\n\n${bloque}`;
}

const RX_SCRIPT = /^scripts\/roadmap.*\.mjs$/;
const RX_TEST = /^tests\/roadmap.*\.test\.ts$/;
const RX_WORKFLOW = /^\.github\/workflows\/roadmap.*\.yml$/;

export function guardaPR(archivosCambiados) {
  if (!archivosCambiados.includes("docs/ROADMAP.md")) {
    return { ok: true, motivo: "" };
  }
  const fuera = archivosCambiados.filter(
    (f) =>
      f !== "docs/ROADMAP.md" &&
      !f.startsWith("docs/roadmap/") &&
      !RX_SCRIPT.test(f) &&
      !RX_TEST.test(f) &&
      !RX_WORKFLOW.test(f),
  );
  if (fuera.length > 0) {
    return {
      ok: false,
      motivo: `docs/ROADMAP.md solo se regenera en main; el PR toca archivos fuera de la herramienta: ${fuera.join(", ")}`,
    };
  }
  return { ok: true, motivo: "" };
}
