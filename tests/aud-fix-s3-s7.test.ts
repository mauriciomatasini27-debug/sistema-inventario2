import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { POST as postMovement } from "../src/pages/api/cash/movements.js";
import { GET as getHistory } from "../src/pages/api/cash/history.js";
import { GET as getProducts, POST as postProduct } from "../src/pages/api/products.js";
import { reiniciarAltaCatalogo } from "./helpers/alta-catalogo.js";
import { enriquecer_vista_wizard, wizard_inicial } from "../src/modules/fiscal/wizard.js";

function modoSingleSinDb(): void {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

beforeEach(() => {
  modoSingleSinDb();
  resetStore();
  reiniciarAltaCatalogo();
});

describe("AUD-FIX-S3..S7: campos huérfanos", () => {
  it("#476: la nota de un movimiento de caja vuelve del payload y del historial", async () => {
    const key = `aud476-${Date.now()}`;
    const r = (await postMovement(
      ctx("http://x/api/cash/movements", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: {
          tipo: "ingreso",
          metodo: "Efectivo",
          categoria_id: "general",
          origen: "devolucion",
          monto_centavos: 1000,
          nota: "ajuste de arqueo",
          device_code: "caja-01",
          seq_local: 1,
          client_occurred_at: new Date().toISOString(),
        },
      }),
    )) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as { nota?: string }).nota).toBe("ajuste de arqueo");

    const h = (await getHistory(ctx("http://x/api/cash/history"))) as Response;
    const jh = (await h.json()) as { items: Array<{ idempotency_key: string; nota?: string }> };
    expect(jh.items.find((m) => m.idempotency_key === key)?.nota).toBe("ajuste de arqueo");
  });

  it("#477: controla_vencimiento del alta vuelve en la ficha HTTP", async () => {
    const r = (await postProduct(
      ctx("http://x/api/products", {
        body: { sku: "AUD-477", nombre: "Leche", precio_centavos: 100, controla_vencimiento: true },
      }),
    )) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as { controla_vencimiento: boolean }).controla_vencimiento).toBe(true);

    const g = (await getProducts(ctx("http://x/api/products?q=AUD-477"))) as Response;
    const jg = (await g.json()) as { productos: Array<{ sku: string; controla_vencimiento: boolean }> };
    expect(jg.productos.find((p) => p.sku === "AUD-477")?.controla_vencimiento).toBe(true);
  });

  it("#478: permisos[] ya no forma parte del schema de alta", () => {
    expect(readFileSync("src/pages/api/products.ts", "utf8")).not.toContain("permisos: z.array");
  });

  it("#480: el modo de primera factura vive en el estado del wizard", () => {
    expect(wizard_inicial().modoPrimeraFactura).toBeNull();
    const vista = enriquecer_vista_wizard("tenant-modo", { ...wizard_inicial(), modoPrimeraFactura: "prueba_nc" });
    expect(vista.modo_primera_factura).toBe("prueba_nc");
  });
});
