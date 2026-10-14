import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RX_COMENTARIO =
  /no hay tabla|sin tabla|no existen?( aún| todavía)?|todavía no hay/i;
const VENTANA = 40;

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (p.endsWith(".ts") || p.endsWith(".astro")) out.push(p);
  }
  return out;
}

function tablas(): Set<string> {
  const nombres = new Set<string>();
  for (const f of archivos(join("src", "db"))) {
    if (!/schema.*\.ts$/.test(f)) continue;
    const texto = readFileSync(f, "utf8");
    for (const m of texto.matchAll(/pgTable\(\s*"([^"]+)"/g)) {
      nombres.add(m[1] ?? "");
    }
  }
  return nombres;
}

function dirsModulos(): Set<string> {
  const nombres = new Set<string>();
  for (const e of readdirSync(join("src", "modules"))) {
    if (statSync(join("src", "modules", e)).isDirectory()) nombres.add(e);
  }
  return nombres;
}

export function esComentario(linea: string, indice: number): boolean {
  const marcaLinea = linea.indexOf("//");
  if (marcaLinea >= 0 && marcaLinea < indice) return true;
  const abre = linea.indexOf("/*");
  const cierra = linea.indexOf("*/");
  if (abre >= 0 && abre < indice && (cierra < 0 || cierra > indice)) return true;
  if (linea.trimStart().startsWith("*")) return true;
  return false;
}

export function candidatos(
  linea: string,
  indice: number,
  tablasReales?: Set<string>,
  modulos?: Set<string>,
): string[] {
  const inicio = Math.max(0, indice - VENTANA);
  const ventana = linea.slice(inicio, indice + VENTANA);
  const out = new Map<string, "ruta" | "nombre">();
  for (const m of ventana.matchAll(/`([^`]+)`/g)) {
    const id = (m[1] ?? "").trim().split(/[^A-Za-z0-9_/.~-]+/)[0] ?? "";
    if (id !== "") out.set(id, "nombre");
  }
  for (const m of ventana.matchAll(/[A-Za-z][A-Za-z0-9_]*(?:\/[A-Za-z0-9_.-]+)+/g)) {
    out.set(m[0], "ruta");
  }
  const sinRutas = ventana.replace(/[A-Za-z][A-Za-z0-9_]*(?:\/[A-Za-z0-9_.-]+)+/g, " ");
  for (const m of sinRutas.matchAll(/[a-z][a-z0-9]*_[a-z0-9_]+/g)) {
    out.set(m[0], "nombre");
  }
  if (tablasReales && modulos) {
    for (const m of sinRutas.matchAll(/\b([A-Za-z][A-Za-z0-9_-]{2,})\b/g)) {
      const palabra = m[1] ?? "";
      if (tablasReales.has(palabra) || modulos.has(palabra)) out.set(palabra, "nombre");
    }
  }
  return [...out.entries()].map(([id, tipo]) => (tipo === "ruta" ? `ruta:${id}` : id));
}

export function existeRutaRelativaSrc(ruta: string): boolean {
  return (
    existsSync(join("src", ruta)) ||
    existsSync(join("src", `${ruta}.ts`)) ||
    existsSync(join("src", `${ruta}.astro`))
  );
}

export function existeNombre(nombre: string, tablasReales: Set<string>, modulos: Set<string>): boolean {
  const base = nombre.split("/").pop() ?? nombre;
  return tablasReales.has(nombre) || tablasReales.has(base) || modulos.has(base);
}

describe("E3 sin comentarios falsos de tabla o módulo", () => {
  it("ningún comentario nombra algo que sí existe", () => {
    const tablasReales = tablas();
    const modulos = dirsModulos();
    const mal: string[] = [];
    for (const f of archivos(join("src"))) {
      const normalizado = f.replace(/\\/g, "/");
      const lineas = readFileSync(f, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        const m = RX_COMENTARIO.exec(linea);
        if (!m || !esComentario(linea, m.index)) return;
        for (const c of candidatos(linea, m.index, tablasReales, modulos)) {
          if (c.startsWith("ruta:")) {
            const ruta = c.slice(5);
            if (existeRutaRelativaSrc(ruta)) {
              mal.push(`${normalizado}:${i + 1}: la ruta "${ruta}" existe bajo src/ pero el comentario dice que no: ${linea.trim()}`);
            }
          } else if (existeNombre(c, tablasReales, modulos)) {
            const esTabla = tablasReales.has(c) || tablasReales.has(c.split("/").pop() ?? c);
            mal.push(
              `${normalizado}:${i + 1}: ${esTabla ? "la tabla" : "el módulo"} "${c}" existe pero el comentario dice que no: ${linea.trim()}`,
            );
          }
        }
      });
    }
    expect(
      mal,
      mal.length > 0
        ? `Comentarios falsos: borrá el comentario o hacelo verdadero (no hay allowlist):\n${mal.join("\n")}`
        : "",
    ).toEqual([]);
  });
});
