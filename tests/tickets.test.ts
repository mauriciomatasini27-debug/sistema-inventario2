import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore, store } from "../src/lib/store.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { GET as getTickets } from "../src/pages/api/tickets.js";
import { POST as postCash } from "../src/pages/api/cash/movements.js";
import { GET as getBalance } from "../src/pages/api/cash/balance.js";
import { ventaACuenta, cobroFiado } from "../src/lib/repos/fiado.js";
import { sinConfirmarExceso } from "../src/modules/credit/fiado.js";
import { guardarTicketFiado } from "../src/lib/ticket-memoria.js";
import { buscarVentaPorId, registrarDevolucion } from "../src/lib/repos/ventas.js";

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
    expect(j.total).toBe("15000");
    expect(j.por_medio["Efectivo"]).toBe("15000");
  });

  it("P10-2: sin ficha la venta a cuenta no persiste ticket ni baja stock", async () => {
    const r = await ventaACuenta({
      key: "fiado-p10",
      customerId: crypto.randomUUID(),
      lineas: [{ sku: "demo-sku-1", qty: 2, precioCentavos: 15000 }],
      deviceCode: "caja-01",
      seqLocal: 1,
      rol: "dueno",
      confirmacion: sinConfirmarExceso(),
    });
    expect(r).toMatchObject({ ok: false, codigo: "CLIENTE_DESCONOCIDO", status: 404 });
    expect(store.stock.get("demo-sku-1")).toBe(10);
    expect(store.fiadoTickets.size).toBe(0);
  });

  it("P10-4: devolución de venta a cuenta reintegra crédito y no toca caja", async () => {
    const saleId = crypto.randomUUID();
    store.stock.set("demo-sku-1", 8);
    guardarTicketFiado(saleId, {
      sale_id: saleId,
      ticket_definitivo: "T-000001",
      ticket_provisorio: "caja-01-1",
      total_centavos: "30000",
      medio: "A cuenta",
      sobreventa: false,
      idempotency_key: "fiado-dev",
    });
    store.creditMovs.push({ customer_id: "c1", debe: "30000", haber: "0", key: "fiado-dev" });
    const d = await registrarDevolucion({
      key: "dev-fiado",
      saleId,
      montoCentavos: 15000n,
      items: [{ sku: "demo-sku-1", cantidad: 1 }],
      medio: "Efectivo",
      motivo: "falla",
      actor: "duena",
      clientOccurredAt: new Date().toISOString(),
    });
    expect(d.ok).toBe(true);
    expect(store.stock.get("demo-sku-1")).toBe(9);
    expect(store.movements.filter((m) => m.origen === "devolucion")).toHaveLength(0);
    expect(store.creditMovs.find((m) => m.key === "dev-fiado:devolucion")).toMatchObject({
      customer_id: "c1",
      haber: "15000",
    });
  });

  it("P10-3: cobro de fiado ingresa a caja", async () => {
    const r = await cobroFiado({ key: "cobro-p10", customerId: "c1", montoCentavos: 5000n, medio: "Efectivo" });
    expect(r.ok).toBe(true);
    expect(store.movements.find((m) => m.idempotency_key === "cobro-p10")).toMatchObject({
      tipo: "ingreso",
      origen: "cobro_fiado",
      monto_centavos: "5000",
    });
  });
});
