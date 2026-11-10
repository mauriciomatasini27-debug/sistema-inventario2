const INICIO = "<!-- roadmap:avances:inicio -->";
const FIN = "<!-- roadmap:avances:fin -->";
const PROLOGO_ROADMAP = `# Roadmap

El estado vivo son los avances que no están en hecho. \`npm run roadmap\` en main regenera esta sección desde \`docs/roadmap/avances/\`.

`;

export function arranqueContradiceHecho(estado, texto) {
  if (!/^hecho/i.test(estado)) return false;
  const resto = String(texto).replace(/^[A-Za-z0-9][A-Za-z0-9_.-]*\s+/, "");
  return /^(pendiente|parcial|propuesto|bloqueado)\b/i.test(resto);
}

function validarArranque(estado, texto, nombre) {
  if (arranqueContradiceHecho(estado, texto)) {
    throw new Error(
      `avance inválido en ${nombre}: con estado hecho el texto no puede arrancar con pendiente, parcial, propuesto o bloqueado`,
    );
  }
}
const RX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RX_CHICO = /^(?:P\d+-\d+|TB-\d+)$/;
const CAMPOS = ["item", "estado", "adr", "prd", "fecha"];
const CAMPOS_CHICO = ["item", "estado", "fecha"];

function nombreBase(nombre) {
  return String(nombre ?? "").split("/").pop().replace(/\.md$/, "");
}

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
  if (RX_CHICO.test(nombreBase(nombre))) {
    for (const campo of CAMPOS_CHICO) {
      if (!datos[campo]) {
        throw new Error(`avance inválido en ${nombre}: falta campo ${campo}`);
      }
    }
    if (!RX_FECHA.test(datos.fecha)) {
      throw new Error(`avance inválido en ${nombre}: fecha debe ser AAAA-MM-DD`);
    }
    const resto = lineas.slice(cierre + 1);
    const iDecision = resto.findIndex((l) => l.trim() === "## Decisión");
    if (iDecision < 0) {
      throw new Error(`avance inválido en ${nombre}: falta sección ## Decisión`);
    }
    const previas = resto.slice(0, iDecision).filter((l) => l.trim() !== "");
    if (previas.length !== 1) {
      throw new Error(`avance inválido en ${nombre}: se espera exactamente una línea de texto antes de ## Decisión`);
    }
    const decision = resto.slice(iDecision + 1).filter((l) => l.trim() !== "");
    if (decision.length < 5 || decision.length > 10) {
      throw new Error(
        `avance inválido en ${nombre}: la sección ## Decisión lleva entre 5 y 10 líneas no vacías`,
      );
    }
    const avanceChico = {
      item: datos.item,
      estado: datos.estado,
      adr: datos.adr ?? "",
      prd: datos.prd ?? "",
      fecha: datos.fecha,
      texto: previas[0].trim(),
      chico: true,
      decision: decision.map((l) => l.trim()),
    };
    validarArranque(avanceChico.estado, avanceChico.texto, nombre);
    return avanceChico;
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
  const avance = {
    item: datos.item,
    estado: datos.estado,
    adr: datos.adr,
    prd: datos.prd,
    fecha: datos.fecha,
    texto: cuerpo[0].trim(),
  };
  validarArranque(avance.estado, avance.texto, nombre);
  return avance;
}

export function renderizarSeccion(avances) {
  const abiertos = avances.filter((a) => !/^hecho/i.test(a.estado));
  const encabezado = [
    "## Avances por PR (generado)",
    "",
    "No se edita a mano: se regenera con `npm run roadmap` desde `docs/roadmap/avances/`.",
    "",
  ];
  if (abiertos.length === 0) {
    return [...encabezado, "Sin avances abiertos."].join("\n");
  }
  const ordenados = [...abiertos].sort((a, b) =>
    a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.adr < b.adr ? -1 : a.adr > b.adr ? 1 : 0,
  );
  const lineas = [
    ...encabezado,
    "| Fecha | Item | Estado | Avance | PRD / ADR |",
    "|---|---|---|---|---|",
  ];
  for (const a of ordenados) {
    const celda = (v) => (v || "—").replace(/\|/g, "\\|");
    lineas.push(
      `| ${celda(a.fecha)} | ${celda(a.item)} | ${celda(a.estado)} | ${celda(a.texto)} | ${celda(a.prd)} / ${celda(a.adr)} |`,
    );
  }
  return lineas.join("\n");
}

export function recortarPrologo(roadmap) {
  const iInicio = roadmap.indexOf(INICIO);
  if (iInicio < 0) return roadmap;
  return PROLOGO_ROADMAP + roadmap.slice(iInicio);
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
