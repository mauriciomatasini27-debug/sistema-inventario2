import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { POST as POSTIngreso } from "../src/pages/api/stock/ingreso.js";
import { GET as GETLots } from "../src/pages/api/lots.js";
import { POST as POSTProducts } from "../src/pages/api/products.js";
import { invarianteStockLotesMovs } from "../src/lib/repos/lotes.js";
import { listarMovimientos, nivelStock } from "../src/lib/repos/stock.js";

beforeEach(() => resetStore());

describe("CAT-S3 ingreso /api/stock/ingreso + FEFO invariante", () => {
  it("ingreso 201 con cantidadRestante", async () => {
    const vence = new Date(Date.now() + 5 * 86400_000).toISOString();
    const r = (await POSTIngreso(ctx("http://x/api/stock/ingreso", { body: { sku: "ING-1", cantidad: 4, vence_el: vence } }))) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as { sku: string; cantidadRestante: number };
    expect(j.sku).toBe("ING-1");
    expect(j.cantidadRestante).toBe(4);
  });

  it("controla_vencimiento sin fecha 422", async () => {
    const r = (await POSTIngreso(ctx("http://x/api/stock/ingreso", { body: { sku: "ING-2", cantidad: 1, controla_vencimiento: true } }))) as Response;
    expect(r.status).toBe(422);
    const j = (await r.json()) as { error: string };
    expect(j.error).toMatch(/controla_vencimiento|vence_el/);
  });

  it("ficha con controla_vencimiento fuerza 422 aunque el ingreso omita el flag", async () => {
    const alta = (await POSTProducts(
      ctx("http://x/api/products", { body: { sku: "ING-3", nombre: "Leche", precio_centavos: 100, codigo: "779001", controla_vencimiento: true } }),
    )) as Response;
    expect(alta.status).toBe(201);
    const r = (await POSTIngreso(ctx("http://x/api/stock/ingreso", { body: { sku: "ING-3", cantidad: 2 } }))) as Response;
    expect(r.status).toBe(422);
    const j = (await r.json()) as { error: string };
    expect(j.error).toMatch(/controla_vencimiento|vence_el/);
  });

  it("stock = suma lotes = suma movs (7)", async () => {
    const vence = new Date(Date.now() + 5 * 86400_000).toISOString();
    const r = (await POSTIngreso(ctx("http://x/api/stock/ingreso", { body: { sku: "ING-4", cantidad: 7, vence_el: vence } }))) as Response;
    expect(r.status).toBe(201);
    const g = (await GETLots(ctx("http://x/api/lots?sku=ING-4"))) as Response;
    const lotes = (await g.json()) as { lotes: Array<{ cantidadRestante: number }> };
    const sumaLotes = lotes.lotes.reduce((a, l) => a + l.cantidadRestante, 0);
    expect(sumaLotes).toBe(7);
    const movs = await listarMovimientos();
    const sumaMovs = movs.filter((m) => m.sku === "ING-4" && m.tipo === "ALTA").reduce((a, m) => a + m.delta, 0);
    expect(sumaMovs).toBe(7);
    const stock = nivelStock("ING-4");
    expect(stock).toBe(7);
    expect(invarianteStockLotesMovs({ stockActual: stock, lotesCantidadRestante: sumaLotes, movsDeltaSum: sumaMovs })).toBe(true);
  });

  it("idempotencia: misma key dos veces 409", async () => {
    const vence = new Date(Date.now() + 5 * 86400_000).toISOString();
    const key = crypto.randomUUID();
    const b = { sku: "ING-5", cantidad: 1, vence_el: vence, idempotency_key: key };
    const r1 = (await POSTIngreso(ctx("http://x/api/stock/ingreso", { body: b }))) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await POSTIngreso(ctx("http://x/api/stock/ingreso", { body: b }))) as Response;
    expect(r2.status).toBe(409);
  });
});
