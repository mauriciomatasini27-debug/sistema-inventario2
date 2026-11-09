// LANE B — Fiado FC2/FC3/FC5/FC6/FC8/FC9 + C18 lado caja.
//
// Núcleo puro: sin IO, sin Drizzle, sin store. NO importa ni modifica
// vender_mostrador/confirmar_venta (firma intacta); solo reutiliza el
// numerador + leyenda (TV3/TV7 mismo formato) y compone descontar +
// registrar_movimiento en orden fijo, igual que vender_mostrador.
//
// C18: venta_a_cuenta → ingresaACaja=false (descuenta stock, suma fiado,
// ticket "Pago: A cuenta", CERO movimiento de caja). cobro_fiado →
// ingresaACaja=true (registrar_movimiento tipo ingreso origen cobro_fiado
// por uno de los 5 medios, categoría "cobro_fiado").
// FC6: tope + plazo por cliente; superar exige Dueño (403 Empleado).
// Offline controla contra el saldo LOCAL que pasa el adaptador (ADR-0003).
import { descontar, type DescuentoPorLote, type Faltante, type Lote, type MovimientoStock } from "../inventario/inventario.js";
import { registrar_movimiento, type Movimiento, type Rol } from "../cash/caja.js";
import { LEYENDA_NO_FISCAL, siguiente_numero, type TicketDefinitivo, type TicketSeq } from "../sales/vender_mostrador.js";
import { aplicar_descuentos, type LineaConDescuento } from "../sales/descuentos.js";
import type { Medio } from "../../lib/validation.js";
import { crear_movimiento, type MovimientoCredito, type TipoMovCredito } from "./saldos.js";
import { disponibleCentavos, supera_limite, type CreditoResuelto } from "./limite.js";

export const PAGO_A_CUENTA = "Pago: A cuenta" as const;

// C18 matriz explícita: qué lado del fiado toca caja.
export const C18_INGRESO_CAJA = { venta_a_cuenta: false, cobro_fiado: true } as const;

export type TicketFiado =
  | {
      readonly kind: "online";
      readonly definitivo: TicketDefinitivo;
      readonly provisorio: string;
      readonly totalCentavos: bigint;
      readonly pago: typeof PAGO_A_CUENTA;
      readonly leyenda: typeof LEYENDA_NO_FISCAL;
    }
  | {
      readonly kind: "offline";
      readonly definitivo: null;
      readonly provisorio: string;
      readonly totalCentavos: bigint;
      readonly sobreventa: boolean;
      readonly pago: typeof PAGO_A_CUENTA;
      readonly leyenda: typeof LEYENDA_NO_FISCAL;
    };

// FC3/TV5.8: el ticket de fiado muestra "Pago: A cuenta".
export function texto_pago_ticket(): typeof PAGO_A_CUENTA {
  return PAGO_A_CUENTA;
}

export interface LineaFiado {
  readonly sku: import("../inventario/inventario.js").Sku;
  readonly cantidad: number;
  readonly precioCentavos: bigint;
}

export interface VentaACuentaInput {
  readonly idempotencyKey: string;
  readonly lineas: ReadonlyArray<LineaFiado>;
  readonly deviceCode: string;
  readonly seqLocal: number;
  readonly offline: boolean;
  readonly lotes: ReadonlyArray<Lote>;
  readonly vistos: ReadonlyMap<string, TicketFiado>;
  readonly ultimoDefinitivo: TicketSeq | null;
  readonly credito: CreditoResuelto;
  readonly ahoraMs: number;
  // Nivel 1 mora día 15: el adaptador calcula esta_en_mora y lo pasa.
  // Si bloquearEnMora y enMora, solo Dueño pasa (empleado 403 MORA).
  readonly enMora?: boolean;
  readonly bloquearEnMora?: boolean;
}

export interface EfectoFiado {
  readonly ticket: TicketFiado;
  readonly descuentos: ReadonlyArray<DescuentoPorLote>;
  readonly movimientosStock: ReadonlyArray<MovimientoStock>;
  readonly faltantes: ReadonlyArray<Faltante>;
  readonly movimientoCredito: MovimientoCredito;
  // P10-16: snapshot por línea congelado para ticket_lines + ticket_discounts.
  readonly lineasConDescuento: ReadonlyArray<LineaConDescuento>;
  readonly ingresaACaja: false;
  // Dueño puede superar tope (queda marcado para auditoría).
  readonly superaTope: boolean;
  readonly superaMora: boolean;
  readonly vistoARegistrar: { readonly key: string; readonly ticket: TicketFiado };
}

export type FalloFiado =
  | { readonly ok: false; readonly codigo: "YA_VISTA"; readonly status: 409; readonly original: TicketFiado }
  | { readonly ok: false; readonly codigo: "SIN_STOCK"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "LINEA_INVALIDA"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "TOPE_SUPERADO"; readonly status: 403; readonly disponibleCentavos: bigint }
  | { readonly ok: false; readonly codigo: "MORA"; readonly status: 403 };

export type VentaACuentaResult = { readonly ok: true; readonly efecto: EfectoFiado } | FalloFiado;

// FC2: descuenta stock sin ingreso a caja, atómico con ticket (el adaptador
// aplica ticket + stock + customer_movements en una sola tx; acá se decide
// todo o nada: cualquier fallo previo => sin efecto posterior).
export function venta_a_cuenta(input: VentaACuentaInput): VentaACuentaResult {
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

  // P10-16: snapshot por línea para ticket_discounts. Sin specs el neto
  // == bruto y el snapshot sale por la vía rápida de aplicar_descuentos,
  // la misma que usaría TV4 con specs.
  const snap = aplicar_descuentos({
    lineas: input.lineas.map((l) => ({ sku: l.sku as string, cantidad: l.cantidad, precioCentavos: l.precioCentavos })),
  });
  if (!snap.ok) return { ok: false, codigo: "LINEA_INVALIDA", status: 422 };

  const total = snap.calculo.totalNetoCentavos;
  if (total <= 0n) return { ok: false, codigo: "LINEA_INVALIDA", status: 422 };

  const nuevoSaldo = input.credito.saldoCentavos + total;
  const superaTope = supera_limite(nuevoSaldo, input.credito.limite);
  if (superaTope && input.credito.rol !== "dueno") {
    return {
      ok: false,
      codigo: "TOPE_SUPERADO",
      status: 403,
      disponibleCentavos: disponibleCentavos(input.credito) ?? 0n,
    };
  }

  // Nivel 1 mora día 15: en mora solo Dueño vende (empleado 403 MORA).
  const enMora = input.enMora === true && input.bloquearEnMora === true;
  const superaMora = enMora;
  if (enMora && input.credito.rol !== "dueno") {
    return { ok: false, codigo: "MORA", status: 403 };
  }

  const provisorio = `${input.deviceCode}-${input.seqLocal}`;
  const definitivo = input.offline ? null : siguiente_numero(input.ultimoDefinitivo);
  const sobreventa = d.valor.sobreventa.length > 0;
  const ticket: TicketFiado = definitivo
    ? { kind: "online", definitivo, provisorio, totalCentavos: total, pago: PAGO_A_CUENTA, leyenda: LEYENDA_NO_FISCAL }
    : { kind: "offline", definitivo: null, provisorio, totalCentavos: total, sobreventa, pago: PAGO_A_CUENTA, leyenda: LEYENDA_NO_FISCAL };

  const mov = crear_movimiento({
    customerId: input.credito.clienteId,
    tipo: "venta",
    debeCentavos: total,
    haberCentavos: 0n,
    fecha: input.ahoraMs,
    idempotencyKey: input.idempotencyKey,
  });
  // Inalcanzable con total > 0, pero el tipo lo exige chequear.
  if (!mov.ok) return { ok: false, codigo: "LINEA_INVALIDA", status: 422 };

  return {
    ok: true,
    efecto: {
      ticket,
      descuentos: d.valor.descuentos,
      movimientosStock: d.valor.movimientos,
      faltantes: d.valor.sobreventa,
      movimientoCredito: mov.movimiento,
      lineasConDescuento: snap.calculo.lineas,
      ingresaACaja: C18_INGRESO_CAJA.venta_a_cuenta,
      superaTope,
      superaMora,
      vistoARegistrar: { key: input.idempotencyKey, ticket },
    },
  };
}

export const MEDIOS_COBRO: ReadonlyArray<Medio> = ["Efectivo", "Debito", "Mercado Pago", "QR", "Transferencia"];

function es_medio(m: string): m is Medio {
  return (MEDIOS_COBRO as ReadonlyArray<string>).includes(m);
}

export interface CobroRegistrado {
  readonly movimientoCredito: MovimientoCredito;
  readonly ingresoCaja: Movimiento;
  readonly ingresaACaja: true;
}

export type FalloCobro =
  | { readonly ok: false; readonly codigo: "YA_VISTA"; readonly status: 409; readonly original: CobroRegistrado }
  | { readonly ok: false; readonly codigo: "MONTO_INVALIDO"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "MEDIO_INVALIDO"; readonly status: 422 };

export type CobroFiadoResult = { readonly ok: true; readonly efecto: CobroRegistrado } | FalloCobro;

// FC5 + C18: cobro por los 5 medios; el movimiento de crédito (haber) y el
// ingreso a caja (origen cobro_fiado) nacen juntos para la misma tx.
export function cobro_fiado(input: {
  readonly idempotencyKey: string;
  readonly customerId: string;
  readonly montoCentavos: bigint;
  readonly medio: Medio;
  readonly ahoraMs: number;
  readonly vistos: ReadonlyMap<string, CobroRegistrado>;
}): CobroFiadoResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { ok: false, codigo: "YA_VISTA", status: 409, original: visto };
  if (input.montoCentavos <= 0n) return { ok: false, codigo: "MONTO_INVALIDO", status: 422 };
  if (!es_medio(input.medio)) return { ok: false, codigo: "MEDIO_INVALIDO", status: 422 };
  const mov = crear_movimiento({
    customerId: input.customerId,
    tipo: "cobro",
    debeCentavos: 0n,
    haberCentavos: input.montoCentavos,
    fecha: input.ahoraMs,
    idempotencyKey: input.idempotencyKey,
  });
  if (!mov.ok) return { ok: false, codigo: "MONTO_INVALIDO", status: 422 };
  // Por qué registrar_movimiento acá y no en la ruta: el origen cobro_fiado
  // + tipo ingreso es regla de dominio C18, no decisión del borde.
  const ingresoCaja = registrar_movimiento({
    tipo: "ingreso",
    metodo: input.medio,
    monto_centavos: input.montoCentavos,
    origen: "cobro_fiado",
    categoria_id: "cobro_fiado",
  });
  return {
    ok: true,
    efecto: { movimientoCredito: mov.movimiento, ingresoCaja, ingresaACaja: C18_INGRESO_CAJA.cobro_fiado },
  };
}

export interface AjusteInput {
  readonly idempotencyKey: string;
  readonly customerId: string;
  readonly tipo: "ajuste_debito" | "ajuste_credito" | "incobrable" | "devolucion";
  readonly montoCentavos: bigint;
  readonly motivo: string;
  readonly rol: Rol;
  readonly ahoraMs: number;
  readonly vistos: ReadonlyMap<string, MovimientoCredito>;
  readonly saleId?: string;
}

export type FalloAjuste =
  | { readonly ok: false; readonly codigo: "YA_VISTA"; readonly status: 409; readonly original: MovimientoCredito }
  | { readonly ok: false; readonly codigo: "SOLO_DUENO"; readonly status: 403 }
  | { readonly ok: false; readonly codigo: "MONTO_INVALIDO"; readonly status: 422 };

export type AjusteResult = { readonly ok: true; readonly movimiento: MovimientoCredito } | FalloAjuste;

// FC9: ajustes e incobrables solo Dueño. Devolución de mostrador también
// pasa por acá como haber (el adaptador valida tope acumulado C14 aparte).
// Motivo obligatorio (auditoría, igual que requiere_nota C5).
export function registrar_ajuste(input: AjusteInput): AjusteResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { ok: false, codigo: "YA_VISTA", status: 409, original: visto };
  if (input.tipo !== "devolucion" && input.rol !== "dueno") {
    return { ok: false, codigo: "SOLO_DUENO", status: 403 };
  }
  if (input.montoCentavos <= 0n) return { ok: false, codigo: "MONTO_INVALIDO", status: 422 };
  if (!input.motivo.trim() || input.motivo.length > 280) {
    return { ok: false, codigo: "MONTO_INVALIDO", status: 422 };
  }
  const esDebe = input.tipo === "ajuste_debito";
  const mov = crear_movimiento({
    customerId: input.customerId,
    tipo: input.tipo as TipoMovCredito,
    debeCentavos: esDebe ? input.montoCentavos : 0n,
    haberCentavos: esDebe ? 0n : input.montoCentavos,
    fecha: input.ahoraMs,
    idempotencyKey: input.idempotencyKey,
    ...(input.saleId !== undefined ? { saleId: input.saleId } : {}),
  });
  if (!mov.ok) return { ok: false, codigo: "MONTO_INVALIDO", status: 422 };
  return { ok: true, movimiento: mov.movimiento };
}

export type FalloReversion =
  | { readonly ok: false; readonly codigo: "YA_REVERTIDO"; readonly status: 409 }
  | { readonly ok: false; readonly codigo: "NO_EXISTE"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "MONTO_INVALIDO"; readonly status: 422 };

export type ReversionResult = { readonly ok: true; readonly movimiento: MovimientoCredito } | FalloReversion;

// C7-style: reversión por movimiento opuesto con revierte_a único.
// El espejo invierte debe/haber del original (nunca UPDATE).
export function revertir_movimiento(input: {
  readonly idempotencyKey: string;
  readonly customerId: string;
  readonly revierteA: string;
  readonly motivo: string;
  readonly ahoraMs: number;
  readonly movimientos: ReadonlyMap<string, MovimientoCredito>;
  readonly revertidos: ReadonlySet<string>;
}): ReversionResult {
  const original = input.movimientos.get(input.revierteA);
  if (!original) return { ok: false, codigo: "NO_EXISTE", status: 422 };
  if (input.revertidos.has(input.revierteA)) return { ok: false, codigo: "YA_REVERTIDO", status: 409 };
  if (!input.motivo.trim() || input.motivo.length > 280) {
    return { ok: false, codigo: "MONTO_INVALIDO", status: 422 };
  }
  const mov = crear_movimiento({
    customerId: input.customerId,
    tipo: "reversion",
    debeCentavos: original.haberCentavos,
    haberCentavos: original.debeCentavos,
    fecha: input.ahoraMs,
    idempotencyKey: input.idempotencyKey,
    revierteA: input.revierteA,
  });
  if (!mov.ok) return { ok: false, codigo: "MONTO_INVALIDO", status: 422 };
  return { ok: true, movimiento: mov.movimiento };
}

// FC8: wa.me gratis por defecto. Determinista: solo dígitos + texto encoded.
export type WaResult = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly codigo: "TELEFONO_INVALIDO"; readonly status: 422 };

export function link_whatsapp(telefono: string, mensaje: string): WaResult {
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length < 6 || digitos.length > 20) {
    return { ok: false, codigo: "TELEFONO_INVALIDO", status: 422 };
  }
  return { ok: true, url: `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}` };
}
