import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore, store } from "../src/lib/store.js";
import { GET as GETProducts, POST as POSTProducts, PATCH as PATCHProducts } from "../src/pages/api/products.js";
import { GET as GETLots, POST as POSTLots } from "../src/pages/api/lots.js";
import { GET as GETLocs, POST as POSTLocs } from "../src/pages/api/locations.js";
import { POST as POSTCounts, PATCH as PATCHCounts } from "../src/pages/api/counts.js";
import { GET as GETQr, POST as POSTQr, DELETE as DELETEQr } from "../src/pages/api/cash/qr.js";
import { GET as GETDue, POST as POSTDue, PATCH as PATCHDue } from "../src/pages/api/cash/due-items.js";
import { POST as POSTSales } from "../src/pages/api/sales.js";
import { POST as POSTVenc } from "../src/pages/api/jobs/vencimientos-lotes.js";
import { POST as POSTOcrFecha } from "../src/pages/api/lots/ocr-fecha.js";

beforeEach(() => resetStore());

describe("N1 CAT-S1 productos", () => {
  it("alta 201 + 409 duplicado + búsqueda", async () => {
    const r1 = (await POSTProducts(ctx("http://x/api/products", { body: { sku: "YERBA-1", nombre: "Yerba", precio_centavos: 5000, codigo: "779123" } }))) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await POSTProducts(ctx("http://x/api/products", { body: { sku: "YERBA-1", nombre: "Otra", precio_centavos: 1 } }))) as Response;
    expect(r2.status).toBe(409);
    const g = (await GETProducts(ctx("http://x/api/products?q=yerba"))) as Response;
    expect((await g.json() as { productos: unknown[] }).productos.length).toBe(1);
  });
});

describe("N1 CAT-S3 lots FEFO", () => {
  it("controla_vencimiento sin fecha 422 + FEFO orden", async () => {
    const r422 = (await POSTLots(ctx("http://x/api/lots", { body: { sku: "LECHE", cantidad: 5, controla_vencimiento: true } }))) as Response;
    expect(r422.status).toBe(422);
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "LECHE", cantidad: 5, vence_el: new Date(Date.now() + 10 * 86400_000).toISOString() } }));
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "LECHE", cantidad: 5, vence_el: new Date(Date.now() + 2 * 86400_000).toISOString() } }));
    const g = (await GETLots(ctx("http://x/api/lots?sku=LECHE"))) as Response;
    const j = (await g.json()) as { lotes: Array<{ venceEl: string }> };
    expect(j.lotes[0]!.venceEl < j.lotes[1]!.venceEl).toBe(true);
  });
});

describe("N1 CAT-S5/S6 ubicaciones + conteo", () => {
  it("ubicacion 409 + conteo confirma ajuste", async () => {
    const a = (await POSTLocs(ctx("http://x/api/locations", { body: { nombre: "Deposito" } }))) as Response;
    expect(a.status).toBe(201);
    const b = (await POSTLocs(ctx("http://x/api/locations", { body: { nombre: "deposito" } }))) as Response;
    expect(b.status).toBe(409);
    store.stock.set("YERBA-1", 10);
    const c = (await POSTCounts(ctx("http://x/api/counts", { body: { contado_por: "emp", lineas: [{ sku: "YERBA-1", fisico: 8 }] }, headers: { "Idempotency-Key": "k1" } }))) as Response;
    expect(c.status).toBe(201);
    const cj = (await c.json()) as { id: string };
    const p = (await PATCHCounts(ctx(`http://x/api/counts?id=${cj.id}`, { body: { rol: "dueno", confirmado_por: "due", motivo: "ajuste" } }))) as Response;
    expect(p.status).toBe(200);
    expect(store.stock.get("YERBA-1")).toBe(8);
  });
});

describe("N1 CAJA qr + vencimientos + pagos divididos", () => {
  it("qr dedupe + deshacer", async () => {
    const r1 = (await POSTQr(ctx("http://x/api/cash/qr", { body: { numero_operacion: "OP1", monto_centavos: 1000 }, headers: { "Idempotency-Key": "q1" } }))) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await POSTQr(ctx("http://x/api/cash/qr", { body: { numero_operacion: "OP1", monto_centavos: 1000 }, headers: { "Idempotency-Key": "q2" } }))) as Response;
    expect(r2.status).toBe(409);
    const d = (await DELETEQr(ctx("http://x/api/cash/qr?numero_operacion=OP1"))) as Response;
    expect(d.status).toBe(200);
  });
  it("due-item pagar crea egreso", async () => {
    const r = (await POSTDue(ctx("http://x/api/cash/due-items", { body: { concepto: "Luz", vence_el: new Date().toISOString(), monto_centavos: 2000 } }))) as Response;
    const j = (await r.json()) as { id: string };
    const p = (await PATCHDue(ctx(`http://x/api/cash/due-items?id=${j.id}`, { body: {}, headers: { "Idempotency-Key": "d1" } }))) as Response;
    expect(p.status).toBe(200);
  });
  it("venta dividida suma total", async () => {
    const key = crypto.randomUUID();
    const body = { lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }], medio: "Efectivo", device_code: "caja-01", seq_local: 1, client_occurred_at: new Date().toISOString(), offline: false, pagos: [{ medio: "Efectivo", monto_centavos: 10000 }, { medio: "QR", monto_centavos: 5000 }] };
    const r = (await POSTSales(ctx("http://x/api/sales", { body, headers: { "Idempotency-Key": key } }))) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as { pagos: unknown[] };
    expect(j.pagos.length).toBe(2);
  });
});

describe("N1 CAT-S4 + OCR vencimiento", () => {
  it("job clasifica 3d y ocr propone fecha", async () => {
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "VTO", cantidad: 2, vence_el: new Date(Date.now() + 2 * 86400_000).toISOString() } }));
    const j = (await POSTVenc(ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST" }))) as Response;
    expect((await j.json() as { alertas_3d: unknown[] }).alertas_3d.length).toBe(1);
    const o = (await POSTOcrFecha(ctx("http://x/ocr", { body: { texto: "VTO 03/2027" } }))) as Response;
    expect(o.status).toBe(200);
  });
});
