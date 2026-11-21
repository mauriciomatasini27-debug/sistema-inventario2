// P10-25: extrae comentarios con scanner de TypeScript 7 (adaptador) y regex astro.
import {
  LanguageVariant,
  SyntaxKind,
  computeLineStarts,
  createScanner,
  forEachLeadingCommentRange,
  forEachTrailingCommentRange,
} from "./comentarios-typescript-scanner.mjs";

const EXT_TS = new Set([".ts", ".tsx", ".js", ".mjs", ".jsx", ".cjs"]);
const SCRIPT_FENCE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function lineaDe(texto, pos, offsetLinea = 0) {
  const starts = computeLineStarts(texto);
  let linea = 0;
  for (let i = starts.length - 1; i >= 0; i--) {
    if (starts[i] <= pos) {
      linea = i;
      break;
    }
  }
  return linea + 1 + offsetLinea;
}

function claseDeComentario(frag, kind) {
  if (kind === SyntaxKind.SingleLineCommentTrivia) return "line";
  if (frag.startsWith("/**")) return "jsdoc";
  return "block";
}

/**
 * @param {string} texto
 * @param {string} nombreArchivo
 * @param {number} offsetLinea
 */
export function comentariosDeTypescript(texto, nombreArchivo, offsetLinea = 0) {
  const jsx = nombreArchivo.endsWith(".tsx") || nombreArchivo.endsWith(".jsx");
  const variant = jsx ? LanguageVariant.JSX : LanguageVariant.Standard;
  const scanner = createScanner(true, variant, texto);
  /** @type {Map<string, { linea: number, texto: string, kind: string, clave: string }>} */
  const porClave = new Map();

  function empujar(pos, end, kind) {
    const frag = texto.slice(pos, end);
    const tipo = claseDeComentario(frag, kind);
    const linea = lineaDe(texto, pos, offsetLinea);
    const clave = `${tipo}:${linea}:${frag.replace(/\s+/g, " ").trim()}`;
    if (!porClave.has(clave)) porClave.set(clave, { linea, texto: frag, kind: tipo, clave });
  }

  let ultimoFin = -1;
  let pasos = 0;
  const tope = Math.max(texto.length * 4, 8);
  while (scanner.scan() !== SyntaxKind.EndOfFile) {
    const full = scanner.getTokenFullStart();
    const end = scanner.getTokenEnd();
    if (end <= ultimoFin || ++pasos > tope) break;
    ultimoFin = end;
    forEachLeadingCommentRange(texto, full, (p, fin, kind) => {
      empujar(p, fin, kind);
    });
    forEachTrailingCommentRange(texto, end, (p, fin, kind) => {
      empujar(p, fin, kind);
    });
  }
  forEachLeadingCommentRange(texto, texto.length, () => {});

  return [...porClave.values()];
}

/**
 * @param {string} texto
 * @param {string} path
 */
export function comentariosDeArchivo(texto, path) {
  if (!texto) return [];
  if (path.endsWith(".astro")) {
    /** @type {{ linea: number, texto: string, kind: string, clave: string }[]} */
    const out = [];
    const lineas = texto.split("\n");
    for (let i = 0; i < lineas.length; i++) {
      const ln = lineas[i];
      const linea = i + 1;
      const html = ln.match(/<!--([\s\S]*?)-->/);
      if (html) {
        const clave = `html:${linea}:${html[1].trim()}`;
        out.push({ linea, texto: `<!--${html[1]}-->`, kind: "html", clave });
      }
      const jsx = ln.match(/\{\/\*([\s\S]*?)\*\/\}/);
      if (jsx) {
        const clave = `jsx:${linea}:${jsx[1].trim()}`;
        out.push({ linea, texto: `{/*${jsx[1]}*/}`, kind: "block", clave });
      }
    }
    let m;
    const re = new RegExp(SCRIPT_FENCE.source, "gi");
    while ((m = re.exec(texto)) !== null) {
      const cuerpo = m[2] ?? "";
      const antes = texto.slice(0, m.index);
      const offset = antes.split("\n").length - 1;
      out.push(...comentariosDeTypescript(cuerpo, `${path}__script.ts`, offset));
    }
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(texto);
    if (fm?.[1]) {
      const offset = texto.slice(0, fm.index).split("\n").length;
      out.push(...comentariosDeTypescript(fm[1], `${path}__front.ts`, offset));
    }
    return out;
  }
  const ext = path.slice(path.lastIndexOf("."));
  if (EXT_TS.has(ext)) {
    return comentariosDeTypescript(texto, path, 0);
  }
  return [];
}

function claveEstable(c) {
  return `${c.kind}:${c.texto.replace(/\s+/g, " ").trim()}`;
}

export function clavesComentarios(texto, path) {
  return new Set(comentariosDeArchivo(texto, path).map(claveEstable));
}

export function comentariosNuevos(textoNuevo, textoViejo, path) {
  const viejas = clavesComentarios(textoViejo ?? "", path);
  return comentariosDeArchivo(textoNuevo, path).filter((c) => !viejas.has(claveEstable(c)));
}

/** Agrupa comentarios `//` contiguos en bloques para id/clase. */
export function agruparBloquesLinea(comentarios) {
  const lineales = comentarios.filter((c) => c.kind === "line").sort((a, b) => a.linea - b.linea);
  /** @type {{ ultima: number, lineas: { linea: number, cuerpo: string, texto: string }[] }[]} */
  const bloques = [];
  let actual = null;
  for (const c of lineales) {
    const cuerpo = c.texto.replace(/^\s*\/\/\s?/, "");
    if (actual && c.linea === actual.ultima + 1) {
      actual.lineas.push({ linea: c.linea, cuerpo, texto: c.texto });
      actual.ultima = c.linea;
    } else {
      actual = { ultima: c.linea, lineas: [{ linea: c.linea, cuerpo, texto: c.texto }] };
      bloques.push(actual);
    }
  }
  return bloques;
}