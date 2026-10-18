export const UMBRALES = { texto: 4.5, grande: 3.0 };

export const PAREJAS = [
  { nombre: "texto principal sobre canvas", fg: "void", bg: "canvas", uso: "texto", modo: "light" },
  { nombre: "texto principal sobre linen", fg: "void", bg: "linen", uso: "texto", modo: "light" },
  { nombre: "texto sobre dark", fg: "star-white", bg: "void", uso: "texto", modo: "dark" },
  { nombre: "selección y foco", fg: "star-white", bg: "trust", uso: "texto", modo: "dark" },
  { nombre: "acento sobre canvas", fg: "trust", bg: "canvas", uso: "texto", modo: "light" },
  { nombre: "acento sobre linen", fg: "trust", bg: "linen", uso: "texto", modo: "light" },
  { nombre: "muted sobre canvas", fg: "ash", bg: "canvas", uso: "texto", modo: "light" },
  { nombre: "muted sobre linen", fg: "ash", bg: "linen", uso: "texto", modo: "light" },
  { nombre: "muted sobre star-white", fg: "ash", bg: "star-white", uso: "texto", modo: "light" },
  { nombre: "botón panel", fg: "star-white", bg: "star-glow", uso: "texto", modo: "light" },
  { nombre: "CTA landing", fg: "star-white", bg: "star-glow", uso: "texto", modo: "light" },
  { nombre: "texto landing sobre blanco", fg: "void", bg: "star-white", uso: "texto", modo: "light" },
  { nombre: "botón WhatsApp", fg: "void", bg: "whatsapp", uso: "texto", modo: "light" },
  { nombre: "CTA email", fg: "star-white", bg: "star-glow", uso: "texto", modo: "light" },
  { nombre: "CTA llama dark", fg: "void", bg: "star-warm", uso: "grande", modo: "dark" },
  { nombre: "CTA hover dark", fg: "void", bg: "star-glow", uso: "grande", modo: "dark" },
  // DS-S1: hover del CTA sg-flame-cta, color-mix(star-glow 85%, #000) con blanco encima.
  { nombre: "CTA hover oscurecido (DS-S1)", fg: "star-white", bg: "star-glow", alfa: 0.85, debajo: "#000000", uso: "texto", modo: "light" },
  // Estados claros (texto 4.5 sobre su tint y sobre canvas).
  { nombre: "ok sobre ok-tint", fg: "ok", bg: "ok-tint", uso: "texto", modo: "light" },
  { nombre: "ok sobre canvas", fg: "ok", bg: "canvas", uso: "texto", modo: "light" },
  { nombre: "aviso sobre aviso-tint", fg: "aviso", bg: "aviso-tint", uso: "texto", modo: "light" },
  { nombre: "aviso sobre canvas", fg: "aviso", bg: "canvas", uso: "texto", modo: "light" },
  { nombre: "vivo sobre vivo-tint", fg: "vivo", bg: "vivo-tint", uso: "texto", modo: "light" },
  { nombre: "vivo sobre canvas", fg: "vivo", bg: "canvas", uso: "texto", modo: "light" },
  { nombre: "pendiente sobre pendiente-tint", fg: "pendiente", bg: "pendiente-tint", uso: "texto", modo: "light" },
  { nombre: "pendiente sobre canvas", fg: "pendiente", bg: "canvas", uso: "texto", modo: "light" },
  { nombre: "peligro sobre peligro-tint", fg: "peligro", bg: "peligro-tint", uso: "texto", modo: "light" },
  { nombre: "peligro sobre canvas", fg: "peligro", bg: "canvas", uso: "texto", modo: "light" },
  // Estados oscuros (texto 4.5 sobre su tint-oscuro, void y charcoal).
  { nombre: "ok-oscuro sobre ok-tint-oscuro", fg: "ok-oscuro", bg: "ok-tint-oscuro", uso: "texto", modo: "dark" },
  { nombre: "ok-oscuro sobre void", fg: "ok-oscuro", bg: "void", uso: "texto", modo: "dark" },
  { nombre: "ok-oscuro sobre charcoal", fg: "ok-oscuro", bg: "charcoal", uso: "texto", modo: "dark" },
  { nombre: "aviso-oscuro sobre aviso-tint-oscuro", fg: "aviso-oscuro", bg: "aviso-tint-oscuro", uso: "texto", modo: "dark" },
  { nombre: "aviso-oscuro sobre void", fg: "aviso-oscuro", bg: "void", uso: "texto", modo: "dark" },
  { nombre: "aviso-oscuro sobre charcoal", fg: "aviso-oscuro", bg: "charcoal", uso: "texto", modo: "dark" },
  { nombre: "vivo-oscuro sobre vivo-tint-oscuro", fg: "vivo-oscuro", bg: "vivo-tint-oscuro", uso: "texto", modo: "dark" },
  { nombre: "vivo-oscuro sobre void", fg: "vivo-oscuro", bg: "void", uso: "texto", modo: "dark" },
  { nombre: "vivo-oscuro sobre charcoal", fg: "vivo-oscuro", bg: "charcoal", uso: "texto", modo: "dark" },
  { nombre: "pendiente-oscuro sobre pendiente-tint-oscuro", fg: "pendiente-oscuro", bg: "pendiente-tint-oscuro", uso: "texto", modo: "dark" },
  { nombre: "pendiente-oscuro sobre void", fg: "pendiente-oscuro", bg: "void", uso: "texto", modo: "dark" },
  { nombre: "pendiente-oscuro sobre charcoal", fg: "pendiente-oscuro", bg: "charcoal", uso: "texto", modo: "dark" },
  { nombre: "peligro-oscuro sobre peligro-tint-oscuro", fg: "peligro-oscuro", bg: "peligro-tint-oscuro", uso: "texto", modo: "dark" },
  { nombre: "peligro-oscuro sobre void", fg: "peligro-oscuro", bg: "void", uso: "texto", modo: "dark" },
  { nombre: "peligro-oscuro sobre charcoal", fg: "peligro-oscuro", bg: "charcoal", uso: "texto", modo: "dark" },
  // Tiles ember (secundarias, nunca CTA primario).
  { nombre: "texto sobre ember-ambar", fg: "void", bg: "ember-ambar", uso: "texto", modo: "light" },
  { nombre: "texto sobre ember-coral", fg: "void", bg: "ember-coral", uso: "texto", modo: "light" },
  { nombre: "texto sobre ember-rojo", fg: "void", bg: "ember-rojo", uso: "texto", modo: "light" },
  { nombre: "texto sobre ember-vino", fg: "star-white", bg: "ember-vino", uso: "texto", modo: "dark" },
  // Tema oscuro.
  { nombre: "texto sobre charcoal", fg: "star-white", bg: "charcoal", uso: "texto", modo: "dark" },
  { nombre: "muted-dark sobre charcoal", fg: "muted-dark", bg: "charcoal", uso: "texto", modo: "dark" },
  { nombre: "acento oscuro sobre charcoal", fg: "pendiente-oscuro", bg: "charcoal", uso: "texto", modo: "dark" },
  // Vidrio (DS-S5): peor caso con la opacidad y el contenido de atrás.
  { nombre: "barra clara: texto sobre canvas 85%", fg: "void", bg: "canvas", alfa: 0.85, debajo: "void", uso: "texto", modo: "light" },
  { nombre: "barra oscura: texto sobre void 85%", fg: "star-white", bg: "void", alfa: 0.85, debajo: "star-white", uso: "texto", modo: "dark" },
  { nombre: "card clara: muted sobre star-white 80%", fg: "ash", bg: "star-white", alfa: 0.8, debajo: "canvas", uso: "texto", modo: "light" },
  { nombre: "card oscura: muted sobre charcoal 80%", fg: "muted-dark", bg: "charcoal", alfa: 0.8, debajo: "void", uso: "texto", modo: "dark" },
  // Marca 2 (DS-S2/S4): pills oscuras, muted sobre void/mid, serie ember y demo admin.
  { nombre: "muted-dark sobre void", fg: "muted-dark", bg: "void", uso: "texto", modo: "dark" },
  { nombre: "muted-dark sobre mid", fg: "muted-dark", bg: "mid", uso: "texto", modo: "dark" },
  { nombre: "texto sobre mid", fg: "star-white", bg: "mid", uso: "texto", modo: "dark" },
  { nombre: "serie ember claro: vino sobre star-white", fg: "ember-vino", bg: "star-white", uso: "grande", modo: "light" },
  { nombre: "serie ember oscuro: ambar sobre charcoal", fg: "ember-ambar", bg: "charcoal", uso: "grande", modo: "dark" },
  { nombre: "admin demo: void sobre llama", fg: "void", bg: "llama", uso: "texto", modo: "light" },
  { nombre: "serie ok claro: ok sobre star-white", fg: "ok", bg: "star-white", uso: "grande", modo: "light" },
  { nombre: "texto sobre ember-coral (mora admin)", fg: "void", bg: "ember-coral", uso: "texto", modo: "dark" },
  // Email papel (DS-S21): el papel del email pasa a void en oscuro con texto
  // canvas, y el CTA queda star-glow con blanco en los dos modos.
  { nombre: "email papel oscuro: texto sobre void", fg: "canvas", bg: "void", uso: "texto", modo: "dark" },
  { nombre: "email CTA dark", fg: "star-white", bg: "star-glow", uso: "texto", modo: "dark" },
  // Listas (DS-S15): énfasis de SKU y cantidades, también sobre hover y fila seleccionada.
  { nombre: "énfasis lista claro: star-glow sobre star-white", fg: "star-glow", bg: "star-white", uso: "texto", modo: "light" },
  { nombre: "énfasis lista claro sobre hover naranja 6%", fg: "star-glow", bg: "naranja", alfa: 0.06, debajo: "star-white", uso: "texto", modo: "light" },
  { nombre: "énfasis lista claro sobre seleccionada star-warm 10%", fg: "star-glow", bg: "star-warm", alfa: 0.1, debajo: "star-white", uso: "texto", modo: "light" },
  { nombre: "texto lista claro sobre seleccionada star-warm 10%", fg: "void", bg: "star-warm", alfa: 0.1, debajo: "star-white", uso: "texto", modo: "light" },
  { nombre: "énfasis lista oscuro: ambar sobre charcoal", fg: "ember-ambar", bg: "charcoal", uso: "texto", modo: "dark" },
  { nombre: "énfasis lista oscuro sobre seleccionada star-warm 10%", fg: "ember-ambar", bg: "star-warm", alfa: 0.1, debajo: "charcoal", uso: "texto", modo: "dark" },
  { nombre: "texto lista oscuro sobre seleccionada star-warm 10%", fg: "star-white", bg: "star-warm", alfa: 0.1, debajo: "charcoal", uso: "texto", modo: "dark" },
];

export function tokensDeCss(css) {
  const tokens = {};
  for (const m of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) tokens[m[1]] = m[2];
  return tokens;
}

const canal = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

export function luminancia(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

export function ratio(fgHex, bgHex) {
  const x = luminancia(fgHex);
  const y = luminancia(bgHex);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Mezcla lineal por canal en sRGB con redondeo a entero, como hace el navegador
// con color-mix: fondo `fgHex` con opacidad `alfa` sobre `debajoHex`.
export function mezclar(fgHex, alfa, debajoHex) {
  const f = parseInt(fgHex.slice(1), 16);
  const d = parseInt(debajoHex.slice(1), 16);
  const canales = [16, 8, 0].map((shift) =>
    Math.round(((f >> shift) & 255) * alfa + ((d >> shift) & 255) * (1 - alfa)),
  );
  return "#" + canales.map((c) => c.toString(16).padStart(2, "0")).join("");
}

export function evaluar(pairs, tokens) {
  return pairs.map((p) => {
    const fgHex = tokens[p.fg] ?? null;
    const bgBase = tokens[p.bg] ?? null;
    // debajo admite token o hex literal (el #000000 del color-mix del hover CTA).
    const debajoHex =
      p.debajo === undefined
        ? null
        : String(p.debajo).startsWith("#")
          ? String(p.debajo)
          : (tokens[p.debajo] ?? null);
    const bgHex =
      bgBase && p.alfa !== undefined
        ? debajoHex
          ? mezclar(bgBase, p.alfa, debajoHex)
          : null
        : bgBase;
    const umbral = UMBRALES[p.uso];
    if (!fgHex || !bgHex) return { ...p, fgHex, bgHex, valor: null, umbral, resultado: "FAIL" };
    const valor = ratio(fgHex, bgHex);
    return { ...p, fgHex, bgHex, valor, umbral, resultado: valor >= umbral ? "PASS" : "FAIL" };
  });
}

export function renderMd(filas) {
  const lineas = [
    "<!-- Generado por `node scripts/check-contrast.mjs --md`. No editar a mano. -->",
    "",
    "# Contraste AA por par (SPEC-UI-00 T-UI-05)",
    "",
    "| Par | Modo | FG | BG | Uso | Valor | Umbral | Resultado |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const f of filas) {
    const valor = f.valor === null ? "ausente" : `${f.valor.toFixed(2)}:1`;
    lineas.push(`| ${f.nombre} | ${f.modo} | ${f.fgHex ?? "—"} | ${f.bgHex ?? "—"} | ${f.uso} | ${valor} | ${f.umbral} | ${f.resultado} |`);
  }
  return `${lineas.join("\n")}\n`;
}
