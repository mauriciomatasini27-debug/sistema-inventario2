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

// P1-59: si el cobro offline deja de avisar con el stock proyectado, este test falla.
describe("venta.astro: aviso de stock local en cero", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("después de encolar avisa si el proyectado queda en 0 y el cobro sigue", () => {
    const s = src();
    expect(s).toContain('import { avisoStockLocalAgotado, stockLocal } from "../offline/stock-local.js"');
    expect(s).toContain("El stock registrado de este producto ya estaba en 0");
    expect(s).toMatch(/storage\.setItem\(outboxKey[\s\S]*avisoStockLocalAgotado\(stockLocal\(/);
    expect(s).toMatch(/estado\("offline provisorio " \+ vuelo\.ticketBase\.provisorio \+ " encolado " \+ vuelo\.op_id \+ avisoAgotado\)/);
  });
});

describe("venta.astro: aviso de mora sin frenar Cobrar", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("suma los días al saldo y suelta el cobro si el servidor responde MORA", () => {
    const s = src();
    expect(s).toContain("Este cliente no está en la ficha.");
    expect(s).toContain('Saldo " + saldo + ". Sin tope.');
    expect(s).toContain('Saldo " + saldo + ". Disponible "');
    expect(s).toContain('" En mora: " + dias + " días con saldo."');
    expect(s).toMatch(/j\.codigo === "MORA"[\s\S]{0,180}cobroEnVuelo = null/);
    expect(s).toMatch(/j\.codigo === "MORA"[\s\S]{0,220}estado\(j\.error/);
  });

  it("CONFIRMACION_EXCESO pregunta antes de soltar el vuelo y reintenta la misma clave", () => {
    const s = src();
    const marca = s.indexOf('j.codigo === "CONFIRMACION_EXCESO"');
    const tope = s.indexOf('j.codigo === "TOPE_SUPERADO"');
    expect(marca).toBeGreaterThan(0);
    expect(tope).toBeGreaterThan(marca);
    const bloque = s.slice(marca, tope);
    const pregunta = bloque.indexOf("confirmar(");
    const suelta = bloque.indexOf("cobroEnVuelo = null");
    expect(pregunta).toBeGreaterThan(-1);
    expect(suelta).toBeGreaterThan(pregunta);
    expect(bloque).toContain("confirmado_exceso: true");
    expect(s).toContain('import { confirmar } from "../lib/confirmar-dom.js"');
    expect(s).toContain("<ConfirmDialog");
  });
});
