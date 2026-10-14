import { beforeEach, describe, expect, it } from "vitest";
import { conTenant } from "../src/lib/tenant-mode.js";
import { resetStore } from "../src/lib/store.js";
import { BaseNoDisponible } from "../src/lib/server-db.js";
import { crearAlmacenAjustes } from "../src/lib/repos/_almacen.js";
import { crearAjuste, type Ajuste } from "../src/modules/pricing/precios.js";

function ajusteFalso(key: string): Ajuste {
  return Object.freeze({
    id: `aj-${key}`,
    idempotencyKey: key,
    direccion: "suba" as const,
    porcentaje: 10,
    pasoCentavos: 100n,
    vigenciaTipo: "ahora" as const,
    aplicaEn: null,
    estado: "pendiente" as const,
    creadoPor: "dueno-1",
    creadoEn: "2026-10-10T12:00:00.000Z",
    items: Object.freeze([{ sku: "demo-sku-1", vigenteCentavos: 15000n, costoCentavos: 0n }]),
  });
}

describe("ARQ-S4 Almacen de ajustes (corte 1)", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    resetStore();
  });

  it("memoria: guardar luego obtener y contiene, ausente es undefined", () => {
    const almacen = crearAlmacenAjustes();
    expect(almacen.obtener("k-1")).toBeUndefined();
    expect(almacen.contiene("k-1")).toBe(false);
    const a = ajusteFalso("k-1");
    almacen.guardar("k-1", a);
    expect(almacen.obtener("k-1")).toBe(a);
    expect(almacen.contiene("k-1")).toBe(true);
  });

  it("la vista de solo lectura alimenta la idempotencia de crearAjuste", () => {
    const almacen = crearAlmacenAjustes();
    almacen.guardar("k-2", ajusteFalso("k-2"));
    const r = crearAjuste({
      idempotencyKey: "k-2",
      direccion: "suba",
      porcentaje: 10,
      vigenciaTipo: "ahora",
      aplicaEn: null,
      confirmado: true,
      online: true,
      rol: "dueno",
      creadoPor: "dueno-1",
      ahoraIso: "2026-10-10T12:00:00.000Z",
      items: [],
      vistos: almacen.comoMapaSoloLectura(),
    });
    expect(r).toMatchObject({ status: 409 });
  });

  it("single: el fallo de persistencia no lanza y deja guardar en memoria", () => {
    const almacen = crearAlmacenAjustes();
    expect(() => almacen.anteFalloPersistencia(new Error("caida"))).not.toThrow();
    const a = ajusteFalso("k-3");
    almacen.guardar("k-3", a);
    expect(almacen.obtener("k-3")).toBe(a);
  });

  it("multi: el fallo de persistencia lanza BaseNoDisponible", () => {
    process.env.TENANT_MODE = "multi";
    try {
      const almacen = conTenant("tenant-a", () => crearAlmacenAjustes());
      expect(() => almacen.anteFalloPersistencia(new Error("caida"))).toThrow(BaseNoDisponible);
    } finally {
      delete process.env.TENANT_MODE;
    }
  });
});
