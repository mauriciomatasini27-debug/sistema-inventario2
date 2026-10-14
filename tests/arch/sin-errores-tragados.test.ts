import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RX_VACIO = /\bcatch\s*(?:\(\s*[a-zA-Z_$][\w$]*\s*\))?\s*\{\s*\}/;
const RX_FLECHA =
  /\.catch\s*\(\s*(?:\(\s*\)|[a-zA-Z_$][\w$]*|\(\s*[a-zA-Z_$][\w$]*\s*\))\s*=>\s*(null|undefined|false|\{\}|\(\{\}\))\s*\)/;
const RX_FUNCION = /\.catch\s*\(\s*function\s*\([^)]*\)\s*\{\s*\}\s*\)/;

const PERMITIDOS: ReadonlySet<string> = new Set<string>([]);

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (p.endsWith(".ts") || p.endsWith(".astro")) out.push(p);
  }
  return out;
}

export function clave(archivo: string, linea: string): string {
  return `${archivo} :: ${linea.trim()}`;
}

export function esErrorTragado(linea: string): boolean {
  return RX_VACIO.test(linea) || RX_FLECHA.test(linea) || RX_FUNCION.test(linea);
}

describe("E7 sin errores tragados nuevos", () => {
  it("todo catch vacío o .catch que traga queda en la lista explícita", () => {
    const nuevos: string[] = [];
    for (const f of archivos(join("src"))) {
      const normalizado = f.replace(/\\/g, "/");
      const lineas = readFileSync(f, "utf8").split("\n");
      for (const linea of lineas) {
        if (esErrorTragado(linea) && !PERMITIDOS.has(clave(normalizado, linea))) {
          nuevos.push(clave(normalizado, linea));
        }
      }
    }
    expect(
      nuevos,
      nuevos.length > 0
        ? `Errores tragados nuevos (${nuevos.length}). Registrá el error (log) o relanzalo; una excepción necesita ADR:\n${nuevos.join("\n")}`
        : "",
    ).toEqual([]);
  });

  it("la lista explícita tiene el tamaño esperado", () => {
    expect(PERMITIDOS.size).toBe(0);
  });
});
