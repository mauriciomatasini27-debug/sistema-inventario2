import { describe, expect, it } from "vitest";
import { preparar_orden, type PaymentOrder } from "../src/modules/payments/ordenes.js";
import type { Payee } from "../src/modules/payments/beneficiarios.js";
import type { FacturaServicio } from "../src/modules/utilities/facturas_servicios.js";
import {
  aplicar_pago_orden,
  aplicar_pago_servicio,
  tiendas_ya_pague,
} from "../src/modules/pagos-tx/aplicar-ya-pague.js";

const CBU_OK = "0000001700000000000017";
const CUIT_OK = "30000000007";

function facturaBase(over: Partial<FacturaServicio> = {}): FacturaServicio {
  return {
    id: "f-luz-1",
    accountId: "c-luz",
    messageId: "m-luz-1",
    periodo: "2026-10",
    vencimiento: "2026-10-20",
    montoCentavos: 4_800_000n,
    estado: "pendiente",
    necesitaRevision: false,
    origen: "pdf_digital",
    confianzaMonto: "alta",
    confianzaVencimiento: "alta",
    ...over,
  };
}

function payeeBase(): Payee {
  return {
    id: "pay-1",
    nombre: "Distribuidora X SRL",
    tipo: "proveedor",
    medioPreferido: "Transferencia",
    alias: "distri.x.pagos",
    cbu: CBU_OK,
    cuit: CUIT_OK,
    activo: true,
  };
}

function ordenPreparada(tiendas: ReturnType<typeof tiendas_ya_pague>): PaymentOrder {
  const payee = payeeBase();
  const r = preparar_orden({
    id: "ord-1",
    idempotencyKey: "ord-key-1",
    numero: "OP-0042",
    payeeId: payee.id,
    payees: new Map([[payee.id, payee]]),
    concepto: "Factura A 0003-00012345",
    montoCentavos: 18250000n,
    venceElMs: Date.UTC(2026, 9, 31),
    medioSugerido: "Transferencia",
    instruccion: "transferencia",
    creadoPor: "dueno-1",
    origen: "bot",
    ahoraMs: Date.UTC(2026, 9, 28),
    vistos: new Map(),
  });
  if (!r.ok) throw new Error("setup falló");
  tiendas.ordenes.set("ord-1", r.orden);
  return r.orden;
}

describe("ya pagué tx: servicio (CS5.4)", () => {
  it("aplica factura pagada + 1 egreso gasto_operativo en un paso", () => {
    const t = tiendas_ya_pague();
    t.facturas.set("f-luz-1", facturaBase());
    const r = aplicar_pago_servicio(t, {
      idempotencyKey: "pago-luz-1",
      facturaId: "f-luz-1",
      servicio: "luz",
      proveedor: "Edenor",
      numeroCuenta: "12345",
      medio: "Transferencia",
    });
    expect(r.status).toBe(200);
    expect(t.facturas.get("f-luz-1")?.estado).toBe("pagada");
    expect(t.egresos).toHaveLength(1);
    expect(t.egresos[0]).toMatchObject({
      refTipo: "servicio",
      refId: "f-luz-1",
      idempotencyKey: "pago-luz-1",
    });
    expect(t.egresos[0]?.movimiento.monto_centavos).toBe(4_800_000n);
    expect(t.egresos[0]?.movimiento.tipo_retiro).toBe("gasto_operativo");
  });

  it("doble toque misma key es 409 sin segundo egreso", () => {
    const t = tiendas_ya_pague();
    t.facturas.set("f-luz-1", facturaBase());
    const base = {
      idempotencyKey: "pago-luz-1",
      facturaId: "f-luz-1",
      servicio: "luz" as const,
      proveedor: "Edenor",
      numeroCuenta: "12345",
      medio: "Transferencia" as const,
    };
    expect(aplicar_pago_servicio(t, base).status).toBe(200);
    expect(aplicar_pago_servicio(t, base)).toMatchObject({ status: 409 });
    expect(t.egresos).toHaveLength(1);
  });
});

describe("ya pagué tx: órdenes (OP9)", () => {
  it("confirma orden + 1 egreso en un paso", () => {
    const t = tiendas_ya_pague();
    ordenPreparada(t);
    const r = aplicar_pago_orden(t, {
      idempotencyKey: "pago-op-1",
      ordenId: "ord-1",
      versionEsperada: 1,
      medio: "Transferencia",
      rol: "dueno",
      actor: "dueno-1",
      origen: "bot",
      ahoraMs: Date.UTC(2026, 9, 29),
    });
    expect(r.status).toBe(200);
    expect(t.ordenes.get("ord-1")?.estado).toBe("pagada");
    expect(t.egresos).toHaveLength(1);
    expect(t.egresos[0]).toMatchObject({ refTipo: "orden", refId: "ord-1" });
  });

  it("doble toque misma key es 409 con un solo egreso", () => {
    const t = tiendas_ya_pague();
    ordenPreparada(t);
    const base = {
      idempotencyKey: "pago-op-1",
      ordenId: "ord-1",
      versionEsperada: 1,
      medio: "Transferencia" as const,
      rol: "dueno" as const,
      actor: "dueno-1",
      origen: "bot" as const,
      ahoraMs: Date.UTC(2026, 9, 29),
    };
    expect(aplicar_pago_orden(t, base).status).toBe(200);
    expect(aplicar_pago_orden(t, base)).toMatchObject({ status: 409 });
    expect(t.egresos).toHaveLength(1);
  });

  it("versión vieja es 409 sin egreso ni cambio de estado", () => {
    const t = tiendas_ya_pague();
    ordenPreparada(t);
    const r = aplicar_pago_orden(t, {
      idempotencyKey: "pago-op-vieja",
      ordenId: "ord-1",
      versionEsperada: 0,
      medio: "Transferencia",
      rol: "dueno",
      actor: "dueno-1",
      origen: "bot",
      ahoraMs: Date.UTC(2026, 9, 29),
    });
    expect(r).toMatchObject({ status: 409 });
    expect(t.egresos).toHaveLength(0);
    expect(t.ordenes.get("ord-1")?.estado).toBe("preparada");
  });

  it("empleado es 403 sin egreso, la orden sigue preparada", () => {
    const t = tiendas_ya_pague();
    ordenPreparada(t);
    const r = aplicar_pago_orden(t, {
      idempotencyKey: "pago-op-emp",
      ordenId: "ord-1",
      versionEsperada: 1,
      medio: "Transferencia",
      rol: "empleado",
      actor: "emp-1",
      origen: "bot",
      ahoraMs: Date.UTC(2026, 9, 29),
    });
    expect(r).toMatchObject({ status: 403 });
    expect(t.egresos).toHaveLength(0);
    expect(t.ordenes.get("ord-1")?.estado).toBe("preparada");
  });

  it("orden inexistente es 422 sin egreso", () => {
    const t = tiendas_ya_pague();
    const r = aplicar_pago_orden(t, {
      idempotencyKey: "pago-op-no",
      ordenId: "ord-no",
      versionEsperada: 1,
      medio: "Transferencia",
      rol: "dueno",
      actor: "dueno-1",
      origen: "bot",
      ahoraMs: Date.UTC(2026, 9, 29),
    });
    expect(r).toMatchObject({ status: 422 });
    expect(t.egresos).toHaveLength(0);
  });
});
