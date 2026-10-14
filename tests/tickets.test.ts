import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
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
  return ctx("http://x/api/sales", {
    method: "POST",
    body: body as Record<string, unknown>,
    headers: { "Idempotency-Key": key },
  });
}

describe("tickets historial + caja (TV8/TV6/C6)", () => {
  it("POST crea con leyenda y GET resuelve por definitivo y provisorio", async () => {
    const r = await postSales(postSalesReq("tk-1", ventaBody()));
    expect(r.status).toBe(201);
    const j = (await r.json()) as { ticket_definitivo: string; ticket_provisorio: string; leyenda: string };
    expect(j.ticket_definitivo).toBe("T-000001");
    expect(j.leyenda).toBe("DOCUMENTO NO VÁLIDO COMO FACTURA");

    const porDef = await getTickets(ctx(`http://x/api/tickets?numero=${j.ticket_definitivo}`));
    expect(porDef.status).toBe(200);
    const porProv = await getTickets(ctx(`http://x/api/tickets?numero=${j.ticket_provisorio}`));
    expect(porProv.status).toBe(200);

    const ausente = await getTickets(ctx("http://x/api/tickets?numero=T-999999"));
    expect(ausente.status).toBe(404);
    const vacio = await getTickets(ctx("http://x/api/tickets?numero="));
    expect(vacio.status).toBe(422);
  });

  it("doble toque 409 con original y sin quemar número", async () => {
    const r1 = await postSales(postSalesReq("tk-doble", ventaBody()));
    expect(r1.status).toBe(201);
    const r2 = await postSales(postSalesReq("tk-doble", ventaBody()));
    expect(r2.status).toBe(409);
    const r3 = await postSales(postSalesReq("tk-otra", ventaBody({ seq_local: 2 })));
    expect(((await r3.json()) as { ticket_definitivo: string }).ticket_definitivo).toBe("T-000002");
  });

  it("TV6: cash/movements rechaza venta sin sale_id y balance usa origen real", async () => {
    const huerfano = await postCash(
      ctx("http://x/api/cash/movements", {
        method: "POST",
        headers: { "Idempotency-Key": "h-1" },
        body: {
          tipo: "egreso",
          metodo: "Efectivo",
          categoria_id: "venta_mostrador",
          origen: "venta",
          monto_centavos: 1000,
          device_code: "caja-01",
          seq_local: 9,
          client_occurred_at: new Date().toISOString(),
        },
      }),
    );
    expect(huerfano.status).toBe(422);

    await postSales(postSalesReq("tk-bal", ventaBody()));
    const bal = await getBalance(ctx("http://x/api/cash/balance"));
    const j = (await bal.json()) as { total: string; por_medio: Record<string, string> };
    expect(j.total).toBe("-15000");
    expect(j.por_medio["Efectivo"]).toBe("-15000");
  });
});
