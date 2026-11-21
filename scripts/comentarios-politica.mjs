// P10-25: fuente única de política de comentarios (ADR-0064); alimenta check, AGENTS.md y delete-comment.

/** @typedef {{ etiqueta: string, pregunta: string, ejemplo: string }} ClasePolitica */

/** @type {ClasePolitica[]} */
export const CLASES = [
  {
    etiqueta: "plataforma",
    pregunta: "¿lo obliga navegador/runtime/librería?",
    ejemplo: "// P1-6 [plataforma]: service worker no expone headers en offline",
  },
  {
    etiqueta: "fiscal",
    pregunta: "¿hay norma citada?",
    ejemplo: "// ADR-0089 [fiscal]: RG 4291 exige QR en el pie del comprobante",
  },
  {
    etiqueta: "tenant",
    pregunta: "¿evita que un comercio vea/escriba datos de otro?",
    ejemplo: "// TB-165 [tenant]: el tenant_id sale de la sesión, nunca del body",
  },
  {
    etiqueta: "rol",
    pregunta: "¿evita que un Empleado haga algo de Dueño?",
    ejemplo: "// P10-24 [rol]: el Empleado no ve precios de costo",
  },
];

/** Frases COM-S7: sin `temporal` suelto (P10-25). */
export const COM_S7_FRASES = [
  { patron: /\bTODO\b/i, nombre: "TODO" },
  { patron: /\bFIXME\b/i, nombre: "FIXME" },
  { patron: /\bHACK\b/i, nombre: "HACK" },
  { patron: /\bXXX\b/i, nombre: "XXX" },
  { patron: /\bparche temporal\b/i, nombre: "parche temporal" },
  { patron: /\bpor ahora\b/i, nombre: "por ahora" },
];

export const ENLACE_ISSUE = /#\d+\b/;
export const SOLO_SEPARADOR = /^\s*\/\/[-\s=*:]*$/;

/** Token con guion (ítem real); rechaza ISO8601 y similares sin guion. */
export const PATRON_ID_TOKEN = /\b([A-Z][A-Z0-9]*(?:-[A-Za-z0-9]+)+)\b/g;

export const ETIQUETAS_CLASE = CLASES.map((c) => c.etiqueta);
export const RE_CLASE = new RegExp(`\\[(${ETIQUETAS_CLASE.join("|")})\\]`);

const EJEMPLO_POR_DEFECTO = `// ${CLASES[3].ejemplo.replace(/^\/\/\s*/, "")}`;

export function mensajeSinClase(archivo, linea) {
  const lineas = CLASES.map((c) => `  · [${c.etiqueta}] ${c.pregunta}`);
  return [
    `Escribí el porqué en una línea con clase e id (${archivo}:${linea}), por ejemplo: ${EJEMPLO_POR_DEFECTO}`,
    "Elegí la clase que aplique:",
    ...lineas,
    "Si ninguna pregunta da sí, borrá el comentario.",
  ].join("\n");
}

export function mensajeSinId(archivo, linea, sugerencia) {
  const sug = sugerencia
    ? ` Usá el ítem de esta rama: ${sugerencia} (docs/roadmap/avances/${sugerencia}.md).`
    : "";
  return `Nombrá un id de ítem registrado en ${archivo}:${linea}.${sug} Ejemplo: ${EJEMPLO_POR_DEFECTO}. Si no explica un porqué, borralo.`;
}

export function mensajeIdDesconocido(id, archivo, linea, sugerencia) {
  const sug = sugerencia
    ? ` Usá el ítem de esta rama: ${sugerencia} (docs/roadmap/avances/${sugerencia}.md).`
    : "";
  return `Usá un id registrado (con guion), no "${id}" en ${archivo}:${linea}.${sug} Ejemplo: ${EJEMPLO_POR_DEFECTO}. Si no explica un porqué, borralo.`;
}

export function mensajeJSDoc(archivo, linea) {
  return `Escribí el porqué en una línea ${archivo}:${linea}, por ejemplo: ${EJEMPLO_POR_DEFECTO}. En src/ usamos //, no JSDoc (ADR-0064).`;
}

export function mensajeComS7(archivo, linea, vista) {
  return `Registrá la deuda en un issue y enlazalo en la misma línea ${archivo}:${linea}: ${vista}`;
}

export function pieCheckMecanico() {
  return [
    "Formato válido: // <id> [clase]: porqué · Política: scripts/comentarios-politica.mjs",
    "Si repite el código o es tautología, borralo: criterio en .agents/skills/delete-comment/SKILL.md",
  ].join("\n");
}

export function bloqueAgentsMarkdown() {
  const clases = CLASES.map(
    (c) => `${c.etiqueta === "plataforma" ? "plataforma/navegador" : c.etiqueta} (\`[${c.etiqueta}]\`)`,
  ).join(", ");
  const marcadores = COM_S7_FRASES.map((f) => f.nombre).join(", ");
  return [
    "- En comentarios nuevos de `src/`, escribí el porqué que el código no puede decir en una línea `// <id> [clase]: …` (ADR-0064), con id registrado (con guion) en `docs/roadmap/avances/`, `docs/graph.json` o `docs/ROADMAP.md` y una clase — " +
      clases +
      ". Ejemplo: `// P10-24 [rol]: el Empleado no ve precios de costo`. Si el comentario no aporta porqué, borralo antes de commitear. Para clasificar un alcance (tautología, excusa, decisión) usá el skill `/delete-comment` (`.agents/skills/delete-comment/SKILL.md`); las decisiones van a un ADR o `decisions.tsv`, los gotchas a `docs/guias/gotchas-<área>.md`. Un parche temporal va a un issue, no a un comentario (PRD-COM-01). Marcadores `" +
      marcadores +
      "` en línea nueva: agregá `#<issue>` en la misma línea (COM-S7). `scripts/check-comment-ids.mjs` en `verify` aplica las reglas mecánicas (id, clase, // en vez de JSDoc, marcadores); criterio de poda queda en el skill. PLAN-COM-01-E en `docs/diseno/PLAN-COM-01/e-ejecucion.md`. Agregá avance de Roadmap y `> Estado al` del PRD del ítem. No toques generados ni `docs/ROADMAP.md`.",
  ].join("\n");
}

export function bloqueSkillReglasMarkdown() {
  const clases = CLASES.map((c) => `- **\`[${c.etiqueta}]\`** — ${c.pregunta} Ejemplo: \`${c.ejemplo}\`.`).join("\n");
  const marcadores = COM_S7_FRASES.map((f) => f.nombre).join(", ");
  return [
    "Escribí solo el porqué no obvio en una línea `// <id> [clase]: …`. Si no hay porqué, borrá el comentario.",
    "",
    "### Clases (elegí una)",
    "",
    clases,
    "",
    "Si ninguna pregunta da sí, el comentario se va.",
    "",
    "### COM-S7",
    "",
    `Con marcadores \`${marcadores}\` en línea nueva, abrí un issue y poné \`#<número>\` en la misma línea.`,
    "",
    "### Formato",
    "",
    "Preferí `//` de una línea. JSDoc no suma en `src/` (ADR-0064): pasá el porqué a `//`.",
    "",
    "### Criterio (manual)",
    "",
    "Tautología, excusa, obsoleto y registro de decisión los juzgás vos en los pasos de este skill; el check solo valida forma.",
  ].join("\n");
}