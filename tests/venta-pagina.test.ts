import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

describe("venta.astro: el script principal se empaqueta", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("ningún <script> usa define:vars ni is:inline (rompen los imports)", () => {
    const tags = [...src().matchAll(/<script[^>]*>/g)].map((m) => m[0]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag).not.toContain("define:vars");
      expect(tag).not.toContain("is:inline");
    }
  });

  it("el tenant va en un data-tenant que el script lee con dataset", () => {
    const s = src();
    expect(s).toMatch(/data-tenant=\{tenantId/);
    expect(s).toContain(".dataset.tenant");
  });
});

// P1-56: si Cobrar vuelve a armar lineas: [linea] desde el formulario, este test falla.
describe("venta.astro: carrito multiproducto y ticket local", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("Cobrar arma el POST desde el carrito, no desde una sola línea del formulario", () => {
    const s = src();
    expect(s).toContain('import { fusionarLinea, armarCobroDesdeCarrito }');
    expect(s).toContain("armarCobroDesdeCarrito({");
    expect(s).toMatch(/body:\s*JSON\.stringify\(vuelo\.payload\)/);
    expect(s).not.toMatch(/lineas:\s*\[\s*linea\s*\]/);
    expect(s).toContain('id="lista-carrito"');
    expect(s).toContain('id="tarjeta-ticket"');
    expect(s).toContain("DOCUMENTO NO VÁLIDO COMO FACTURA");
    expect(s).toMatch(/@media print[\s\S]*#tarjeta-ticket/);
    expect(s).toContain("aplicarTicketDefinitivoSiVisible");
    expect(s).toContain("construir_resumen_ticket");
    expect(s).toContain("construir_wa_me_url");
  });
});
