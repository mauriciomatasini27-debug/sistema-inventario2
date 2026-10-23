import { describe, expect, it, vi } from "vitest";
import { PLANES_EJEMPLO } from "../src/modules/planes/catalogo.js";
import { crearPreaprobacionMercadoPago } from "../src/modules/planes/proveedor.js";
import { solicitarPreaprobacionPlan } from "../src/lib/repos/planes.js";

describe("COBRO-EJEMPLO Mercado Pago", () => {
  it("con plan ejemplo no hace fetch y devuelve preaprobación simulada", async () => {
    const fetchMock = vi.fn();
    const r = await crearPreaprobacionMercadoPago({
      tenantId: "tenant-abc",
      planId: "plus",
      catalogo: PLANES_EJEMPLO,
      fetchImpl: fetchMock,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.modo).toBe("simulado");
    expect(r.preapprovalId).toContain("sim-");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("solicitarPreaprobacionPlan usa el catálogo vivo (ejemplo) sin red", async () => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    const fetchMock = vi.fn(async () => {
      throw new Error("no debería llamarse");
    });
    const r = await solicitarPreaprobacionPlan({
      tenantId: "tenant-xyz",
      planId: "basico",
      fetchImpl: fetchMock,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.modo).toBe("simulado");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
