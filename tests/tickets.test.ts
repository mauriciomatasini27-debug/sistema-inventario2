import { describe, expect, it, beforeEach } from "vitest";
import { resetStore } from "../src/lib/store.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { GET as getTickets } from "../src/pages/api/tickets.js";
import { POST as postCash } from "../src/pages/api/cash/movements.js";
import { GET as getBalance } from "../src/pages/api/cash/balance.js";

beforeEach(() => {
  resetStore();
});

function ventaBody(over: Record<string, unknown> = {}) {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: 1,
    client_occurred_at: new Date().toISOString(),
    offline: false,
    ...over,
  };
}

function postSalesReq(key: string, body: unknown) {
  return new Request("http://x/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

describe("tickets historial + caja (TV8/TV6/C6)", () => {
  it("POST crea con leyenda y GET resuelve por definitivo y provisorio", async () => {
    const r = await postSales({ request: postSalesReq("tk-1", ventaBody()) } as never);
    expect(r.status).toBe(201);
    const j = (await r.json()) as { ticket_definitivo: string; ticket_provisorio: string; leyenda: string };
    expect(j.ticket_definitivo).toBe("T-000001");
    expect(j.leyenda).toBe("DOCUMENTO NO VÁLIDO COMO FACTURA");

    const porDef = await getTickets({ request: new Request(`http://x/api/tickets?numero=${j.ticket_definitivo}`) } as never);
    expect(porDef.status).toBe(200);
    const porProv = await getTickets({ request: new Request(`http://x/api/tickets?numero=${j.ticket_provisorio}`) } as never);
    expect(porProv.status).toBe(200);

    const ausente = await getTickets({ request: new Request("http://x/api/tickets?numero=T-999999") } as never);
    expect(ausente.status).toBe(404);
    const vacio = await getTickets({ request: new Request("http://x/api/tickets?numero=") } as never);
    expect(vacio.status).toBe(422);
  });

  it("doble toque 409 con original y sin quemar número", async () => {
    const r1 = await postSales({ request: postSalesReq("tk-doble", ventaBody()) } as never);
    expect(r1.status).toBe(201);
    const r2 = await postSales({ request: postSalesReq("tk-doble", ventaBody()) } as never);
    expect(r2.status).toBe(409);
    const r3 = await postSales({ request: postSalesReq("tk-otra", ventaBody({ seq_local: 2 })) } as never);
    expect(((await r3.json()) as { ticket_definitivo: string }).ticket_definitivo).toBe("T-000002");
  });

  it("TV6: cash/movements rechaza venta sin sale_id y balance usa origen real", async () => {
    const huerfano = await postCash({
      request: new Request("http://x/api/cash/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "h-1" },
        body: JSON.stringify({
          tipo: "egreso",
          metodo: "Efectivo",
          categoria_id: "venta_mostrador",
          origen: "venta",
          monto_centavos: 1000,
          device_code: "caja-01",
          seq_local: 9,
          client_occurred_at: new Date().toISOString(),
        }),
      }),
    } as never);
    expect(huerfano.status).toBe(422);

    await postSales({ request: postSalesReq("tk-bal", ventaBody()) } as never);
    const bal = await getBalance({} as never);
    const j = (await bal.json()) as { total: string; por_medio: Record<string, string> };
    expect(j.total).toBe("-15000");
    expect(j.por_medio["Efectivo"]).toBe("-15000");
  });
});
