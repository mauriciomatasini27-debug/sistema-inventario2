import { describe, expect, it } from "vitest";
import { aplicar_descuentos } from "../src/modules/sales/descuentos.js";
import {
  LEYENDA_NO_FISCAL,
  PAGO_A_CUENTA,
  vender_mostrador,
  type TicketEmitido,
  type VenderMostradorInput,
} from "../src/modules/sales/vender_mostrador.js";
import { confirmar_venta, type ConfirmarVentaOk } from "../src/modules/sales/confirmar_venta.js";
import type { Lote, LotId, Sku } from "../src/modules/inventario/inventario.js";

const sku = (s: string) => s as Sku;
const lot = (s: string) => s as LotId;
const lote = (id: string, s: string, cantidad: number): Lote => ({
  id: lot(id),
  sku: sku(s),
  cantidad,
  venceEl: null,
  costoCentavos: 1000n,
});

function base(over: Partial<VenderMostradorInput> = {}): VenderMostradorInput {
  return {
    idempotencyKey: "d-" + Math.random().toString(36).slice(2),
    lineas: [
      { sku: sku("YERBA"), cantidad: 1, precioCentavos: 7000n },
      { sku: sku("AZUCAR"), cantidad: 1, precioCentavos: 3000n },
    ],
    medio: "Efectivo",
    deviceCode: "KIOSCO-01",
    seqLocal: 41,
    offline: false,
    lotes: [lote("l1", "YERBA", 10), lote("l2", "AZUCAR", 10)],
    vistos: new Map<string, TicketEmitido>(),
    ultimoDefinitivo: { n: 128 },
    grant: { rol: "dueno" },
    ...over,
  };
}

describe("TV4 descuento por línea", () => {
  it("monto fijo por línea reduce el neto y queda en el snapshot", () => {
    const r = aplicar_descuentos({
      lineas: [{ sku: "YERBA", cantidad: 2, precioCentavos: 5000n }],
      descuentosLinea: [{ tipo: "monto", montoCentavos: 2000n }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calculo.totalBrutoCentavos).toBe(10000n);
    expect(r.calculo.totalNetoCentavos).toBe(8000n);
    expect(r.calculo.lineas[0]).toMatchObject({
      brutoCentavos: 10000n,
      descLineaCentavos: 2000n,
      descTicketCentavos: 0n,
      netoCentavos: 8000n,
    });
  });

  it("porcentaje con mitad-arriba (199 al 10% => 20)", () => {
    const r = aplicar_descuentos({
      lineas: [{ sku: "YERBA", cantidad: 1, precioCentavos: 199n }],
      descuentosLinea: [{ tipo: "porcentaje", porcentajeBp: 1000 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calculo.totalNetoCentavos).toBe(179n);
  });

  it("monto mayor al bruto de la línea es 422, no tope silencioso", () => {
    expect(
      aplicar_descuentos({
        lineas: [{ sku: "YERBA", cantidad: 1, precioCentavos: 1000n }],
        descuentosLinea: [{ tipo: "monto", montoCentavos: 1001n }],
      }),
    ).toMatchObject({ ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 });
  });

  it("porcentaje fuera de 0.01%-100% es 422", () => {
    for (const bp of [0, 10_001]) {
      expect(
        aplicar_descuentos({
          lineas: [{ sku: "YERBA", cantidad: 1, precioCentavos: 1000n }],
          descuentosLinea: [{ tipo: "porcentaje", porcentajeBp: bp }],
        }),
      ).toMatchObject({ ok: false, status: 422 });
    }
  });

  it("largo de descuentosLinea distinto al de líneas es 422", () => {
    expect(
      aplicar_descuentos({
        lineas: [{ sku: "YERBA", cantidad: 1, precioCentavos: 1000n }],
        descuentosLinea: [{ tipo: "monto", montoCentavos: 100n }, null],
      }),
    ).toMatchObject({ ok: false, status: 422 });
  });
});

describe("TV4 descuento por ticket con prorrateo mayor resto", () => {
  it("orden fijo: el ticket prorratea sobre el neto post-línea", () => {
    // A: bruto 7000 - línea 2000 = neta 5000. B: neta 3000. Ticket 800
    // sobre 5000/3000 => 500/300 exactos (si fuera sobre brutos daría 560/240).
    const r = aplicar_descuentos({
      lineas: [
        { sku: "A", cantidad: 1, precioCentavos: 7000n },
        { sku: "B", cantidad: 1, precioCentavos: 3000n },
      ],
      descuentosLinea: [{ tipo: "monto", montoCentavos: 2000n }, null],
      descuentoTicket: { tipo: "monto", montoCentavos: 800n },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calculo.lineas[0]).toMatchObject({ descLineaCentavos: 2000n, descTicketCentavos: 500n, netoCentavos: 4500n });
    expect(r.calculo.lineas[1]).toMatchObject({ descLineaCentavos: 0n, descTicketCentavos: 300n, netoCentavos: 2700n });
    expect(r.calculo.totalNetoCentavos).toBe(7200n);
  });

  it("centavos sueltos van a la línea de mayor resto (desempate por índice)", () => {
    const r = aplicar_descuentos({
      lineas: [
        { sku: "A", cantidad: 1, precioCentavos: 100n },
        { sku: "B", cantidad: 1, precioCentavos: 100n },
        { sku: "C", cantidad: 1, precioCentavos: 100n },
      ],
      descuentoTicket: { tipo: "monto", montoCentavos: 100n },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calculo.lineas.map((l) => l.descTicketCentavos)).toEqual([34n, 33n, 33n]);
    expect(r.calculo.totalNetoCentavos).toBe(200n);
  });

  it("ticket porcentaje con mitad-arriba sobre el neto (199 al 10% => 20)", () => {
    const r = aplicar_descuentos({
      lineas: [{ sku: "YERBA", cantidad: 1, precioCentavos: 199n }],
      descuentoTicket: { tipo: "porcentaje", porcentajeBp: 1000 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calculo.totalDescTicketCentavos).toBe(20n);
    expect(r.calculo.totalNetoCentavos).toBe(179n);
  });

  it("ticket mayor al neto es 422: el total nunca queda negativo", () => {
    expect(
      aplicar_descuentos({
        lineas: [{ sku: "YERBA", cantidad: 1, precioCentavos: 1000n }],
        descuentoTicket: { tipo: "monto", montoCentavos: 1001n },
      }),
    ).toMatchObject({ ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 });
  });

  it("el snapshot cuadra: suma de netos == total y suma prorrateada == ticket", () => {
    const r = aplicar_descuentos({
      lineas: [
        { sku: "A", cantidad: 3, precioCentavos: 333n },
        { sku: "B", cantidad: 1, precioCentavos: 1000n },
      ],
      descuentosLinea: [{ tipo: "porcentaje", porcentajeBp: 1000 }, null],
      descuentoTicket: { tipo: "monto", montoCentavos: 101n },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sumaNetos = r.calculo.lineas.reduce((acc, l) => acc + l.netoCentavos, 0n);
    const sumaTicket = r.calculo.lineas.reduce((acc, l) => acc + l.descTicketCentavos, 0n);
    expect(sumaNetos).toBe(r.calculo.totalNetoCentavos);
    expect(sumaTicket).toBe(r.calculo.totalDescTicketCentavos);
    expect(r.calculo.totalDescuentoCentavos).toBe(
      r.calculo.totalDescLineaCentavos + r.calculo.totalDescTicketCentavos,
    );
  });
});

describe("TV4/TV5.8/TV7 en vender_mostrador (aditivo)", () => {
  it("con descuentos el ticket, el egreso y el snapshot usan el neto", () => {
    const r = vender_mostrador(
      base({
        descuentosLinea: [{ tipo: "monto", montoCentavos: 2000n }, null],
        descuentoTicket: { tipo: "monto", montoCentavos: 800n },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.ticket.totalCentavos).toBe(7200n);
    expect(r.efecto.ticket.leyenda).toBe(LEYENDA_NO_FISCAL);
    expect(r.efecto.egreso).toMatchObject({ tipo: "ingreso", monto_centavos: 7200n });
    expect(r.efecto.ingresaACaja).toBe(true);
    expect(r.efecto.totalBrutoCentavos).toBe(10000n);
    expect(r.efecto.totalDescuentoCentavos).toBe(2800n);
    expect(r.efecto.lineasConDescuento).toHaveLength(2);
  });

  it("sin descuentos el bruto iguala al total (vía compatible)", () => {
    const r = vender_mostrador(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.ticket.totalCentavos).toBe(10000n);
    expect(r.efecto.totalBrutoCentavos).toBe(10000n);
    expect(r.efecto.totalDescuentoCentavos).toBe(0n);
    expect(r.efecto.ingresaACaja).toBe(true);
  });

  it("descuento inválido es 422 tipado", () => {
    expect(
      vender_mostrador(base({ descuentoTicket: { tipo: "monto", montoCentavos: 99_999n } })),
    ).toMatchObject({ ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 });
  });

  it("descuento que deja total cero no es ticket gratis (422)", () => {
    expect(
      vender_mostrador(base({ descuentoTicket: { tipo: "porcentaje", porcentajeBp: 10_000 } })),
    ).toMatchObject({ ok: false, status: 422 });
  });

  it("TV5.8 A cuenta: pago en ticket, sin ingreso a caja, con leyenda", () => {
    const r = vender_mostrador(base({ esAcuenta: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.ticket.pago).toBe(PAGO_A_CUENTA);
    expect(r.efecto.ticket.leyenda).toBe(LEYENDA_NO_FISCAL);
    expect(r.efecto.ingresaACaja).toBe(false);
    // Forma estable: el egreso se sigue decidiendo; el adaptador no lo persiste.
    expect(r.efecto.egreso.monto_centavos).toBe(r.efecto.ticket.totalCentavos);
  });

  it("A cuenta combina con descuentos", () => {
    const r = vender_mostrador(
      base({ esAcuenta: true, descuentosLinea: [null, { tipo: "monto", montoCentavos: 500n }] }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.ticket.totalCentavos).toBe(9500n);
    expect(r.efecto.ticket.pago).toBe(PAGO_A_CUENTA);
    expect(r.efecto.ingresaACaja).toBe(false);
  });
});

describe("TV4/TV5.8 en confirmar_venta (shim aditivo)", () => {
  function confirma(over: Partial<Parameters<typeof confirmar_venta>[0]> = {}) {
    return confirmar_venta({
      idempotencyKey: "c-" + Math.random().toString(36).slice(2),
      lineas: [{ product_id: "p1", qty: 1, precio_centavos: 10000n }],
      medio: "Efectivo",
      device_code: "caja-01",
      seq_local: 1,
      offline: false,
      stockDisponible: new Map([["p1", 10]]),
      vistos: new Map<string, ConfirmarVentaOk>(),
      proximoDefinitivo: () => "T-000001",
      clientOccurredAt: new Date().toISOString(),
      ...over,
    });
  }

  it("aplica descuento de ticket y expone bruto/descuento", () => {
    const r = confirma({ descuentoTicket: { tipo: "monto", montoCentavos: 1500n } });
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.ticket.total_centavos).toBe(8500n);
    expect(r.ticket.total_bruto_centavos).toBe(10000n);
    expect(r.ticket.total_descuento_centavos).toBe(1500n);
    expect(r.ticket.ingresaACaja).toBe(true);
  });

  it("descuento inválido es 422 sin romper la firma", () => {
    expect(confirma({ descuentoTicket: { tipo: "monto", montoCentavos: 99_999n } })).toMatchObject({
      status: 422,
    });
  });

  it("esAcuenta marca pago e ingresaACaja false", () => {
    const r = confirma({ esAcuenta: true });
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.ticket.pago).toBe("Pago: A cuenta");
    expect(r.ticket.ingresaACaja).toBe(false);
  });

  it("venta normal sigue con ingresaACaja true (compat)", () => {
    const r = confirma({});
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.ticket.pago).toBeUndefined();
    expect(r.ticket.ingresaACaja).toBe(true);
  });
});
