import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { dondeTenant, tenantIdShared } from "../src/lib/tenant-scope.js";
import { products } from "../src/db/schema.js";
import { altaProducto, listarProductos } from "../src/lib/repos/catalogo.js";

const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
const prev: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  resetStore();
  for (const k of ENV_KEYS) prev[k] = process.env[k];
  process.env.TENANT_MODE = "shared";
  delete process.env.TENANT_DATABASE_URL;
  delete process.env.CONTROL_DATABASE_URL;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = prev[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetStore();
});

describe("ADR-0116 C3 filtros shared en catálogo (memoria)", () => {
  it("tenantIdShared exige contexto en shared", () => {
    expect(() => tenantIdShared()).toThrow(/Falta tenant/);
    expect(conTenant("aaa", () => tenantIdShared())).toBe("aaa");
  });

  it("dondeTenant solo agrega eq en shared", () => {
    process.env.TENANT_MODE = "single";
    expect(dondeTenant(products.tenantId)).toBeUndefined();
    process.env.TENANT_MODE = "shared";
    const w = conTenant("tenant-a", () => dondeTenant(products.tenantId));
    expect(w).toBeTruthy();
  });

  it("mismo SKU en A y B: cada listarProductos solo ve el suyo", async () => {
    await conTenant("tenant-a", () =>
      altaProducto({
        sku: "SKU-X",
        nombre: "De A",
        precioCentavos: 100,
        sector: "general",
        controlaVencimiento: false,
      }),
    );
    await conTenant("tenant-b", () =>
      altaProducto({
        sku: "SKU-X",
        nombre: "De B",
        precioCentavos: 200,
        sector: "general",
        controlaVencimiento: false,
      }),
    );
    const listaA = await conTenant("tenant-a", () => listarProductos(""));
    const listaB = await conTenant("tenant-b", () => listarProductos(""));
    const nombresA = listaA.fichas.filter((f) => f.sku === "SKU-X").map((f) => f.nombre);
    const nombresB = listaB.fichas.filter((f) => f.sku === "SKU-X").map((f) => f.nombre);
    expect(nombresA).toEqual(["De A"]);
    expect(nombresB).toEqual(["De B"]);
  });
});
