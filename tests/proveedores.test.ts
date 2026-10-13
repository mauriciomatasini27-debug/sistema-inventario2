import { describe, expect, it } from "vitest";
import {
  anularFacturaConCompensatorio,
  confirmarBorrador,
  descartarBorrador,
  descriptoresCosto,
  editarBorrador,
  estadoBorrador,
  estadoCuenta,
  ingerirBorrador,
  parseFechaAR,
  parseMontoAR,
  registrarPago,
  saldoFactura,
  verificarSumaItems,
  type Borrador,
  type Factura,
  type PagoProveedor,
} from "../src/modules/purchases/facturas.js";
import {
  cerrarOrden,
  crearOrden,
  crearSupplier,
  editarOrden,
  editarSupplier,
  validarCuit,
  type PurchaseOrder,
  type Supplier,
} from "../src/modules/purchases/proveedores.js";

const AHORA = "2026-10-10T12:00:00.000-03:00";
// +8 días: supera el vencimiento de 7 días (E5).
const VENCIDO = "2026-10-18T12:00:01.000-03:00";
const CUIT = "30-12345678-1";
const CUIT_OTRO = "20-00000000-1";

function ingestaBase(over: Partial<Parameters<typeof ingerirBorrador>[0]> = {}) {
  return {
    idempotencyKey: "wamid-1",
    origen: "wa" as const,
    bytesRef: "wa-bytes-1",
    esComprobante: true,
    cuitTexto: CUIT,
    nombreProveedor: "Distribuidora Sur",
    fechaTexto: "10/10/2026",
    totalTexto: "164.800,00",
    ahoraIso: AHORA,
    vistos: new Map<string, Borrador>(),
    ...over,
  };
}

describe("CUIT dígito verificador", () => {
  it("acepta válido con guiones y rechaza dígito erróneo", () => {
    expect(validarCuit("30-12345678-1")).toBe(true);
    expect(validarCuit("30123456781")).toBe(true);
    expect(validarCuit("30-12345678-2")).toBe(false);
    expect(validarCuit("123")).toBe(false);
  });
});

describe("suppliers + purchase_orders", () => {
  it("crea proveedor y el duplicado devuelve 409 con original", () => {
    const creados = new Map<string, Supplier>();
    const r1 = crearSupplier({ cuit: CUIT, nombre: "Distribuidora Sur", ahoraIso: AHORA, creados });
    expect(r1.status).toBe(201);
    if (r1.status !== 201) return;
    creados.set(r1.supplier.cuit, r1.supplier);
    expect(Object.isFrozen(r1.supplier)).toBe(true);
    const r2 = crearSupplier({ cuit: "30.12345678.1", nombre: "Otro nombre", ahoraIso: AHORA, creados });
    expect(r2.status).toBe(409);
  });

  it("cuit inválido 422 y editar valida nombre", () => {
    expect(
      crearSupplier({ cuit: "30-12345678-2", nombre: "X", ahoraIso: AHORA, creados: new Map() }),
    ).toMatchObject({ status: 422 });
    const ok = crearSupplier({ cuit: CUIT, nombre: "Sur", ahoraIso: AHORA, creados: new Map() });
    if (ok.status !== 201) return;
    expect(editarSupplier(ok.supplier, { nombre: " " }, AHORA)).toMatchObject({ ok: false });
    const ed = editarSupplier(ok.supplier, { nombre: "Sur SRL" }, AHORA);
    expect(ed.ok).toBe(true);
    if (!ed.ok) return;
    expect(ed.supplier.nombre).toBe("Sur SRL");
    expect(ok.supplier.nombre).toBe("Sur");
  });

  it("OC: crea con total = suma, retry 409, editar/cerrar", () => {
    const vistos = new Map<string, PurchaseOrder>();
    const lineas = [
      { sku: "YERBA", qty: 10, costoCentavos: 100_000n },
      { sku: "AZUCAR", qty: 5, costoCentavos: 50_000n },
    ] as const;
    const input = {
      idempotencyKey: "oc-1",
      supplierCuit: CUIT,
      lineas: [...lineas],
      creadoPor: "dueno-1",
      ahoraIso: AHORA,
      vistos,
    };
    const r1 = crearOrden(input);
    expect(r1.status).toBe(201);
    if (r1.status !== 201) return;
    expect(r1.orden.totalCentavos).toBe(10n * 100_000n + 5n * 50_000n);
    vistos.set("oc-1", r1.orden);
    expect(crearOrden(input).status).toBe(409);
    expect(crearOrden({ ...input, creadoPor: "otro" })).toMatchObject({
      status: 409,
      error: expect.stringMatching(/distinto cuerpo/),
    });
    const ed = editarOrden(r1.orden, [{ sku: "YERBA", qty: 2, costoCentavos: 100_000n }], AHORA);
    expect(ed.ok).toBe(true);
    if (!ed.ok) return;
    expect(ed.orden.totalCentavos).toBe(200_000n);
    const ce = cerrarOrden(ed.orden, "dueno-1", AHORA);
    expect(ce.ok).toBe(true);
    if (!ce.ok) return;
    expect(ce.orden.estado).toBe("cerrada");
    expect(editarOrden(ce.orden, [{ sku: "X", qty: 1, costoCentavos: 1n }], AHORA)).toMatchObject({
      ok: false,
    });
    expect(cerrarOrden(ce.orden, "dueno-1", AHORA)).toMatchObject({ ok: false });
  });
});

describe("normalización AR", () => {
  it("montos punto-miles coma-decimal a centavos", () => {
    expect(parseMontoAR("164.800,00")).toBe(16_480_000n);
    expect(parseMontoAR("1.234,50")).toBe(123_450n);
    expect(parseMontoAR("500")).toBe(50_000n);
    expect(() => parseMontoAR("abc")).toThrow();
    expect(() => parseMontoAR("-100,00")).toThrow();
  });

  it("fechas dd/mm/aaaa a ISO, inexistentes rechazan", () => {
    expect(parseFechaAR("10/10/2026")).toBe("2026-10-10");
    expect(() => parseFechaAR("31/02/2026")).toThrow();
    expect(() => parseFechaAR("2026-10-10")).toThrow();
  });

  it("suma ítems vs total tolera 1%", () => {
    const items = [{ sku: null, cantidad: 1, subtotalCentavos: 16_400_000n }];
    expect(verificarSumaItems(items, 16_480_000n).ok).toBe(true);
    expect(
      verificarSumaItems([{ sku: null, cantidad: 1, subtotalCentavos: 10_000n }], 16_480_000n).ok,
    ).toBe(false);
  });
});

describe("borrador OCR: ingesta → editar → confirmar/descartar", () => {
  it("ingesta crea borrador que vence en 7 días y NO registra factura", () => {
    const r = ingerirBorrador(ingestaBase());
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.borrador.estado).toBe("pendiente");
    expect(r.borrador.facturaId).toBeNull();
    expect(r.borrador.totalCentavos).toBe(16_480_000n);
    expect(r.borrador.venceAt).toBe(
      new Date(Date.parse(AHORA) + 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(Object.isFrozen(r.borrador)).toBe(true);
  });

  it("E2: misma clave (wamid) devuelve 200 con existente sin reprocesar", () => {
    const vistos = new Map<string, Borrador>();
    const r1 = ingerirBorrador(ingestaBase({ vistos }));
    expect(r1.status).toBe(201);
    if (r1.status !== 201) return;
    vistos.set("wamid-1", r1.borrador);
    const r2 = ingerirBorrador(ingestaBase({ vistos, totalTexto: "99,00" }));
    expect(r2.status).toBe(200);
    if (r2.status !== 200) return;
    expect(r2.duplicado).toBe(true);
    expect(r2.borrador.totalCentavos).toBe(16_480_000n);
    expect(vistos.size).toBe(1);
  });

  it("E3: adjunto no comprobante 415 sin crear borrador", () => {
    expect(ingerirBorrador(ingestaBase({ esComprobante: false }))).toMatchObject({ status: 415 });
  });

  it("E1: confianza baja en monto bloquea confirmar 422; editar habilita", () => {
    const r = ingerirBorrador(
      ingestaBase({ idempotencyKey: "w-baja", totalTexto: "ilegible!!!" }),
    );
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.borrador.confianza.total).toBe("baja");
    expect(confirmarBorrador(r.borrador, { quien: "dueno-1", ahoraIso: AHORA })).toMatchObject({
      status: 422,
    });
    const ed = editarBorrador(r.borrador, { totalTexto: "164.800,00" }, AHORA);
    expect(ed.status).toBe(200);
    if (ed.status !== 200) return;
    expect(ed.borrador.confianza.total).toBe("alta");
    const cf = confirmarBorrador(ed.borrador, { quien: "dueno-1", ahoraIso: AHORA });
    expect(cf.status).toBe(201);
    if (cf.status !== 201) return;
    expect(cf.factura.totalCentavos).toBe(16_480_000n);
    expect(cf.borrador.estado).toBe("confirmada");
    expect(Object.isFrozen(cf.factura)).toBe(true);
  });

  it("confirmar dos veces 409; descartado no confirma 409", () => {
    const r = ingerirBorrador(ingestaBase({ idempotencyKey: "w-409" }));
    if (r.status !== 201) return;
    const c1 = confirmarBorrador(r.borrador, { quien: "dueno-1", ahoraIso: AHORA });
    expect(c1.status).toBe(201);
    if (c1.status !== 201) return;
    expect(confirmarBorrador(c1.borrador, { quien: "dueno-1", ahoraIso: AHORA })).toMatchObject({
      status: 409,
    });
    const d = ingerirBorrador(ingestaBase({ idempotencyKey: "w-desc" }));
    if (d.status !== 201) return;
    const dd = descartarBorrador(d.borrador, AHORA);
    expect(dd.status).toBe(200);
    if (dd.status !== 200) return;
    expect(confirmarBorrador(dd.borrador, { quien: "dueno-1", ahoraIso: AHORA })).toMatchObject({
      status: 409,
    });
    expect(editarBorrador(dd.borrador, { totalTexto: "1,00" }, AHORA)).toMatchObject({
      status: 409,
    });
  });

  it("E5: vencido bloquea confirmar/editar/descartar 410", () => {
    const r = ingerirBorrador(ingestaBase({ idempotencyKey: "w-venc" }));
    if (r.status !== 201) return;
    expect(estadoBorrador(r.borrador, VENCIDO)).toBe("vencida");
    expect(confirmarBorrador(r.borrador, { quien: "dueno-1", ahoraIso: VENCIDO })).toMatchObject({
      status: 410,
    });
    expect(editarBorrador(r.borrador, { totalTexto: "1,00" }, VENCIDO)).toMatchObject({
      status: 410,
    });
    expect(descartarBorrador(r.borrador, VENCIDO)).toMatchObject({ status: 410 });
  });

  it("suma ítems fuera de 1% bloquea confirmar 422", () => {
    const r = ingerirBorrador(
      ingestaBase({
        idempotencyKey: "w-suma",
        items: [{ sku: null, cantidad: 1, subtotalCentavos: 1_000n }],
      }),
    );
    if (r.status !== 201) return;
    expect(confirmarBorrador(r.borrador, { quien: "dueno-1", ahoraIso: AHORA })).toMatchObject({
      status: 422,
    });
  });
});

describe("factura inmutable + compensatorio", () => {
  function facturaLista(idKey: string): Factura {
    const r = ingerirBorrador(ingestaBase({ idempotencyKey: idKey }));
    if (r.status !== 201) throw new Error("ingesta falló");
    const c = confirmarBorrador(r.borrador, { quien: "dueno-1", ahoraIso: AHORA });
    if (c.status !== 201) throw new Error("confirmación falló");
    return c.factura;
  }

  it("no hay editor: el tipo no expone mutación y anular crea nota sin tocar original", () => {
    const f = facturaLista("w-nc");
    const vistos = new Map<string, Factura>();
    const a = anularFacturaConCompensatorio(f, {
      idempotencyKey: "nc-1",
      motivo: "error carga",
      quien: "dueno-1",
      ahoraIso: AHORA,
      vistos,
      compensadas: new Set(),
    });
    expect(a.status).toBe(201);
    if (a.status !== 201) return;
    expect(a.compensatorio.tipo).toBe("nota_credito");
    expect(a.compensatorio.compensatoriaDe).toBe(f.id);
    expect(a.compensatorio.totalCentavos).toBe(f.totalCentavos);
    expect(f.tipo).toBe("factura");
    vistos.set("nc-1", a.compensatorio);
    expect(
      anularFacturaConCompensatorio(f, {
        idempotencyKey: "nc-2",
        motivo: "otra",
        quien: "dueno-1",
        ahoraIso: AHORA,
        vistos,
        compensadas: new Set([f.id]),
      }),
    ).toMatchObject({ status: 409 });
  });
});

describe("pagos a proveedor + descriptor caja", () => {
  function facturaLista(idKey: string): Factura {
    const r = ingerirBorrador(ingestaBase({ idempotencyKey: idKey }));
    if (r.status !== 201) throw new Error("ingesta falló");
    const c = confirmarBorrador(r.borrador, { quien: "dueno-1", ahoraIso: AHORA });
    if (c.status !== 201) throw new Error("confirmación falló");
    return c.factura;
  }

  it("registra pago con descriptor egreso y descuenta saldo; exceso 422; retry 409", () => {
    const f = facturaLista("w-pago");
    const vistos = new Map<string, PagoProveedor>();
    const base = {
      factura: f,
      supplierCuit: CUIT,
      montoCentavos: 6_480_000n,
      metodo: "Transferencia" as const,
      fechaIso: "2026-10-10",
      creadoPor: "dueno-1",
      ahoraIso: AHORA,
      vistos,
      pagosPrevios: [] as PagoProveedor[],
    };
    const p1 = registrarPago({ ...base, idempotencyKey: "pag-1" });
    expect(p1.status).toBe(201);
    if (p1.status !== 201) return;
    expect(p1.egresoCaja).toMatchObject({
      tipo: "egreso",
      categoriaId: "pago_proveedor",
      montoCentavos: 6_480_000n,
    });
    expect(Object.keys(p1.egresoCaja).join(",")).not.toMatch(/origen|cash_movements/i);
    vistos.set("pag-1", p1.pago);
    expect(saldoFactura(f, [p1.pago])).toBe(10_000_000n);
    expect(registrarPago({ ...base, idempotencyKey: "pag-1" }).status).toBe(409);
    expect(
      registrarPago({
        ...base,
        idempotencyKey: "pag-2",
        montoCentavos: 10_000_001n,
        pagosPrevios: [p1.pago],
      }),
    ).toMatchObject({ status: 422 });
    const cta = estadoCuenta(CUIT, [f], [p1.pago]);
    expect(cta).toMatchObject({
      totalFacturadoCentavos: 16_480_000n,
      totalPagadoCentavos: 6_480_000n,
      saldoCentavos: 10_000_000n,
    });
    expect(registrarPago({ ...base, idempotencyKey: "pag-x", supplierCuit: CUIT_OTRO })).toMatchObject(
      { status: 422 },
    );
  });
});

describe("descriptores de costo para Lane C", () => {
  it("ítem con sku genera costo unitario; sin sku se omite", () => {
    const f: Factura = {
      id: "fac-x",
      idempotencyKey: "x",
      draftId: "borr-x",
      supplierCuit: "30123456781",
      nombreProveedor: null,
      tipo: "factura",
      fechaIso: "2026-10-10",
      totalCentavos: 20_000n,
      items: [
        { sku: "YERBA", cantidad: 10, subtotalCentavos: 15_000n },
        { sku: null, cantidad: 1, subtotalCentavos: 5_000n },
      ],
      compensatoriaDe: null,
      creadoPor: "dueno-1",
      creadoEn: AHORA,
    };
    const d = descriptoresCosto(f);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ sku: "YERBA", costoCentavos: 1_500n });
    expect(d[0]?.motivo).toMatch(/fac-x/);
  });
});
