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
  { nombre: "CTA llama dark", fg: "void", bg: "star-warm", uso: "grande", modo: "dark" },
  { nombre: "CTA hover dark", fg: "void", bg: "star-glow", uso: "grande", modo: "dark" },
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

export function evaluar(pairs, tokens) {
  return pairs.map((p) => {
    const fgHex = tokens[p.fg] ?? null;
    const bgHex = tokens[p.bg] ?? null;
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
