import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

function paginas(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(RAIZ, dir)).sort()) {
    const rel = `${dir}/${e}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) out.push(...paginas(rel));
    else if (e.endsWith(".astro")) out.push(rel);
  }
  return out;
}

const PAGINAS_CON_FORM = [
  "src/pages/panel/stock.astro",
  "src/pages/panel/caja.astro",
  "src/pages/panel/precios.astro",
  "src/pages/panel/proveedores.astro",
  "src/pages/panel/fiado.astro",
  "src/pages/panel/consumos.astro",
  "src/pages/panel/bot/config.astro",
  "src/pages/alta.astro",
] as const;

describe("T-UI-04: cada formulario del panel y alta usa errores-campo", () => {
  it("las páginas esperadas existen y declaran un formulario", () => {
    for (const p of PAGINAS_CON_FORM) {
      const src = leer(p);
      expect(src, p).toMatch(/<form[\s>]/);
    }
  });

  it("todas importan el helper y lo aplican al enviar", () => {
    for (const p of PAGINAS_CON_FORM) {
      const src = leer(p);
      expect(src, `import en ${p}`).toMatch(/from\s+["'][^"']*lib\/errores-campo(?:-dom)?\.js["']/);
      expect(src, `erroresDesdeZod en ${p}`).toContain("erroresDesdeZod(");
      expect(src, `mostrarErrores en ${p}`).toContain("mostrarErrores(");
      expect(src, `data-campo en ${p}`).toContain("data-campo=");
    }
  });

  it("proveedores marca los campos del pago a proveedor", () => {
    const src = leer("src/pages/panel/proveedores.astro");
    for (const campo of ["supplier_cuit", "monto_centavos", "metodo", "fecha_iso", "creado_por", "factura_id"]) {
      expect(src, campo).toContain(`data-campo="${campo}"`);
    }
  });

  it("ninguna otra página del panel con <form> queda sin el helper", () => {
    const faltantes = paginas("src/pages/panel").filter((p) => {
      const src = leer(p);
      if (!/<form[\s>]/.test(src)) return false;
      return !/lib\/errores-campo/.test(src);
    });
    expect(faltantes).toEqual([]);
  });
});
