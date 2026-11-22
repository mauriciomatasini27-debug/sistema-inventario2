import { type Sku } from "../inventario/inventario.js";
import { lotesDesdeStockGenerico } from "../inventario/lote-generico.js";
import { derivar_balance } from "../cash/caja.js";
import { vender_mostrador, PAGO_A_CUENTA, type TicketDefinitivo, type TicketEmitido } from "./vender_mostrador.js";
import type { DescuentoSpec } from "./descuentos.js";

export interface LineaVenta {
  product_id: string;
  qty: number;
  precio_centavos: bigint;
}

export interface ConfirmarVentaInput {
  idempotencyKey: string;
  lineas: LineaVenta[];
  medio: import("../../lib/validation.js").Medio;
  device_code: string;
  seq_local: number;
  offline: boolean;
  stockDisponible: Map<string, number>;
  vistos: Map<string, ConfirmarVentaOk>;
  proximoDefinitivo: () => string;
  clientOccurredAt: string;
  /** TV4 (aditivo): specs por línea y de ticket, igual que vender_mostrador. */
  descuentosLinea?: ReadonlyArray<DescuentoSpec | null | undefined> | undefined;
  descuentoTicket?: DescuentoSpec | null | undefined;
  /** TV5.8 (aditivo): true => "Pago: A cuenta", sin ingreso a caja (C18). */
  esAcuenta?: boolean | undefined;
}

export interface TicketResult {
  ticket_definitivo: string | null;
  ticket_provisorio: string;
  total_centavos: bigint;
  sobreventa: boolean;
  egreso: { metodo: import("../../lib/validation.js").Medio; monto_centavos: bigint; origen: "venta" };
  balance: { total: bigint };
  /** TV5.8 (aditivo): presente solo cuando esAcuenta. */
  pago?: typeof PAGO_A_CUENTA | undefined;
  /** TV4 (aditivo): bruto y descuento en el mismo formato que el total. */
  total_bruto_centavos?: bigint | undefined;
  total_descuento_centavos?: bigint | undefined;
  /** C18 (aditivo): false cuando esAcuenta (no persistir el egreso). */
  ingresaACaja?: boolean | undefined;
}

export interface ConfirmarVentaOk {
  status: 201;
  ticket: TicketResult;
}

export type ConfirmarVentaResult =
  | ConfirmarVentaOk
  | { status: 409; error: string; original?: ConfirmarVentaOk }
  | { status: 422; error: string };

// Shim sobre vender_mostrador (único dueño del orden idempotencia→FEFO→
// número→egreso). Mantiene la firma para los callers existentes.
// `proximoDefinitivo` ("T-000129") se invierte a último emitido (n-1) porque
// el numerador puro trabaja con último, no con siguiente.
export function confirmar_venta(input: ConfirmarVentaInput): ConfirmarVentaResult {
  const vistos = new Map<string, TicketEmitido>(
    [...input.vistos.entries()].map(([k, v]) => [k, aEmitido(v)]),
  );
  const m = /^T-(\d+)$/.exec(input.proximoDefinitivo());
  const ultimo = m ? { n: Number.parseInt(m[1] as string, 10) - 1 } : null;

  const r = vender_mostrador({
    idempotencyKey: input.idempotencyKey,
    lineas: input.lineas.map((l) => ({ sku: l.product_id as Sku, cantidad: l.qty, precioCentavos: l.precio_centavos })),
    medio: input.medio,
    deviceCode: input.device_code,
    seqLocal: input.seq_local,
    offline: input.offline,
    lotes: lotesDesdeStockGenerico(input.stockDisponible),
    vistos,
    ultimoDefinitivo: ultimo,
    grant: { rol: "dueno" },
    ...(input.descuentosLinea !== undefined ? { descuentosLinea: input.descuentosLinea } : {}),
    ...(input.descuentoTicket != null ? { descuentoTicket: input.descuentoTicket } : {}),
    ...(input.esAcuenta !== undefined ? { esAcuenta: input.esAcuenta } : {}),
  });

  if (!r.ok) {
    if (r.codigo === "YA_VISTA") {
      // Por qué 409 siempre y no 200 en retry idéntico: el doble toque de mostrador
      // debe ser visible (E3 ADR-0004); el cliente reusa el original devuelto.
      return { status: 409, error: "idempotency-key repetida", original: aOk(r.original) };
    }
    if (r.codigo === "SIN_STOCK") {
      const pedido = input.lineas[0];
      const disp = pedido ? (input.stockDisponible.get(pedido.product_id) ?? 0) : 0;
      const detalle = pedido ? `${pedido.product_id}: pide ${pedido.qty}, hay ${disp}` : "sin stock";
      return { status: 422, error: `stock insuficiente ${detalle}` };
    }
    if (r.codigo === "DESCUENTO_INVALIDO") return { status: 422, error: "descuento invalido" };
    if (input.lineas.length === 0) return { status: 422, error: "venta vacia" };
    const primera = input.lineas[0];
    if (primera && (primera.qty <= 0 || primera.precio_centavos < 0n)) {
      return { status: 422, error: "linea invalida" };
    }
    return { status: 422, error: "linea invalida" };
  }
  const ok = aOk(r.efecto.ticket);
  input.vistos.set(input.idempotencyKey, ok);
  return ok;
}

function aEmitido(v: ConfirmarVentaOk): TicketEmitido {
  const t = v.ticket;
  if (t.ticket_definitivo) {
    return {
      kind: "online",
      definitivo: t.ticket_definitivo as TicketDefinitivo,
      provisorio: t.ticket_provisorio,
      totalCentavos: t.total_centavos,
      sobreventa: false,
      leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA",
      medio: t.egreso.metodo,
      ...(t.pago !== undefined ? { pago: t.pago } : {}),
      ...(t.total_bruto_centavos !== undefined ? { totalBrutoCentavos: t.total_bruto_centavos } : {}),
      ...(t.total_descuento_centavos !== undefined ? { totalDescuentoCentavos: t.total_descuento_centavos } : {}),
    };
  }
  return {
    kind: "offline",
    definitivo: null,
    provisorio: t.ticket_provisorio,
    totalCentavos: t.total_centavos,
    sobreventa: t.sobreventa,
    leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA",
    medio: t.egreso.metodo,
    ...(t.pago !== undefined ? { pago: t.pago } : {}),
    ...(t.total_bruto_centavos !== undefined ? { totalBrutoCentavos: t.total_bruto_centavos } : {}),
    ...(t.total_descuento_centavos !== undefined ? { totalDescuentoCentavos: t.total_descuento_centavos } : {}),
  };
}

function aOk(t: TicketEmitido): ConfirmarVentaOk {
  const egreso = {
    metodo: t.medio,
    monto_centavos: t.totalCentavos,
    origen: "venta" as const,
  };
  const balance = derivar_balance([{ tipo: "ingreso" as const, metodo: t.medio, monto_centavos: t.totalCentavos, origen: "venta" as const }]);
  return {
    status: 201,
    ticket: {
      ticket_definitivo: t.definitivo,
      ticket_provisorio: t.provisorio,
      total_centavos: t.totalCentavos,
      sobreventa: t.sobreventa,
      egreso,
      balance: { total: balance.total },
      // C18 se deriva del ticket (pago presente => A cuenta => false):
      // aOk solo ve el ticket, no el efecto; el retry YA_VISTA conserva el
      // valor original sin re-decidir.
      ...(t.pago !== undefined ? { pago: t.pago } : {}),
      ...(t.totalBrutoCentavos !== undefined ? { total_bruto_centavos: t.totalBrutoCentavos } : {}),
      ...(t.totalDescuentoCentavos !== undefined ? { total_descuento_centavos: t.totalDescuentoCentavos } : {}),
      ingresaACaja: t.pago === PAGO_A_CUENTA ? false : true,
    },
  };
}
