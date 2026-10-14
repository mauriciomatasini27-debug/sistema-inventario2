import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { GET as getTickets } from "../src/pages/api/tickets.js";
import { POST as postCorreccion } from "../src/pages/api/sales/medium-corrections.js";

beforeEach(() => {
  resetStore();
  delete process.env.TENANT_DATABASE_URL;
});

function ventaBody() {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: 1,
    client_occurred_at: new Date().toISOString(),
    offline: false,
  };
}

describe("tickets TV8/TV14 PERS-S4 (sin DB no rompe)", () => {
  it("historial cae a memoria con fuente y corrección 201 durable best-effort", async () => {
    const r = await postSales(
      ctx("http://x/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: ventaBody(),
      }),
    );
    expect(r.status).toBe(201);
    const j = (await r.json()) as { sale_id: string; ticket_definitivo: string };
    const g = await getTickets(ctx(`http://x/api/tickets?numero=${j.ticket_definitivo}`));
    expect(g.status).toBe(200);
    expect(((await g.json()) as Record<string, unknown>)["fuente"]).toBe("memoria");

    const c = (await postCorreccion(
      ctx("http://x/api/sales/medium-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: { sale_id: j.sale_id, medio_nuevo: "QR", motivo: "cliente pide QR", actor: "dueno-1" },
      }),
    )) as Response;
    expect(c.status).toBe(201);
    const cj = (await c.json()) as Record<string, unknown>;
    expect(cj["antes"]).toBe("Efectivo");
    expect(cj["despues"]).toBe("QR");
  });
});
