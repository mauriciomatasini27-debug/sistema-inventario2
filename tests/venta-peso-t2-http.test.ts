import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { armarCobroDesdeCarrito } from "../src/modules/sales/carrito_armar_cobro.js";
import { resetStore, store } from "../src/lib/store.js";
import { GET as getProducts, POST as postProducts } from "../src/pages/api/products.js";
import { GET as getTickets } from "../src/pages/api/tickets.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { POST as postDescuentos } from "../src/pages/api/sales/discounts-preview.js";

function modoSingleSinDb(): void {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

async function sembrarPorPeso(sku: string, precioCentavos: number, stockGramos: number): Promise<void> {
  const r = (await postProducts(
    ctx("http://x/api/products", {
      body: { sku, nombre: "Papas", precio_centavos: precioCentavos, por_peso: true },
    }),
  )) as Response;
  expect(r.status).toBe(201);
  expect(((await r.json()) as { por_peso: boolean }).por_peso).toBe(true);
  store.stock.set(sku, stockGramos);
}

function req(key: string, body: Record<string, unknown>) {
  return ctx("http://localhost/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: {
      medio: "Efectivo",
      device_code: "caja-01",
      seq_local: 7,
      client_occurred_at: new Date().toISOString(),
      offline: false,
      ...body,
    },
  });
}

async function vender(body: Record<string, unknown>) {
  const r = (await postSales(req(crypto.randomUUID(), body))) as Response;
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

describe("T2 #386 HTTP: POST /api/sales con producto sembrado por peso", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("acepta 1250 gramos, total 6250, descuenta el peso de un lote y lo muestra en el ticket", async () => {
    const sku = "VP-KG-HTTP";
    await sembrarPorPeso(sku, 5000, 5000);
    const r = await vender({ lineas: [{ product_id: sku, qty: 1250, precio_centavos: 5000, por_peso: true }] });
    expect(r.status).toBe(201);
    expect(r.json["total_centavos"]).toBe("6250");

    expect(store.stock.get(sku)).toBe(3750);
    const moves = store.stockMoves.filter((m) => m.sku === sku && m.delta < 0);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.delta).toBe(-1250);

    const t = (await getTickets(
      ctx(`http://localhost/api/tickets?numero=${String(r.json["ticket_definitivo"])}`),
    )) as Response;
    const tj = (await t.json()) as { lineas: { sku: string; qty: number; precio_centavos: string; neto_centavos: string }[] };
    expect(tj.lineas).toEqual([
      { sku, qty: 1250, precio_centavos: "5000", bruto_centavos: "6250", desc_linea_centavos: "0", desc_ticket_centavos: "0", neto_centavos: "6250" },
    ]);
  });

  it("#474: el payload real de /venta cobra 2500 g y no cae en el tope de 999", async () => {
    const sku = "VP-474-KG";
    await sembrarPorPeso(sku, 5000, 6000);
    const armado = armarCobroDesdeCarrito({
      carrito: [{ product_id: sku, qty: 2500, precio_centavos: 5000, porPeso: true }],
      medio: "Efectivo",
      device_code: "caja-01",
      seq_local: 7,
      offline: false,
      occurredAtIso: new Date().toISOString(),
    });
    expect(armado.ok).toBe(true);
    if (!armado.ok) return;

    const r = (await postSales(req(crypto.randomUUID(), armado.payload))) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as { total_centavos: string };
    expect(j.total_centavos).toBe("12500");
    expect(store.stock.get(sku)).toBe(3500);
  });

  it("mezcla unidades y kilogramos en la misma venta y descuenta cada stock", async () => {
    const sku = "VP-KG-MIX";
    await sembrarPorPeso(sku, 5000, 5000);
    store.stock.set("YERBA", 10);
    const r = await vender({
      lineas: [
        { product_id: "YERBA", qty: 2, precio_centavos: 15000 },
        { product_id: sku, qty: 1250, precio_centavos: 5000, por_peso: true },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.json["total_centavos"]).toBe("36250");
    expect(store.stock.get(sku)).toBe(3750);
    expect(store.stock.get("YERBA")).toBe(8);
  });

  it("1 gramo con mitad arriba al centavo llega al total", async () => {
    const sku = "VP-KG-1G";
    await sembrarPorPeso(sku, 500, 5000);
    const r = await vender({ lineas: [{ product_id: sku, qty: 1, precio_centavos: 500, por_peso: true }] });
    expect(r.status).toBe(201);
    expect(r.json["total_centavos"]).toBe("1");
    expect(store.stock.get(sku)).toBe(4999);
  });

  it("peso vacío, cero o fuera de rango se rechaza sin escribir venta", async () => {
    const sku = "VP-KG-BAD";
    await sembrarPorPeso(sku, 5000, 5000);
    for (const qty of [0, -1, 1_000_001]) {
      const r = await vender({ lineas: [{ product_id: sku, qty, precio_centavos: 5000, por_peso: true }] });
      expect(r.status).toBe(422);
    }
    expect(store.stock.get(sku)).toBe(5000);
    expect(store.ticketLineas).toHaveLength(0);
  });

  it("sin el flag, 1000 unidades siguen siendo inválidas; con el flag son gramos válidos", async () => {
    const sku = "VP-KG-RANGO";
    await sembrarPorPeso(sku, 5000, 5000);
    const unitaria = await vender({ lineas: [{ product_id: sku, qty: 1000, precio_centavos: 5000 }] });
    expect(unitaria.status).toBe(422);

    const porPeso = await vender({ lineas: [{ product_id: sku, qty: 1000, precio_centavos: 5000, por_peso: true }] });
    expect(porPeso.status).toBe(201);
    expect(porPeso.json["total_centavos"]).toBe("5000");
  });

  it("la vista previa de descuentos usa el mismo subtotal por peso", async () => {
    const r = (await postDescuentos(
      ctx("http://localhost/api/sales/discounts-preview", {
        method: "POST",
        body: { lineas: [{ product_id: "PAPAS", qty: 1250, precio_centavos: 5000, por_peso: true }] },
      }),
    )) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { total_bruto_centavos: string; total_neto_centavos: string };
    expect(j.total_bruto_centavos).toBe("6250");
    expect(j.total_neto_centavos).toBe("6250");
  });

  it("el flag expuesto por el catálogo coincide con el de la línea", async () => {
    const sku = "VP-KG-CAT";
    await sembrarPorPeso(sku, 5000, 5000);
    const r = (await getProducts(ctx("http://x/api/products?q=" + sku))) as Response;
    const j = (await r.json()) as { productos: { sku: string; por_peso: boolean }[] };
    expect(j.productos.find((p) => p.sku === sku)?.por_peso).toBe(true);
  });
});
