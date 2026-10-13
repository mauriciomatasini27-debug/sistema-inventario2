// LANE B — Fiado FC4 (saldo derivado + caché) + FC7 (buckets deterministas).
//
// Núcleo puro: sin IO, sin Drizzle. Misma función de saldo en cliente
// (tope offline contra saldo local, ADR-0003) y servidor.
//
// FC4: saldo = SUM(debe - haber) en centavos bigint. El caché se devuelve
// junto al derivado para persistirlo EN LA MISMA tx que el movimiento;
// el job nocturno solo verifica (verificar_cache), NUNCA autocorrige
// (ADR-0003: "Job nocturno verifica sin autocorregir").
// A favor (saldo < 0): solo marca a_revisar cuando es offline; online el
// servidor lo acepta como saldo a favor sin bloquear.

export type TipoMovCredito =
  | "inicial"
  | "venta"
  | "cobro"
  | "devolucion"
  | "ajuste_debito"
  | "ajuste_credito"
  | "incobrable"
  | "reversion";

export interface MovimientoCredito {
  readonly customerId: string;
  readonly tipo: TipoMovCredito;
  // Convención append-only: UN solo lado por movimiento. Debe = deuda que
  // suma (venta, ajuste_debito, inicial deudor). Haber = pago/quita que
  // resta (cobro, devolución, ajuste_credito, incobrable).
  readonly debeCentavos: bigint;
  readonly haberCentavos: bigint;
  // Epoch ms (doble hora: el adaptador guarda client + servidor).
  readonly fecha: number;
  readonly idempotencyKey: string;
  readonly revierteA?: string;
  readonly saleId?: string;
}

export type FalloMovimiento =
  | { readonly ok: false; readonly codigo: "MONTO_INVALIDO"; readonly status: 422; readonly error: string }
  | { readonly ok: false; readonly codigo: "TIPO_INVALIDO"; readonly status: 422; readonly error: string };

export type NuevoMovimientoResult = { readonly ok: true; readonly movimiento: MovimientoCredito } | FalloMovimiento;

// Constructor validado: montos >= 0, exactamente un lado > 0, tipo cerrado.
export function crear_movimiento(args: {
  readonly customerId: string;
  readonly tipo: TipoMovCredito;
  readonly debeCentavos: bigint;
  readonly haberCentavos: bigint;
  readonly fecha: number;
  readonly idempotencyKey: string;
  readonly revierteA?: string;
  readonly saleId?: string;
}): NuevoMovimientoResult {
  const TIPOS: ReadonlyArray<TipoMovCredito> = [
    "inicial",
    "venta",
    "cobro",
    "devolucion",
    "ajuste_debito",
    "ajuste_credito",
    "incobrable",
    "reversion",
  ];
  if (!TIPOS.includes(args.tipo)) {
    return { ok: false, codigo: "TIPO_INVALIDO", status: 422, error: `tipo ${args.tipo} fuera de lista` };
  }
  if (!args.customerId || !args.idempotencyKey) {
    return { ok: false, codigo: "MONTO_INVALIDO", status: 422, error: "cliente e idempotency-key requeridos" };
  }
  if (args.debeCentavos < 0n || args.haberCentavos < 0n) {
    return { ok: false, codigo: "MONTO_INVALIDO", status: 422, error: "debe/haber no pueden ser negativos" };
  }
  if (args.debeCentavos === 0n && args.haberCentavos === 0n) {
    return { ok: false, codigo: "MONTO_INVALIDO", status: 422, error: "movimiento en cero" };
  }
  if (args.debeCentavos > 0n && args.haberCentavos > 0n) {
    return { ok: false, codigo: "MONTO_INVALIDO", status: 422, error: "un movimiento, un solo lado" };
  }
  if (args.tipo === "reversion" && !args.revierteA) {
    return { ok: false, codigo: "MONTO_INVALIDO", status: 422, error: "reversion exige revierte_a" };
  }
  const movimiento: MovimientoCredito = {
    customerId: args.customerId,
    tipo: args.tipo,
    debeCentavos: args.debeCentavos,
    haberCentavos: args.haberCentavos,
    fecha: args.fecha,
    idempotencyKey: args.idempotencyKey,
    ...(args.revierteA !== undefined ? { revierteA: args.revierteA } : {}),
    ...(args.saleId !== undefined ? { saleId: args.saleId } : {}),
  };
  return { ok: true, movimiento };
}

// FC4: saldo derivado. Por qué SUM y no campo mutable: C6-style, evita drift
// entre saldo guardado y movimientos; el caché es solo lectura rápida.
export function derivar_saldo(movs: ReadonlyArray<Pick<MovimientoCredito, "debeCentavos" | "haberCentavos">>): bigint {
  let saldo = 0n;
  for (const m of movs) saldo += m.debeCentavos - m.haberCentavos;
  return saldo;
}

export interface SaldoConCache {
  readonly saldo: bigint;
  // Por qué el caché sale de acá: el adaptador lo persiste en la MISMA tx
  // que el INSERT del movimiento, así nunca hay ventana de drift.
  readonly cache: bigint;
}

export function saldo_con_cache(
  movs: ReadonlyArray<Pick<MovimientoCredito, "debeCentavos" | "haberCentavos">>,
): SaldoConCache {
  const saldo = derivar_saldo(movs);
  return { saldo, cache: saldo };
}

// Job nocturno: verifica sin autocorregir. Devuelve diferencia para reportar.
export function verificar_cache(
  saldoDerivado: bigint,
  cacheGuardado: bigint,
): { readonly ok: boolean; readonly diferencia: bigint } {
  const diferencia = saldoDerivado - cacheGuardado;
  return { ok: diferencia === 0n, diferencia };
}

// FC4 a favor: saldo negativo. Offline se marca a_revisar (sync lo confirma);
// online es saldo a favor válido sin bloquear.
export function estado_saldo(saldo: bigint, offline: boolean): "ok" | "a_revisar" {
  if (saldo < 0n && offline) return "a_revisar";
  return "ok";
}

export const MS_POR_DIA = 86_400_000;

// Nivel 1 — Mora día 15: deuda con 15+ días de antigüedad marca en_mora.
// Umbral fijo y determinista (mismo en cliente y servidor). El plazo del
// cliente sigue existiendo para el vencimiento exacto (vence_el); la mora
// es el aviso temprano a mitad del plazo 30d por defecto.
export const UMBRAL_MORA_DIAS = 15;

export function vence_el(fechaMs: number, plazoDias: number): number {
  const p = Number.isInteger(plazoDias) && plazoDias >= 0 ? plazoDias : 30;
  return fechaMs + p * MS_POR_DIA;
}

export type EstadoMora = "al_dia" | "en_mora";

export function estado_mora_por_dias(diasAtraso: number, umbral = UMBRAL_MORA_DIAS): EstadoMora {
  return diasAtraso >= umbral ? "en_mora" : "al_dia";
}

export function esta_en_mora(
  deudas: ReadonlyArray<Pick<DeudaPendiente, "fecha">>,
  hoyMs: number,
  umbral = UMBRAL_MORA_DIAS,
): { readonly enMora: boolean; readonly diasMax: number; readonly estado: EstadoMora } {
  let diasMax = 0;
  for (const d of deudas) {
    const dias = dias_atraso(d.fecha, hoyMs);
    if (dias > diasMax) diasMax = dias;
  }
  const enMora = diasMax >= umbral && deudas.length > 0;
  return { enMora, diasMax, estado: enMora ? "en_mora" : "al_dia" };
}

export function texto_mora(nombre: string, diasMax: number, saldoCentavos: bigint): string {
  const pesos = (Number(saldoCentavos) / 100).toFixed(2);
  return `Hola ${nombre}, tu cuenta tiene ${diasMax} días de atraso con saldo $${pesos}. Acercate a regularizar.`;
}

// FC7: días de atraso deterministas (fecha contra hoy, piso por día).
// Sin scoring IA: solo aritmética de fechas, mismo resultado en todos lados.
export function dias_atraso(fechaMs: number, hoyMs: number): number {
  const diff = Math.floor((hoyMs - fechaMs) / MS_POR_DIA);
  return diff < 0 ? 0 : diff;
}

export type Bucket = "0-30" | "31-60" | ">60";

export function bucket_de(dias: number): Bucket {
  if (dias <= 30) return "0-30";
  if (dias <= 60) return "31-60";
  return ">60";
}

export interface DeudaPendiente {
  readonly id: string;
  readonly totalCentavos: bigint;
  readonly fecha: number;
}

export interface BucketResumen {
  readonly cantidad: number;
  readonly totalCentavos: bigint;
}

export interface Antiguedad {
  readonly buckets: Record<Bucket, BucketResumen>;
  readonly detalle: ReadonlyArray<{ readonly id: string; readonly diasAtraso: number; readonly bucket: Bucket }>;
  readonly totalCentavos: bigint;
}

const BUCKET_VACIO = (): BucketResumen => ({ cantidad: 0, totalCentavos: 0n });

// FC7: cada venta pendiente cae en UN bucket por su antigüedad. FIFO/cobros
// parciales los resuelve el adaptador; acá solo clasificación determinista.
export function bucketizar(deudas: ReadonlyArray<DeudaPendiente>, hoyMs: number): Antiguedad {
  const buckets: Record<Bucket, BucketResumen> = { "0-30": BUCKET_VACIO(), "31-60": BUCKET_VACIO(), ">60": BUCKET_VACIO() };
  const detalle: Array<{ readonly id: string; readonly diasAtraso: number; readonly bucket: Bucket }> = [];
  let total = 0n;
  for (const d of deudas) {
    const diasAtraso = dias_atraso(d.fecha, hoyMs);
    const bucket = bucket_de(diasAtraso);
    const actual = buckets[bucket];
    buckets[bucket] = { cantidad: actual.cantidad + 1, totalCentavos: actual.totalCentavos + d.totalCentavos };
    detalle.push({ id: d.id, diasAtraso, bucket });
    total += d.totalCentavos;
  }
  return { buckets, detalle, totalCentavos: total };
}
