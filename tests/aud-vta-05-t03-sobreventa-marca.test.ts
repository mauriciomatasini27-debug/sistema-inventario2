import { beforeEach, describe, expect, it } from "vitest";
import { listarMovimientos } from "../src/lib/repos/stock.js";
import { resetStore, store } from "../src/lib/store.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";

const MARCA_SOBREVENTA = "sobreventa";

describe("AUD-VTA-05 T03 la sobreventa queda marcada en el Historial de memoria", () => {
  beforeEach(() => {
    resetStore();
    delete process.env.TENANT_MODE;
    delete process.env.DEFAULT_TENANT_ID;
    delete process.env.TENANT_DATABASE_URL;
  });

  it("marca el movimiento, mantiene el tipo VENTA y no baja el Stock disponible", async () => {
    const sku = "SOBREV-MEM";
    store.stock.set(sku, 3);
    const r = await registrar_venta({
      key: `t03-mem-${crypto.randomUUID()}`,
      lineas: [{ product_id: sku, qty: 5, precio_centavos: 1000 }],
      medio: "Efectivo",
      deviceCode: "t03-mem",
      seqLocal: 1,
      offline: true,
      clientOccurredAt: new Date("2026-11-06T15:00:00.000Z").toISOString(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("la venta falló");
    expect(r.venta.fuente).toBe("memoria");
    expect(r.venta.efecto.ticket.sobreventa).toBe(true);

    const movs = (await listarMovimientos()).filter((m) => m.sku === sku);
    expect(movs.map((m) => m.motivo)).toEqual([MARCA_SOBREVENTA]);
    expect(movs.map((m) => m.tipo)).toEqual(["VENTA"]);
    expect(store.stock.get(sku)).toBe(3);
  });
});
