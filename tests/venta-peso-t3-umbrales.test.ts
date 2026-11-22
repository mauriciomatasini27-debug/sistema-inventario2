import { describe, expect, it } from "vitest";
import { ejecutar_alertas_stock, limpiar_claves_alertas } from "../src/jobs/alertas-stock.js";
import { umbralEnGramos } from "../src/modules/alertas/stock-bajo.js";

describe("T3 #387 umbral de stock bajo por peso interpretado en gramos", () => {
  it("el mínimo de un producto por peso se lee como gramos enteros", () => {
    expect(umbralEnGramos(1500)).toBe(1500);
    expect(umbralEnGramos(1)).toBe(1);
    expect(umbralEnGramos(999)).toBe(999);
  });

  it("sin mínimo no se deriva un umbral en gramos desde un conteo de ventas", () => {
    expect(umbralEnGramos(null)).toBeNull();
    expect(umbralEnGramos(0)).toBeNull();
    expect(umbralEnGramos(undefined)).toBeNull();
  });

  it("un mínimo fuera del rango de gramos no es un umbral válido", () => {
    expect(umbralEnGramos(-5)).toBeNull();
    expect(umbralEnGramos(1_000_001)).toBeNull();
    expect(umbralEnGramos(1.5)).toBeNull();
  });

  it("el job compara el stock en gramos contra el umbral en gramos", async () => {
    limpiar_claves_alertas();
    const base = {
      tenantId: "t-t3-umbral",
      fecha: "2026-11-21",
      modo: "matutino" as const,
      destinatarios: [{ googleSub: "d1", rol: "dueno" as const, canales: ["email"] as Array<"whatsapp" | "email"> }],
      yaEnviados: new Set<string>(),
      enviarWa: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    };
    const conPoco = await ejecutar_alertas_stock({
      ...base,
      catalogo: [
        { sku: "KG", nombre: "Papas", stock: 1400, minimo: 1500, ventas7d: 0, porPeso: true, proveedor: null },
      ],
    });
    expect(conPoco.alertas.map((a) => ({ sku: a.sku, stock: a.stock, umbral: a.umbral }))).toEqual([
      { sku: "KG", stock: 1400, umbral: 1500 },
    ]);

    limpiar_claves_alertas();
    const conSuficiente = await ejecutar_alertas_stock({
      ...base,
      catalogo: [
        { sku: "KG", nombre: "Papas", stock: 1600, minimo: 1500, ventas7d: 0, porPeso: true, proveedor: null },
      ],
    });
    expect(conSuficiente.alertas).toHaveLength(0);
  });

  it("un producto por peso sin mínimo no alerta aunque haya ventas 7d en unidades", async () => {
    limpiar_claves_alertas();
    const r = await ejecutar_alertas_stock({
      tenantId: "t-t3-umbral",
      fecha: "2026-11-21",
      modo: "matutino",
      catalogo: [{ sku: "KG", nombre: "Papas", stock: 100, minimo: null, ventas7d: 14, porPeso: true, proveedor: null }],
      destinatarios: [{ googleSub: "d1", rol: "dueno" as const, canales: ["email"] as Array<"whatsapp" | "email"> }],
      yaEnviados: new Set<string>(),
      enviarWa: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    });
    expect(r.alertas).toHaveLength(0);
  });

  it("los productos por unidad conservan el umbral efectivo de siempre", async () => {
    limpiar_claves_alertas();
    const r = await ejecutar_alertas_stock({
      tenantId: "t-t3-umbral",
      fecha: "2026-11-21",
      modo: "matutino",
      catalogo: [{ sku: "U", nombre: "Yerba", stock: 2, minimo: 5, ventas7d: 0, porPeso: false, proveedor: null }],
      destinatarios: [{ googleSub: "d1", rol: "dueno" as const, canales: ["email"] as Array<"whatsapp" | "email"> }],
      yaEnviados: new Set<string>(),
      enviarWa: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    });
    expect(r.alertas.map((a) => a.umbral)).toEqual([5]);
  });
});
