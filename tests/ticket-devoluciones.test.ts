import { describe, expect, it } from "vitest";
import { derivar_balance } from "../src/modules/cash/caja.js";
import { registrar_ajuste } from "../src/modules/credit/fiado.js";
import type { MovimientoCredito } from "../src/modules/credit/saldos.js";
import {
  buscar_por_numero,
  registrar_devolucion,
  siguiente_numero_devolucion,
  type DevolucionEmitida,
  type DevolucionInput,
} from "../src/modules/sales/devoluciones.js";
import { corregir_medio, type CorreccionOk } from "../src/modules/sales/correccion_medio.js";
import { LEYENDA_NO_FISCAL } from "../src/modules/sales/vender_mostrador.js";
import type { Sku } from "../src/modules/inventario/inventario.js";

const sku = (s: string) => s as Sku;

function devBase(over: Partial<DevolucionInput> = {}): DevolucionInput {
  return {
    idempotencyKey: "dev-" + Math.random().toString(36).slice(2),
    saleId: "sale-1",
    ventaTotalCentavos: 15000n,
    acumuladoPrevioCentavos: 0n,
    montoCentavos: 5000n,
    items: [{ sku: sku("YERBA"), cantidad: 1 }],
    medio: "Efectivo",
    fueAcuenta: false,
    motivo: "producto fallado",
    actor: "duena",
    ultimoDevolucion: null,
    vistos: new Map<string, DevolucionEmitida>(),
    ...over,
  };
}

describe("TV13 devolución parcial", () => {
  it("emite con correlativo propio D-, vínculo a venta y leyenda", () => {
    const r = registrar_devolucion(devBase({ idempotencyKey: "dev-1" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.devolucion.numero).toBe("D-000001");
    expect(r.efecto.devolucion.numero.startsWith("D-")).toBe(true);
    expect(r.efecto.devolucion.saleId).toBe("sale-1");
    expect(r.efecto.devolucion.montoCentavos).toBe(5000n);
    expect(r.efecto.devolucion.leyenda).toBe(LEYENDA_NO_FISCAL);
    expect(r.efecto.vistoARegistrar.key).toBe("dev-1");
  });

  it("correlativo propio no reutiliza el T- de la venta", () => {
    expect(siguiente_numero_devolucion(null)).toBe("D-000001");
    expect(siguiente_numero_devolucion({ n: 41 })).toBe("D-000042");
  });

  it("stock inverso COMPENSATORIO + caja opuesta al egreso", () => {
    const r = registrar_devolucion(devBase({}));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.movimientosStock).toHaveLength(1);
    expect(r.efecto.movimientosStock[0]).toMatchObject({
      sku: "YERBA",
      delta: 1,
      tipo: "COMPENSATORIO",
    });
    expect(r.efecto.movimientoCaja).toMatchObject({
      tipo: "ingreso",
      origen: "devolucion",
      metodo: "Efectivo",
      monto_centavos: 5000n,
    });
    expect(r.efecto.ingresaACaja).toBe(true);
    expect(r.efecto.credito).toBeNull();
    expect(r.efecto.auditoria).toMatchObject({ accion: "devolucion", saleId: "sale-1", actor: "duena" });
  });

  it("el compensatorio anula parcial en el balance derivado", () => {
    const r = registrar_devolucion(devBase({}));
    expect(r.ok).toBe(true);
    if (!r.ok || !r.efecto.movimientoCaja) return;
    const b = derivar_balance([
      { tipo: "egreso", metodo: "Efectivo", monto_centavos: 15000n, origen: "venta" },
      r.efecto.movimientoCaja,
    ]);
    expect(b.porMedio["Efectivo"]).toBe(-10000n);
    expect(b.total).toBe(-10000n);
  });

  it("doble toque con misma key es 409 con el original (E3)", () => {
    const vistos = new Map<string, DevolucionEmitida>();
    const r1 = registrar_devolucion(devBase({ idempotencyKey: "dev-doble", vistos }));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    vistos.set("dev-doble", r1.efecto.devolucion);
    const r2 = registrar_devolucion(devBase({ idempotencyKey: "dev-doble", vistos }));
    expect(r2).toMatchObject({ ok: false, codigo: "YA_VISTA", status: 409 });
    if (r2.ok || r2.codigo !== "YA_VISTA") return;
    expect(r2.original.numero).toBe("D-000001");
  });
});

describe("TV13 tope acumulado C14/E4", () => {
  it("acumulado + monto sobre el total es 422 con el acumulado vigente", () => {
    const r = registrar_devolucion(
      devBase({ acumuladoPrevioCentavos: 12000n, montoCentavos: 5000n }),
    );
    expect(r).toMatchObject({
      ok: false,
      codigo: "TOPE_EXCEDIDO",
      status: 422,
      acumuladoCentavos: 12000n,
      ventaTotalCentavos: 15000n,
    });
  });

  it("devolución total exacta pasa; lo siguiente excede", () => {
    const total = registrar_devolucion(devBase({ idempotencyKey: "dev-t", montoCentavos: 15000n }));
    expect(total.ok).toBe(true);
    const pasada = registrar_devolucion(
      devBase({ idempotencyKey: "dev-t2", acumuladoPrevioCentavos: 15000n, montoCentavos: 1n }),
    );
    expect(pasada).toMatchObject({ ok: false, codigo: "TOPE_EXCEDIDO", status: 422 });
  });

  it("parciales encadenados respetan el tope", () => {
    const r1 = registrar_devolucion(devBase({ idempotencyKey: "dev-p1", montoCentavos: 5000n }));
    expect(r1.ok).toBe(true);
    const r2 = registrar_devolucion(
      devBase({ idempotencyKey: "dev-p2", acumuladoPrevioCentavos: 5000n, montoCentavos: 10000n }),
    );
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.efecto.devolucion.montoCentavos).toBe(10000n);
  });
});

describe("TV13 devolución sobre venta A cuenta (Lane B, sin tocar fiado.ts)", () => {
  it("sin caja que oponer: movimientoCaja null + descriptor de haber", () => {
    const r = registrar_devolucion(
      devBase({ fueAcuenta: true, customerId: "cli-1", medio: "Efectivo" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.movimientoCaja).toBeNull();
    expect(r.efecto.ingresaACaja).toBe(false);
    expect(r.efecto.credito).toMatchObject({ customerId: "cli-1", haberCentavos: 5000n, saleId: "sale-1" });
    // El stock inverso existe igual: la mercadería vuelve.
    expect(r.efecto.movimientosStock).toHaveLength(1);
  });

  it("el descriptor integra con registrar_ajuste tipo devolucion (empleado ok)", () => {
    const r = registrar_devolucion(devBase({ fueAcuenta: true, customerId: "cli-1" }));
    expect(r.ok).toBe(true);
    if (!r.ok || !r.efecto.credito) return;
    const aj = registrar_ajuste({
      idempotencyKey: "dev-cred-1",
      customerId: r.efecto.credito.customerId,
      tipo: "devolucion",
      montoCentavos: r.efecto.credito.haberCentavos,
      motivo: r.efecto.credito.motivo,
      rol: "empleado",
      ahoraMs: 1_789_000_000_000,
      vistos: new Map<string, MovimientoCredito>(),
      saleId: r.efecto.credito.saleId,
    });
    expect(aj.ok).toBe(true);
    if (!aj.ok) return;
    expect(aj.movimiento).toMatchObject({ tipo: "devolucion", haberCentavos: 5000n });
  });

  it("A cuenta sin customerId es 422", () => {
    expect(registrar_devolucion(devBase({ fueAcuenta: true }))).toMatchObject({
      ok: false,
      codigo: "DEVOLUCION_INVALIDA",
      status: 422,
    });
  });
});

describe("TV13 validaciones", () => {
  it("monto cero, motivo vacío, sin ítems y cantidad inválida son 422", () => {
    expect(registrar_devolucion(devBase({ montoCentavos: 0n }))).toMatchObject({ status: 422 });
    expect(registrar_devolucion(devBase({ motivo: "   " }))).toMatchObject({ status: 422 });
    expect(registrar_devolucion(devBase({ items: [] }))).toMatchObject({ status: 422 });
    expect(registrar_devolucion(devBase({ items: [{ sku: sku("X"), cantidad: 0 }] }))).toMatchObject({
      status: 422,
    });
    expect(registrar_devolucion(devBase({ actor: "" }))).toMatchObject({ status: 422 });
  });
});

describe("TV14 corrección de medio auditada P1 (pura + log, sin ruta)", () => {
  function corrBase(over: Partial<Parameters<typeof corregir_medio>[0]> = {}) {
    return {
      idempotencyKey: "corr-" + Math.random().toString(36).slice(2),
      saleId: "sale-1",
      medioOriginal: "Efectivo",
      medioNuevo: "Transferencia",
      motivo: "cobrado en efectivo por error, fue transferencia",
      actor: "duena",
      vistos: new Map<string, CorreccionOk>(),
      ...over,
    };
  }

  it("corrige con antes/después, motivo y leyenda (201)", () => {
    const r = corregir_medio(corrBase({ idempotencyKey: "corr-1" }));
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.correccion).toMatchObject({
      saleId: "sale-1",
      medioOriginal: "Efectivo",
      medioNuevo: "Transferencia",
      leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA",
    });
    expect(r.auditoria).toMatchObject({
      accion: "correccion_medio",
      antes: "Efectivo",
      despues: "Transferencia",
      actor: "duena",
    });
  });

  it("misma key es 409 con la original", () => {
    const vistos = new Map<string, CorreccionOk>();
    const r1 = corregir_medio(corrBase({ idempotencyKey: "corr-doble", vistos }));
    expect(r1.status).toBe(201);
    if (r1.status !== 201) return;
    vistos.set("corr-doble", r1);
    expect(corregir_medio(corrBase({ idempotencyKey: "corr-doble", vistos }))).toMatchObject({
      status: 409,
    });
  });

  it("mismo medio, medio inválido, motivo/actor vacíos son 422", () => {
    expect(corregir_medio(corrBase({ medioNuevo: "Efectivo" }))).toMatchObject({
      status: 422,
    });
    expect(corregir_medio(corrBase({ medioNuevo: "Bitcoin" }))).toMatchObject({ status: 422 });
    expect(corregir_medio(corrBase({ motivo: "  " }))).toMatchObject({ status: 422 });
    expect(corregir_medio(corrBase({ actor: "" }))).toMatchObject({ status: 422 });
  });
});

describe("TV8 historial por definitivo, provisorio o alias", () => {
  const tickets = [
    { definitivo: "T-000001", provisorio: "caja-01-1" },
    { definitivo: null, provisorio: "caja-02-7" },
  ];

  it("resuelve por definitivo y por provisorio alias", () => {
    expect(buscar_por_numero(tickets, "T-000001")).toMatchObject({ provisorio: "caja-01-1" });
    expect(buscar_por_numero(tickets, "caja-01-1")).toMatchObject({ definitivo: "T-000001" });
    expect(buscar_por_numero(tickets, "caja-02-7")).toMatchObject({ definitivo: null });
  });

  it("E6: el provisorio sigue resolviendo tras promover a definitivo", () => {
    const promovido = [{ definitivo: "T-000042", provisorio: "movil-03-9" }];
    expect(buscar_por_numero(promovido, "movil-03-9")).toMatchObject({ definitivo: "T-000042" });
    expect(buscar_por_numero(promovido, "T-000042")).toMatchObject({ provisorio: "movil-03-9" });
  });

  it("ausente => null, vacío => null", () => {
    expect(buscar_por_numero(tickets, "T-999999")).toBeNull();
    expect(buscar_por_numero(tickets, "   ")).toBeNull();
  });
});
