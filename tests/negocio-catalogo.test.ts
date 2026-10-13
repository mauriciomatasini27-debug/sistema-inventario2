import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CATALOGO_VALIDADO,
  listarAddons,
  mencionaOdoo,
  validarPropuesta,
} from "../src/modules/negocio/catalogo.js";

const ROOT = process.cwd();

describe("N1 negocio NEG-S1/S3 (PRD-NEG-01, AT1)", () => {
  it("NEG-S1: marketing y business.ts no nombran Odoo (detector sí lo detecta)", () => {
    const comercial = [
      readFileSync(join(ROOT, "src/data/business.ts"), "utf8"),
      "Mostrador 2 cajas, Depósito Inteligente 1 almacén, Ventas, Compras, Fiscal AR con anexo, Contactos, Plataforma",
      "Puente Factura Web y Taller como add-on de 155",
    ].join("\n");
    expect(mencionaOdoo(comercial)).toBe(false);
    expect(mencionaOdoo("Odoo CE 19 más módulos")).toBe(true);
  });

  it("AT1: validados pasan, fuera de catálogo se rechaza", () => {
    expect(validarPropuesta({ modulos: [...CATALOGO_VALIDADO], anexoFiscalFirmado: true })).toEqual({ ok: true });
    for (const fuera of ["eCommerce", "MRP", "CRM", "B2B", "Inventario cuántico"]) {
      const r = validarPropuesta({ modulos: ["Ventas", fuera], anexoFiscalFirmado: true });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fuera).toContain(fuera);
    }
  });

  it("add-ons Puente/Taller a 155 solo con declaración; resto no pasa", () => {
    expect(listarAddons()).toEqual([
      { nombre: "Puente Factura Web", precio: 155 },
      { nombre: "Taller", precio: 155 },
    ]);
    expect(validarPropuesta({ modulos: ["Ventas", "Taller"], addons: ["Taller"], anexoFiscalFirmado: true })).toEqual({
      ok: true,
    });
    const sinDeclarar = validarPropuesta({ modulos: ["Ventas", "Taller"], anexoFiscalFirmado: true });
    expect(sinDeclarar.ok).toBe(false);
  });

  it("Fiscal AR exige anexo firmado", () => {
    expect(validarPropuesta({ modulos: ["Ventas", "Fiscal AR"] }).ok).toBe(false);
    expect(validarPropuesta({ modulos: ["Ventas", "Fiscal AR"], anexoFiscalFirmado: true }).ok).toBe(true);
  });
});
