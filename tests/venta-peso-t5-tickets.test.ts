import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore, store } from "../src/lib/store.js";
import { buildTicketRender, type TicketRenderInput } from "../src/modules/sales/ticket_render.js";
import { render_ticket_thermal, type TicketThermalInput } from "../src/modules/sales/ticket_thermal.js";
import { construir_resumen_ticket, construir_wa_me_url } from "../src/modules/sales/ticket_share.js";
import { POST as postRender } from "../src/pages/api/tickets/render.js";
import { POST as postThermal } from "../src/pages/api/tickets/thermal.js";
import { POST as postCompartir } from "../src/pages/api/tickets/compartir.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { POST as postProducts } from "../src/pages/api/products.js";
import { GET as getBalance } from "../src/pages/api/cash/balance.js";

const LINK = "https://x/t/abcdefghijklmnopqrstuv";
const FECHA = "2026-11-21T12:00:00.000-03:00";

function lineasHtml() {
  return [
    {
      sku: "YERBA",
      cantidad: 2,
      brutoCentavos: 30000n,
      descLineaCentavos: 0n,
      descTicketCentavos: 0n,
      netoCentavos: 30000n,
    },
    {
      sku: "PAPAS",
      cantidad: 1250,
      porPeso: true,
      precioCentavos: 500000n,
      brutoCentavos: 625000n,
      descLineaCentavos: 0n,
      descTicketCentavos: 0n,
      netoCentavos: 625000n,
    },
  ];
}

function inputHtml(): TicketRenderInput {
  return {
    comercio: "Demo",
    ticket: {
      kind: "online",
      definitivo: "T-000001",
      provisorio: "P-1",
      totalCentavos: 655000n,
      medio: "Efectivo",
      leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA",
    },
    lineas: lineasHtml(),
    linkPublico: LINK,
    fechaIso: FECHA,
  };
}

function inputThermal(): TicketThermalInput {
  return {
    comercio: "Demo",
    ticketDefinitivo: "T-000001",
    provisorio: "P-1",
    fechaIso: FECHA,
    medio: "Efectivo",
    lineas: [
      { sku: "YERBA", cantidad: 2, precioCentavos: 15000n, netoCentavos: 30000n },
      { sku: "PAPAS", cantidad: 1250, precioCentavos: 500000n, netoCentavos: 625000n, porPeso: true },
    ],
    totalBrutoCentavos: 655000n,
    totalDescuentoCentavos: 0n,
    totalNetoCentavos: 655000n,
    qrUrl: LINK,
  };
}

function lineasResumen() {
  return [
    { sku: "YERBA", cantidad: 2, precioCentavos: 15000n },
    { sku: "PAPAS", cantidad: 1250, precioCentavos: 500000n, porPeso: true },
  ];
}

describe("T5 #389 ticket HTML: línea por peso y mezcla de unidades", () => {
  it("muestra kg × $/kg = subtotal, con el mismo número y total del ticket", () => {
    const salida = buildTicketRender(inputHtml());
    expect(salida.qrPayload).toBe(LINK);
    expect(salida.html).toContain("T-000001");
    expect(salida.html).toContain("1,250 kg");
    expect(salida.html).toContain("$ 5.000,00/kg");
    expect(salida.html).toContain("= $ 6.250,00");
    expect(salida.html).toContain("$ 6.550,00");
    expect(salida.html).toContain("YERBA");
    expect(salida.text).toContain("1,250 kg");
  });

  it("POST /api/tickets/render acepta porPeso y precioCentavos en la línea", async () => {
    const r = (await postRender(
      ctx("http://x/api/tickets/render", {
        body: {
          comercio: "Demo",
          ticket: {
            kind: "online",
            definitivo: "T-000001",
            provisorio: "P-1",
            totalCentavos: "655000",
            medio: "Efectivo",
          },
          lineas: lineasHtml().map((l) => ({
            ...l,
            brutoCentavos: l.brutoCentavos.toString(),
            descLineaCentavos: l.descLineaCentavos.toString(),
            descTicketCentavos: l.descTicketCentavos.toString(),
            netoCentavos: l.netoCentavos.toString(),
            precioCentavos: l.precioCentavos?.toString(),
          })),
          linkPublico: LINK,
          fechaIso: FECHA,
        },
      }),
    )) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { html: string; text: string };
    expect(j.html).toContain("1,250 kg × $ 5.000,00/kg = $ 6.250,00");
    expect(j.text).toContain("1,250 kg");
  });
});

describe("T5 #389 ticket térmico 58/80: línea por peso y mezcla de unidades", () => {
  it("muestra el peso y respeta el ancho de 32 y 48 columnas", () => {
    const r = render_ticket_thermal(inputThermal());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cols32).toContain("T-000001");
    expect(r.cols32).toContain("1,250 kg x $5.000,00/kg");
    expect(r.cols32).toContain("= $6.250,00");
    expect(r.cols32).toContain("2x");
    expect(r.cols32).toContain("$6.550,00");
    expect(r.cols48).toContain("1,250 kg x $5.000,00/kg");
    expect(r.html58).toContain("thermal-58");
    expect(r.html80).toContain("thermal-80");
    for (const linea of r.cols32.split("\n")) expect(linea.length).toBeLessThanOrEqual(32);
    for (const linea of r.cols48.split("\n")) expect(linea.length).toBeLessThanOrEqual(48);
  });

  it("POST /api/tickets/thermal acepta porPeso en la línea", async () => {
    const r = (await postThermal(
      ctx("http://x/api/tickets/thermal", {
        body: {
          comercio: "Demo",
          ticketDefinitivo: "T-000001",
          provisorio: "P-1",
          fechaIso: FECHA,
          medio: "Efectivo",
          lineas: inputThermal().lineas.map((l) => ({
            ...l,
            precioCentavos: l.precioCentavos.toString(),
            netoCentavos: l.netoCentavos?.toString(),
          })),
          totalBrutoCentavos: "655000",
          totalDescuentoCentavos: "0",
          totalNetoCentavos: "655000",
        },
      }),
    )) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { cols32: string; cols48: string };
    expect(j.cols32).toContain("1,250 kg");
    expect(j.cols48).toContain("$5.000,00/kg");
  });
});

describe("T5 #389 WhatsApp: mismo formato de peso y total", () => {
  it("el resumen con link incluye la línea en kg y el total de la venta", () => {
    const resumen = construir_resumen_ticket({
      definitivo: "T-000001",
      provisorio: "P-1",
      totalCentavos: 655000n,
      medio: "Efectivo",
      comercio: "Demo",
      linkPublico: LINK,
      lineas: lineasResumen(),
    });
    expect(resumen).toContain("Ticket T-000001");
    expect(resumen).toContain("PAPAS: 1,250 kg × $ 5.000,00/kg = $ 6.250,00");
    expect(resumen).toContain("YERBA");
    expect(resumen).toContain("Total $6550.00 (Efectivo)");
    expect(resumen).toContain(LINK);
  });

  it("el link wa.me codifica el resumen con el peso", () => {
    const resumen = construir_resumen_ticket({
      definitivo: "T-000001",
      provisorio: "P-1",
      totalCentavos: 625000n,
      medio: "Efectivo",
      comercio: "Demo",
      lineas: [{ sku: "PAPAS", cantidad: 1250, precioCentavos: 500000n, porPeso: true }],
    });
    const w = construir_wa_me_url({ toE164: "+5491100000000", resumen });
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(decodeURIComponent(w.url)).toContain("1,250 kg");
  });
});

describe("T5 #389 WhatsApp: API compartir con línea por peso", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    resetStore();
  });

  it("el resumen del link usa el mismo formato y el total de la venta", async () => {
    await constKg("VP-KG-WA", 500000, 5000);
    const venta = (await postSales(
      ctx("http://x/api/sales", {
        headers: { "Idempotency-Key": "t5-wa" },
        body: {
          lineas: [{ product_id: "VP-KG-WA", qty: 1250, precio_centavos: 500000, por_peso: true }],
          medio: "Efectivo",
          device_code: "caja-01",
          seq_local: 1,
          client_occurred_at: new Date().toISOString(),
          offline: false,
        },
      }),
    )) as Response;
    expect(venta.status).toBe(201);
    const { sale_id } = (await venta.json()) as { sale_id: string };

    const r = (await postCompartir(
      ctx("http://x/api/tickets/compartir", {
        headers: { "Idempotency-Key": "t5-wa-share" },
        body: {
          sale_id,
          toE164: "+5491100000000",
          comercio: "Demo",
          lineas: [{ sku: "PAPAS", cantidad: 1250, precioCentavos: "500000", porPeso: true }],
        },
      }),
    )) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { resumen: string; wa_me_url: string };
    expect(j.resumen).toContain("PAPAS: 1,250 kg × $ 5.000,00/kg = $ 6.250,00");
    expect(j.resumen).toContain("Total $6250.00 (Efectivo)");
    expect(decodeURIComponent(j.wa_me_url)).toContain("1,250 kg");
  });
});

describe("T5 #389 número de ticket, total y cierre de caja sin cambios", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    resetStore();
  });

  it("una venta mixta conserva la numeración, el total y el balance", async () => {
    await constKg("VP-KG-T5", 500000, 5000);
    store.stock.set("YERBA", 10);
    const unitaria = (await postSales(
      ctx("http://x/api/sales", {
        headers: { "Idempotency-Key": "t5-unitaria" },
        body: {
          lineas: [{ product_id: "YERBA", qty: 2, precio_centavos: 30000 }],
          medio: "Efectivo",
          device_code: "caja-01",
          seq_local: 1,
          client_occurred_at: new Date().toISOString(),
          offline: false,
        },
      }),
    )) as Response;
    expect(unitaria.status).toBe(201);
    expect(((await unitaria.json()) as { ticket_definitivo: string }).ticket_definitivo).toBe("T-000001");

    const mixta = (await postSales(
      ctx("http://x/api/sales", {
        headers: { "Idempotency-Key": "t5-mixta" },
        body: {
          lineas: [
            { product_id: "YERBA", qty: 1, precio_centavos: 30000 },
            { product_id: "VP-KG-T5", qty: 1250, precio_centavos: 500000, por_peso: true },
          ],
          medio: "Efectivo",
          device_code: "caja-01",
          seq_local: 2,
          client_occurred_at: new Date().toISOString(),
          offline: false,
        },
      }),
    )) as Response;
    expect(mixta.status).toBe(201);
    const j = (await mixta.json()) as { ticket_definitivo: string; total_centavos: string };
    expect(j.ticket_definitivo).toBe("T-000002");
    expect(j.total_centavos).toBe("655000");

    const balance = (await getBalance(ctx("http://x/api/cash/balance"))) as Response;
    expect(((await balance.json()) as { total: string }).total).toBe("715000");
  });
});

async function constKg(sku: string, precioCentavos: number, stockGramos: number): Promise<void> {
  const r = (await postProducts(
    ctx("http://x/api/products", {
      body: { sku, nombre: "Papas", precio_centavos: precioCentavos, por_peso: true },
    }),
  )) as Response;
  expect(r.status).toBe(201);
  store.stock.set(sku, stockGramos);
}

describe("T5 #389 pantalla: los tres canales reciben el flag de peso", () => {
  it("venta.astro pasa porPeso a térmica y WhatsApp", () => {
    const s = readFileSync("src/pages/venta.astro", "utf8");
    const bloqueTermico = s.slice(s.indexOf('"/api/tickets/thermal"'), s.indexOf("const th = await t.json"));
    expect(bloqueTermico).toContain("porPeso: l.porPeso");
    const bloqueWa = s.slice(s.indexOf("$(\"compartir\").onclick"), s.indexOf("$(\"imprimir\").onclick"));
    expect(bloqueWa).toContain("lineas:");
  });
});
