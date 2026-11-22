import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { altaProducto } from "../src/lib/repos/catalogo.js";
import { aplicarMovimiento } from "../src/lib/repos/stock.js";
import { GET } from "../src/pages/api/products.js";

describe("STOCK-R8: /api/products?panel=1 sirve Stock disponible derivado", () => {
  beforeEach(() => {
    resetStore();
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
  });

  it("deriva del Historial, ignora la sobreventa y calcula los KPIs", async () => {
    const alta = await altaProducto({
      sku: "PAN-1",
      nombre: "Yerba",
      precioCentavos: 100,
      sector: "general",
      controlaVencimiento: false,
      minStock: 5,
    });
    expect(alta.ok).toBe(true);
    await aplicarMovimiento({ idemKey: "pan-alta", sku: "PAN-1", loteId: null, delta: 2, tipo: "ALTA" });
    await aplicarMovimiento({
      idemKey: "pan-sobreventa",
      sku: "PAN-1",
      loteId: null,
      delta: -1,
      tipo: "VENTA",
      motivo: "sobreventa",
      bajarCantidades: false,
    });

    const r = (await GET(ctx("http://x/api/products?panel=1"))) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as {
      productos: Array<{ sku: string; stock_disponible: number | null }>;
      kpis: { bajo_minimo: number; sin_verificar: number; total: number; con_minimo: number };
    };
    expect(j.productos.find((p) => p.sku === "PAN-1")?.stock_disponible).toBe(2);
    expect(j.kpis).toEqual({ bajo_minimo: 1, sin_verificar: 0, total: 1, con_minimo: 1 });
  });

  it("sin panel=1 el contrato existente no cambia", async () => {
    const r = (await GET(ctx("http://x/api/products"))) as Response;
    const j = (await r.json()) as { productos: unknown[]; kpis?: unknown };
    expect(j.kpis).toBeUndefined();
    expect(j.productos).toBeDefined();
  });
});
