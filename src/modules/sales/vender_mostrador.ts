import type { Medio } from "../../lib/validation.js";
import {
  descontar,
  type DescuentoPorLote,
  type Faltante,
  type Lote,
  type MovimientoStock,
  type Sku,
} from "../inventario/inventario.js";
import { registrar_movimiento, type Movimiento, type Rol } from "../cash/caja.js";
import { aplicar_descuentos, type DescuentoSpec, type LineaConDescuento } from "./descuentos.js";

// Orquestador puro venta mostrador (TV1/TV3/TV6/TV7, ADR-0004).
// Compone descontar + total + siguiente_numero + registrar_movimiento en orden
// fijo. Sin IO, sin Drizzle, sin store: el adaptador (ruta) lee snapshots bajo
// lock y aplica el efecto en una sola tx. Mismo patrón que el resto del repo.

declare const TicketBrand: unique symbol;
export type TicketDefinitivo = string & { readonly [TicketBrand]: "TicketDefinitivo" };

export const LEYENDA_NO_FISCAL = "DOCUMENTO NO VÁLIDO COMO FACTURA" as const;

// TV5.8: mismo literal que Lane B (fiado.ts PAGO_A_CUENTA). Se duplica el
// literal en vez de importarlo: fiado.ts importa este módulo (numerador +
// leyenda) y el import inverso crearía un ciclo.
export const PAGO_A_CUENTA = "Pago: A cuenta" as const;

export interface TicketSeq {
  readonly n: number;
}

export interface LineaMostrador {
  readonly sku: Sku;
  readonly cantidad: number;
  readonly precioCentavos: bigint;
}

export type TicketEmitido =
  | {
      readonly kind: "online";
      readonly definitivo: TicketDefinitivo;
      readonly provisorio: string;
      readonly totalCentavos: bigint;
      readonly sobreventa: false;
      readonly leyenda: typeof LEYENDA_NO_FISCAL;
      readonly medio: Medio;
      /** TV5.8: presente solo cuando esAcuenta (C18: no ingresa a caja). */
      readonly pago?: typeof PAGO_A_CUENTA | undefined;
      /** TV4: bruto sin descuentos (igual al total cuando no hay). */
      readonly totalBrutoCentavos?: bigint | undefined;
      readonly totalDescuentoCentavos?: bigint | undefined;
    }
  | {
      readonly kind: "offline";
      readonly definitivo: null;
      readonly provisorio: string;
      readonly totalCentavos: bigint;
      readonly sobreventa: boolean;
      readonly leyenda: typeof LEYENDA_NO_FISCAL;
      readonly medio: Medio;
      /** TV5.8: presente solo cuando esAcuenta (C18: no ingresa a caja). */
      readonly pago?: typeof PAGO_A_CUENTA | undefined;
      /** TV4: bruto sin descuentos (igual al total cuando no hay). */
      readonly totalBrutoCentavos?: bigint | undefined;
      readonly totalDescuentoCentavos?: bigint | undefined;
    };

export interface VenderMostradorInput {
  readonly idempotencyKey: string;
  readonly lineas: ReadonlyArray<LineaMostrador>;
  readonly medio: Medio;
  readonly deviceCode: string;
  readonly seqLocal: number;
  readonly offline: boolean;
  /** Snapshot bajo lock; el núcleo NO muta. */
  readonly lotes: ReadonlyArray<Lote>;
  /** Snapshot readonly; el chequeo 409 ocurre antes de numerar. */
  readonly vistos: ReadonlyMap<string, TicketEmitido>;
  /** Último definitivo bajo lock; ignorado si offline. */
  readonly ultimoDefinitivo: TicketSeq | null;
  readonly grant: { readonly rol: Rol };
  /** TV4: un spec por línea (índice a índice) o ausente; null = sin descuento. */
  readonly descuentosLinea?: ReadonlyArray<DescuentoSpec | null | undefined> | undefined;
  /** TV4: descuento de ticket prorrateado con mayor resto; ausente = sin. */
  readonly descuentoTicket?: DescuentoSpec | null | undefined;
  /** TV5.8: true => ticket "Pago: A cuenta", ingresaACaja false (C18 Lane B). */
  readonly esAcuenta?: boolean | undefined;
}

export interface EfectoVenta {
  readonly ticket: TicketEmitido;
  readonly descuentos: ReadonlyArray<DescuentoPorLote>;
  readonly movimientosStock: ReadonlyArray<MovimientoStock>;
  readonly faltantes: ReadonlyArray<Faltante>;
  readonly egreso: Movimiento;
  readonly vistoARegistrar: { readonly key: string; readonly ticket: TicketEmitido };
  /** C18/TV5.8: false cuando esAcuenta (el adaptador NO persiste el egreso). */
  readonly ingresaACaja: boolean;
  /** TV4: snapshot por línea para ticket_lines + ticket_discounts. */
  readonly lineasConDescuento: ReadonlyArray<LineaConDescuento>;
  readonly totalBrutoCentavos: bigint;
  readonly totalDescuentoCentavos: bigint;
}

export type FalloVenta =
  | { readonly ok: false; readonly codigo: "YA_VISTA"; readonly status: 409; readonly original: TicketEmitido }
  | { readonly ok: false; readonly codigo: "SIN_STOCK"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "LINEA_INVALIDA"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "DESCUENTO_INVALIDO"; readonly status: 422 };

export type VentaMostradorResult = { readonly ok: true; readonly efecto: EfectoVenta } | FalloVenta;

/** Numerador puro: último → siguiente. null → T-000001. Formato T- + pad 6. */
export function siguiente_numero(ultimo: TicketSeq | null): TicketDefinitivo {
  const n = (ultimo?.n ?? 0) + 1;
  return `T-${String(n).padStart(6, "0")}` as TicketDefinitivo;
}

/** Orquestador puro: decide todo, persiste nada. */
export function vender_mostrador(input: VenderMostradorInput): VentaMostradorResult {
  if (!input.idempotencyKey || input.lineas.length === 0 || input.lineas.length > 50) {
    return { ok: false, codigo: "LINEA_INVALIDA", status: 422 };
  }
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { ok: false, codigo: "YA_VISTA", status: 409, original: visto };
  for (const l of input.lineas) {
    if (!l.sku || !Number.isInteger(l.cantidad) || l.cantidad < 1 || l.cantidad > 999 || l.precioCentavos < 0n) {
      return { ok: false, codigo: "LINEA_INVALIDA", status: 422 };
    }
  }

  const d = descontar({
    lotes: input.lotes,
    lineas: input.lineas.map((l) => ({ sku: l.sku, cantidad: l.cantidad })),
    modo: input.offline ? "OFFLINE_PERMITIDO" : "ONLINE",
    idemKey: input.idempotencyKey,
  });
  if (!d.ok) return { ok: false, codigo: d.codigo, status: 422 };

  // TV4: orden fijo línea-primero-ticket-después sobre el snapshot de
  // precio (Lane C ya congeló). Sin specs el neto == bruto (vía rápida
  // idéntica a la anterior).
  const calc = aplicar_descuentos({
    lineas: input.lineas.map((l) => ({ sku: l.sku as string, cantidad: l.cantidad, precioCentavos: l.precioCentavos })),
    ...(input.descuentosLinea !== undefined ? { descuentosLinea: input.descuentosLinea } : {}),
    ...(input.descuentoTicket != null ? { descuentoTicket: input.descuentoTicket } : {}),
  });
  if (!calc.ok) return { ok: false, codigo: "DESCUENTO_INVALIDO", status: 422 };
  const total = calc.calculo.totalNetoCentavos;
  // Venta de $0 no es venta de mostrador (caja exige monto>0); un descuento
  // que deja el total en cero cae acá, igual que el precio cero de antes.
  // Se convierte el throw en fallo tipado.
  if (total <= 0n) return { ok: false, codigo: "LINEA_INVALIDA", status: 422 };

  const provisorio = `${input.deviceCode}-${input.seqLocal}`;
  const definitivo = input.offline ? null : siguiente_numero(input.ultimoDefinitivo);
  const egreso = registrar_movimiento({
    tipo: "ingreso",
    metodo: input.medio,
    monto_centavos: total,
    origen: "venta",
    categoria_id: "venta_mostrador",
    rol: input.grant.rol,
  });

  const sobreventa = d.valor.sobreventa.length > 0;
  // TV5.8/C18: A cuenta no ingresa a caja. El egreso se sigue decidiendo
  // (forma estable para callers) pero el adaptador no lo persiste cuando
  // ingresaACaja es false; el crédito lo registra Lane B.
  const esAcuenta = input.esAcuenta === true;
  const ticket: TicketEmitido = definitivo
    ? {
        kind: "online",
        definitivo,
        provisorio,
        totalCentavos: total,
        sobreventa: false,
        leyenda: LEYENDA_NO_FISCAL,
        medio: input.medio,
        ...(esAcuenta ? { pago: PAGO_A_CUENTA } : {}),
        totalBrutoCentavos: calc.calculo.totalBrutoCentavos,
        totalDescuentoCentavos: calc.calculo.totalDescuentoCentavos,
      }
    : {
        kind: "offline",
        definitivo: null,
        provisorio,
        totalCentavos: total,
        sobreventa,
        leyenda: LEYENDA_NO_FISCAL,
        medio: input.medio,
        ...(esAcuenta ? { pago: PAGO_A_CUENTA } : {}),
        totalBrutoCentavos: calc.calculo.totalBrutoCentavos,
        totalDescuentoCentavos: calc.calculo.totalDescuentoCentavos,
      };

  return {
    ok: true,
    efecto: {
      ticket,
      descuentos: d.valor.descuentos,
      movimientosStock: d.valor.movimientos,
      faltantes: d.valor.sobreventa,
      egreso,
      vistoARegistrar: { key: input.idempotencyKey, ticket },
      ingresaACaja: !esAcuenta,
      lineasConDescuento: calc.calculo.lineas,
      totalBrutoCentavos: calc.calculo.totalBrutoCentavos,
      totalDescuentoCentavos: calc.calculo.totalDescuentoCentavos,
    },
  };
}
