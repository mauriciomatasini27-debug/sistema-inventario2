// Adaptador Ya pagué -> caja en un paso atómico (CS5.4/OP9).
// Núcleo puro en memoria con la misma forma que la tx Drizzle real:
// factura/orden pagada + egreso de caja se aplican juntos o no se aplica
// nada. El REVOKE + UNIQUE parcial + lock de fila viven en migración.
// No modifica cash/, payments/ ni utilities/: solo los compone.

import type { Movimiento } from "../cash/caja.js";
import {
  pagar_servicio,
  type EgresoServicio,
  type FacturaServicio,
} from "../utilities/facturas_servicios.js";
import type { Servicio } from "../utilities/cuentas.js";
import {
  confirmar_pago,
  type ConfirmarPagoInput,
  type PagoConfirmado,
  type PaymentOrder,
} from "../payments/ordenes.js";

export interface EgresoAplicado {
  readonly id: string;
  readonly movimiento: Movimiento;
  readonly refTipo: "servicio" | "orden";
  readonly refId: string;
  readonly idempotencyKey: string;
}

export interface TiendasYaPague {
  readonly facturas: Map<string, FacturaServicio>;
  readonly ordenes: Map<string, PaymentOrder>;
  readonly egresos: EgresoAplicado[];
  readonly vistosPagos: Map<string, PagoConfirmado>;
}

export function tiendas_ya_pague(): TiendasYaPague {
  return { facturas: new Map(), ordenes: new Map(), egresos: [], vistosPagos: new Map() };
}

export type YaPagueResult =
  | { readonly status: 200; readonly egresoId: string }
  | { readonly status: 403; readonly error: string }
  | { readonly status: 409; readonly error: string }
  | { readonly status: 422; readonly error: string };

// CS5: factura de servicio pagada + egreso en un paso. Idempotente por
// idempotencyKey: el reintento devuelve 409 sin segundo egreso.
export function aplicar_pago_servicio(
  tiendas: TiendasYaPague,
  args: {
    readonly idempotencyKey: string;
    readonly facturaId: string;
    readonly servicio: Servicio;
    readonly proveedor: string;
    readonly numeroCuenta: string | null;
    readonly medio: EgresoServicio["metodo"];
    readonly notaExtra?: string;
  },
): YaPagueResult {
  if (tiendas.egresos.some((e) => e.idempotencyKey === args.idempotencyKey)) {
    return { status: 409, error: "ya pagué aplicado" };
  }
  const factura = tiendas.facturas.get(args.facturaId);
  if (!factura) return { status: 422, error: "factura inexistente" };
  const r = pagar_servicio(factura, {
    servicio: args.servicio,
    proveedor: args.proveedor,
    numeroCuenta: args.numeroCuenta,
    medio: args.medio,
    ...(args.notaExtra !== undefined ? { notaExtra: args.notaExtra } : {}),
  });
  if (r.status !== 200) return { status: r.status, error: r.error };
  // Un paso: si algo de acá lanzara, no se persiste nada (en Drizzle es una tx).
  tiendas.facturas.set(args.facturaId, r.factura);
  const id = `egreso-${args.idempotencyKey}`;
  tiendas.egresos.push({
    id,
    movimiento: {
      tipo: r.egreso.tipo,
      metodo: r.egreso.metodo,
      monto_centavos: r.egreso.monto_centavos,
      origen: r.egreso.origen,
      tipo_retiro: r.egreso.tipo_retiro,
    },
    refTipo: "servicio",
    refId: args.facturaId,
    idempotencyKey: args.idempotencyKey,
  });
  return { status: 200, egresoId: id };
}

// OP9: orden pagada + egreso en un paso. Delega reglas (roles, versión,
// terminales, nota) a confirmar_pago; acá solo la atomicidad + el egreso.
export function aplicar_pago_orden(
  tiendas: TiendasYaPague,
  input: Omit<ConfirmarPagoInput, "orden" | "vistosPagos"> & { readonly ordenId: string },
): YaPagueResult {
  if (tiendas.egresos.some((e) => e.idempotencyKey === input.idempotencyKey)) {
    return { status: 409, error: "ya pagué aplicado" };
  }
  const orden = tiendas.ordenes.get(input.ordenId);
  if (!orden) return { status: 422, error: "orden inexistente" };
  const r = confirmar_pago({ ...input, orden, vistosPagos: tiendas.vistosPagos });
  if (!r.ok) {
    if (r.status === 403) return { status: 403, error: r.error };
    if (r.codigo === "YA_VISTA") return { status: 409, error: "ya pagué aplicado" };
    if (r.codigo === "VERSION_DESACTUALIZADA") return { status: 409, error: "versión desactualizada" };
    return { status: 422, error: r.error };
  }
  tiendas.ordenes.set(input.ordenId, r.efecto.orden);
  const id = `egreso-${input.idempotencyKey}`;
  tiendas.egresos.push({
    id,
    movimiento: r.efecto.egreso,
    refTipo: "orden",
    refId: input.ordenId,
    idempotencyKey: input.idempotencyKey,
  });
  return { status: 200, egresoId: id };
}
