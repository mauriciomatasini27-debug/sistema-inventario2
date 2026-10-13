// LANE D — TV13 devoluciones + TV8 historial (ADR-0004).
//
// Núcleo puro: sin IO, sin Drizzle, sin store. La devolución es un documento
// vinculado con correlativo propio (D-000001, nunca reutiliza el T- de la
// venta) y vínculo atómico a la venta original (saleId): el adaptador persiste
// devolución + stock inverso + caja opuesta + crédito en una sola tx (TV6),
// acá se decide todo o nada.
//
// C14/E4: tope acumulado por venta. acumuladoPrevioCentavos es el SUM bajo
// FOR UPDATE que lee el adaptador; si acumulado + monto > ventaTotal => 422
// con el acumulado vigente (E4), nunca UPDATE sobre la venta.
//
// Efectos (el adaptador los aplica; acá solo se deciden):
// - stock inverso: un MovimientoStock COMPENSATORIO por ítem (delta +qty,
//   loteId null: el adaptador reintegra al lote que corresponda).
// - caja opuesta: movimiento ingreso origen "devolucion" mismo medio/monto
//   (concepto compensatorio de reversion.ts Lane A; NO usa revierte_a único
//   porque los parciales múltiples son legales hasta el tope).
// - crédito: si la venta era A cuenta (Lane B, ingresaACaja false) no hubo
//   caja que oponer: se devuelve descriptor de haber tipo "devolucion" para
//   que el adaptador lo pase a registrar_ajuste sin tocar fiado.ts.
// TV7: todo documento emitido lleva la leyenda no fiscal.
// Idempotency-Key: retry => 409 con el original (E3), igual que ventas.

import type { Medio } from "../../lib/validation.js";
import { registrar_movimiento, type Movimiento } from "../cash/caja.js";
import { LEYENDA_NO_FISCAL } from "./vender_mostrador.js";
import type { MovimientoStock, Sku } from "../inventario/inventario.js";

declare const DevolucionBrand: unique symbol;
export type NumeroDevolucion = string & { readonly [DevolucionBrand]: "NumeroDevolucion" };

export interface DevolucionSeq {
  readonly n: number;
}

/** Numerador puro propio: último → siguiente. null → D-000001. */
export function siguiente_numero_devolucion(ultimo: DevolucionSeq | null): NumeroDevolucion {
  const n = (ultimo?.n ?? 0) + 1;
  return `D-${String(n).padStart(6, "0")}` as NumeroDevolucion;
}

export interface ItemDevolucion {
  readonly sku: Sku;
  readonly cantidad: number;
}

export interface DevolucionEmitida {
  readonly numero: NumeroDevolucion;
  readonly saleId: string;
  readonly montoCentavos: bigint;
  readonly medio: Medio;
  readonly motivo: string;
  readonly actor: string;
  readonly fueAcuenta: boolean;
  readonly leyenda: typeof LEYENDA_NO_FISCAL;
}

// Haber para Lane B cuando la venta era A cuenta (el adaptador lo registra
// vía registrar_ajuste tipo "devolucion"; este módulo no importa fiado.ts
// para no crear ciclo vender→fiado→vender).
export interface CreditoDevolucion {
  readonly customerId: string;
  readonly haberCentavos: bigint;
  readonly saleId: string;
  readonly motivo: string;
}

export interface AuditoriaDevolucion {
  readonly accion: "devolucion";
  readonly devolucionId: string;
  readonly saleId: string;
  readonly actor: string;
  readonly motivo: string;
}

export interface EfectoDevolucion {
  readonly devolucion: DevolucionEmitida;
  readonly movimientosStock: ReadonlyArray<MovimientoStock>;
  readonly movimientoCaja: Movimiento | null;
  readonly ingresaACaja: boolean;
  readonly credito: CreditoDevolucion | null;
  readonly auditoria: AuditoriaDevolucion;
  readonly vistoARegistrar: { readonly key: string; readonly devolucion: DevolucionEmitida };
}

export interface DevolucionInput {
  readonly idempotencyKey: string;
  readonly saleId: string;
  readonly ventaTotalCentavos: bigint;
  readonly acumuladoPrevioCentavos: bigint;
  readonly montoCentavos: bigint;
  readonly items: ReadonlyArray<ItemDevolucion>;
  readonly medio: Medio;
  /** true si la venta original fue A cuenta (C18: sin caja que oponer). */
  readonly fueAcuenta: boolean;
  readonly customerId?: string | undefined;
  readonly motivo: string;
  readonly actor: string;
  readonly ultimoDevolucion: DevolucionSeq | null;
  readonly vistos: ReadonlyMap<string, DevolucionEmitida>;
}

export type FalloDevolucion =
  | { readonly ok: false; readonly codigo: "YA_VISTA"; readonly status: 409; readonly original: DevolucionEmitida }
  | { readonly ok: false; readonly codigo: "TOPE_EXCEDIDO"; readonly status: 422; readonly acumuladoCentavos: bigint; readonly ventaTotalCentavos: bigint }
  | { readonly ok: false; readonly codigo: "DEVOLUCION_INVALIDA"; readonly status: 422 };

export type DevolucionResult = { readonly ok: true; readonly efecto: EfectoDevolucion } | FalloDevolucion;

const MEDIOS: ReadonlyArray<string> = ["Efectivo", "Debito", "Mercado Pago", "QR", "Transferencia"];

export function registrar_devolucion(input: DevolucionInput): DevolucionResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { ok: false, codigo: "YA_VISTA", status: 409, original: visto };
  if (!input.idempotencyKey || !input.saleId) return { ok: false, codigo: "DEVOLUCION_INVALIDA", status: 422 };
  if (!input.actor || !input.motivo.trim() || input.motivo.length > 280) {
    return { ok: false, codigo: "DEVOLUCION_INVALIDA", status: 422 };
  }
  if (!(MEDIOS as ReadonlyArray<string>).includes(input.medio)) {
    return { ok: false, codigo: "DEVOLUCION_INVALIDA", status: 422 };
  }
  if (input.montoCentavos <= 0n || input.ventaTotalCentavos <= 0n || input.acumuladoPrevioCentavos < 0n) {
    return { ok: false, codigo: "DEVOLUCION_INVALIDA", status: 422 };
  }
  if (input.items.length === 0 || input.items.length > 50) {
    return { ok: false, codigo: "DEVOLUCION_INVALIDA", status: 422 };
  }
  for (const it of input.items) {
    if (!it.sku || !Number.isInteger(it.cantidad) || it.cantidad < 1 || it.cantidad > 999) {
      return { ok: false, codigo: "DEVOLUCION_INVALIDA", status: 422 };
    }
  }
  if (input.fueAcuenta && !input.customerId) {
    return { ok: false, codigo: "DEVOLUCION_INVALIDA", status: 422 };
  }
  // C14/E4: tope acumulado por venta (el adaptador lee el acumulado con
  // FOR UPDATE sobre la venta; acá la comparación es pura).
  if (input.acumuladoPrevioCentavos + input.montoCentavos > input.ventaTotalCentavos) {
    return {
      ok: false,
      codigo: "TOPE_EXCEDIDO",
      status: 422,
      acumuladoCentavos: input.acumuladoPrevioCentavos,
      ventaTotalCentavos: input.ventaTotalCentavos,
    };
  }

  const numero = siguiente_numero_devolucion(input.ultimoDevolucion);
  const devolucion: DevolucionEmitida = Object.freeze({
    numero,
    saleId: input.saleId,
    montoCentavos: input.montoCentavos,
    medio: input.medio,
    motivo: input.motivo,
    actor: input.actor,
    fueAcuenta: input.fueAcuenta,
    leyenda: LEYENDA_NO_FISCAL,
  });

  // Stock inverso: reingresa lo devuelto como COMPENSATORIO (nunca UPDATE).
  const movimientosStock: MovimientoStock[] = input.items.map((it) =>
    Object.freeze({
      idemKey: input.idempotencyKey,
      sku: it.sku,
      loteId: null,
      delta: it.cantidad,
      tipo: "COMPENSATORIO" as const,
      motivo: `devolucion ${numero} de ${input.saleId}`,
    }),
  );

  // Caja opuesta al egreso de la venta (mismo medio/monto, origen
  // devolucion). Si era A cuenta no hubo egreso: sin movimiento de caja.
  const ingresaACaja = !input.fueAcuenta;
  const movimientoCaja = ingresaACaja
    ? registrar_movimiento({
        tipo: "ingreso",
        metodo: input.medio,
        monto_centavos: input.montoCentavos,
        origen: "devolucion",
        categoria_id: "devolucion_venta",
      })
    : null;

  const credito =
    input.fueAcuenta && input.customerId
      ? Object.freeze({
          customerId: input.customerId,
          haberCentavos: input.montoCentavos,
          saleId: input.saleId,
          motivo: input.motivo,
        })
      : null;

  const auditoria: AuditoriaDevolucion = Object.freeze({
    accion: "devolucion" as const,
    devolucionId: numero,
    saleId: input.saleId,
    actor: input.actor,
    motivo: input.motivo,
  });

  return {
    ok: true,
    efecto: {
      devolucion,
      movimientosStock: Object.freeze(movimientosStock),
      movimientoCaja,
      ingresaACaja,
      credito,
      auditoria,
      vistoARegistrar: { key: input.idempotencyKey, devolucion },
    },
  };
}

// TV8: historial buscable por definitivo, provisorio o alias. El provisorio
// offline sigue resolviendo tras promover a definitivo (E6): por eso se
// compara contra ambos campos, trim exacto, sin normalizar (los códigos son
// opacos DeviceCode-SeqLocal / T-000001).
export interface TicketBuscable {
  readonly definitivo: string | null;
  readonly provisorio: string;
}

export function buscar_por_numero<T extends TicketBuscable>(
  tickets: ReadonlyArray<T>,
  numero: string,
): T | null {
  const n = numero.trim();
  if (!n) return null;
  for (const t of tickets) {
    if (t.definitivo === n || t.provisorio === n) return t;
  }
  return null;
}
