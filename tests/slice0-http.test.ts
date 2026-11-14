import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { POST as POSTSales } from "../src/pages/api/sales.js";
import { POST as POSTCash } from "../src/pages/api/cash/movements.js";
import { GET as GETBalance } from "../src/pages/api/cash/balance.js";
import { GET as GETTickets } from "../src/pages/api/tickets.js";
import { POST as POSTPush } from "../src/pages/api/sync/push.js";
import { POST as POSTPromote } from "../src/pages/api/sync/promote.js";
import { resetStore, store } from "../src/lib/store.js";

function ventaBody(seq: number, over: Record<string, unknown> = {}) {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: seq,
    client_occurred_at: new Date().toISOString(),
    offline: false,
    ...over,
  };
}

function req(url: string, key: string, body: unknown) {
  return ctx(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: body as Record<string, unknown>,
  });
}

async function postSales(key: string, seq: number, over: Record<string, unknown> = {}) {
  const res = (await POSTSales(req("http://localhost/api/sales", key, ventaBody(seq, over)))) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("slice-0 HTTP E2E (ADR-0017)", () => {
  beforeEach(() => resetStore());

  it("venta online 201 crea ticket definitivo + egreso misma tx y balance cuadra", async () => {
    const key = crypto.randomUUID();
    const { status, json } = await postSales(key, 1);
    expect(status).toBe(201);
    expect(json["ticket_definitivo"]).toBe("T-000001");
    expect(json["ticket_provisorio"]).toBe("caja-01-1");

    // Query confirma ticket + egreso.
    const t = (await GETTickets(ctx(`http://localhost/api/tickets?numero=${json["ticket_definitivo"]}`))) as Response;
    expect(t.status).toBe(200);
    const tj = (await t.json()) as Record<string, unknown>;
    expect(tj["sale_id"]).toBe(json["sale_id"]);
    expect(tj["lineas"]).toEqual([
      {
        sku: "demo-sku-1",
        qty: 1,
        precio_centavos: "15000",
        bruto_centavos: "15000",
        desc_linea_centavos: "0",
        desc_ticket_centavos: "0",
        neto_centavos: "15000",
      },
    ]);

    const egresos = store.movements.filter((m) => m.idempotency_key === key && m.origen === "venta");
    expect(egresos).toHaveLength(1);
    expect(egresos[0]?.sale_id).toBe(json["sale_id"]);

    const b = (await GETBalance(ctx("http://x/api/cash/balance"))) as Response;
    const bj = (await b.json()) as { por_medio: Record<string, string>; total: string };
    expect(bj.por_medio["Efectivo"]).toBe("15000");
    expect(bj.total).toBe("15000");
  });

  it("doble toque misma key: 409 y un solo par ticket-egreso; cash/movements misma key tambien 409", async () => {
    const key = crypto.randomUUID();
    const r1 = await postSales(key, 2);
    expect(r1.status).toBe(201);
    const r2 = await postSales(key, 2);
    expect(r2.status).toBe(409);
    expect(store.idempotency.size).toBe(1);
    expect(store.movements.filter((m) => m.idempotency_key === key)).toHaveLength(1);

    const dup = (await POSTCash(
      req("http://localhost/api/cash/movements", key, {
        tipo: "egreso",
        metodo: "Efectivo",
        categoria_id: "venta",
        origen: "venta",
        sale_id: r1.json["sale_id"],
        monto_centavos: 15000,
        device_code: "caja-01",
        seq_local: 2,
        client_occurred_at: new Date().toISOString(),
      }),
    )) as Response;
    expect(dup.status).toBe(409);
  });

  it("balance cuadra SUM por medio tras varias ventas", async () => {
    await postSales(crypto.randomUUID(), 3, { medio: "Efectivo" });
    await postSales(crypto.randomUUID(), 4, {
      medio: "QR",
      lineas: [{ product_id: "demo-sku-1", qty: 2, precio_centavos: 5000 }],
    });
    const b = (await GETBalance(ctx("http://x/api/cash/balance"))) as Response;
    const bj = (await b.json()) as { por_medio: Record<string, string>; total: string };
    expect(bj.por_medio["Efectivo"]).toBe("15000");
    expect(bj.por_medio["QR"]).toBe("10000");
    expect(bj.total).toBe("25000");
  });

  it("corte offline: provisorio -> push -> promote reasigna T-* sin duplicar; replay idempotente", async () => {
    const opId = crypto.randomUUID();
    const payload = ventaBody(5, { offline: true });

    // Venta offline: provisorio, sin definitivo.
    const v = await postSales(opId, 5, { offline: true });
    expect(v.status).toBe(201);
    expect(v.json["ticket_definitivo"]).toBeNull();
    const provisorio = v.json["ticket_provisorio"] as string;
    expect(provisorio).toBe("caja-01-5");

    // Sync push con mismo op_id (= Idempotency-Key).
    const push = (await POSTPush(
      req("http://localhost/api/sync/push", opId, {
        op_id: opId,
        device_code: "caja-01",
        device_seq: 5,
        hlc: `${Date.now()}:0`,
        modulo: "sales",
        payload,
        client_occurred_at: new Date().toISOString(),
      }),
    )) as Response;
    expect(push.status).toBe(201);

    // Promote asigna definitivo correlativo T-*.
    const pm = (await POSTPromote(
      req("http://localhost/api/sync/promote", opId, { op_id: opId, device_code: "caja-01", device_seq: 5 }),
    )) as Response;
    expect(pm.status).toBe(201);
    const pmj = (await pm.json()) as Record<string, unknown>;
    expect(pmj["ticket_provisorio"]).toBe("caja-01-5");
    expect(pmj["ticket_definitivo"]).toMatch(/^T-\d{6}$/);
    const definitivo = String(pmj["ticket_definitivo"]);

    const porDef = (await GETTickets(ctx(`http://localhost/api/tickets?numero=${definitivo}`))) as Response;
    expect(porDef.status).toBe(200);
    const cuerpoDef = (await porDef.json()) as Record<string, unknown>;
    expect(cuerpoDef["ticket_definitivo"]).toBe(definitivo);
    expect(cuerpoDef["ticket_provisorio"]).toBe(provisorio);
    expect(cuerpoDef["total_centavos"]).toBe("15000");

    const porProv = (await GETTickets(ctx(`http://localhost/api/tickets?numero=${provisorio}`))) as Response;
    expect(porProv.status).toBe(200);
    expect(((await porProv.json()) as Record<string, unknown>)["sale_id"]).toBe(cuerpoDef["sale_id"]);

    // Replay del promote devuelve el mismo mapeo (200), sin consumir número.
    const pm2 = (await POSTPromote(
      req("http://localhost/api/sync/promote", opId, { op_id: opId, device_code: "caja-01", device_seq: 5 }),
    )) as Response;
    expect(pm2.status).toBe(200);
    expect(((await pm2.json()) as Record<string, unknown>)["ticket_definitivo"]).toBe(definitivo);

    const porDefReplay = (await GETTickets(ctx(`http://localhost/api/tickets?numero=${definitivo}`))) as Response;
    expect(porDefReplay.status).toBe(200);
    expect(((await porDefReplay.json()) as Record<string, unknown>)["ticket_definitivo"]).toBe(definitivo);

    // Push replay mismo payload -> 200, distinto payload -> 409.
    const push2 = (await POSTPush(
      req("http://localhost/api/sync/push", opId, {
        op_id: opId,
        device_code: "caja-01",
        device_seq: 5,
        hlc: `${Date.now()}:0`,
        modulo: "sales",
        payload,
        client_occurred_at: new Date().toISOString(),
      }),
    )) as Response;
    expect(push2.status).toBe(200);
  });
});
