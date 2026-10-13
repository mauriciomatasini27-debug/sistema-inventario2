// LANE C — Precios GP1-GP11 (ADR-0004). Núcleo puro: sin IO, sin Drizzle,
// sin reloj propio (la hora entra por parámetro para que el job y los tests
// sean deterministas). Todo inmutable: se devuelven valores nuevos
// congelados, nunca se muta la entrada. Dinero siempre bigint centavos.
//
// Alcance: GP1 ajuste masivo, GP3 vigencia/programados, GP4 snapshot,
// GP5 ficha + markup fijo, GP7 config, GP8 auditoría, GP10 señales sin
// montos. Fuera: GP2 por categoría/proveedor, GP11 asesor proveedor (P1).

import { z } from "zod";
import { PASO_DEFECTO, redondearArriba } from "./redondeo.js";

// ---------------------------------------------------------------------------
// Tipos de dominio
// ---------------------------------------------------------------------------

export type Rol = "dueno" | "empleado";
export type DireccionAjuste = "suba" | "baja";
export type EstadoAjuste = "pendiente" | "aplicado" | "cancelado";

// Rangos GP1 en puntos base (0.01% = 1bp): suba 0.01-300, baja 0.01-90.
export const SUBA_MIN_BP = 1;
export const SUBA_MAX_BP = 30_000;
export const BAJA_MIN_BP = 1;
export const BAJA_MAX_BP = 9_000;

// GP7: carga total (impuestos + comisiones + margen) debe ser < 60%.
export const CARGA_MAX_PCT = 60;

export interface ItemCatalogo {
  readonly sku: string;
  readonly vigenteCentavos: bigint;
  readonly costoCentavos: bigint;
}

export interface LineaPrevia {
  readonly sku: string;
  readonly vigenteCentavos: bigint;
  readonly brutoCentavos: bigint;
  readonly nuevoCentavos: bigint;
}

export interface Ajuste {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly direccion: DireccionAjuste;
  readonly porcentaje: number;
  readonly pasoCentavos: bigint;
  readonly vigenciaTipo: "ahora" | "programada";
  readonly aplicaEn: string | null;
  readonly estado: EstadoAjuste;
  readonly creadoPor: string;
  readonly creadoEn: string;
  readonly items: ReadonlyArray<ItemCatalogo>;
}

export interface AuditoriaPrecios {
  readonly id: string;
  readonly quien: string;
  readonly cuando: string;
  // Strings (no bigint) para que serialicen a JSON/DB sin pérdida.
  readonly antes: string;
  readonly despues: string;
  readonly motivo: string;
}

export interface Settings {
  readonly pasoCentavos: bigint;
  readonly direccion: "arriba";
  readonly topeSubaBp: number;
  readonly topeBajaBp: number;
}

export const SETTINGS_DEFECTO: Settings = Object.freeze({
  pasoCentavos: PASO_DEFECTO,
  direccion: "arriba",
  topeSubaBp: SUBA_MAX_BP,
  topeBajaBp: BAJA_MAX_BP,
});

// Snapshot GP4: alimenta ticket_lines (precio/costo congelados). El ticket
// ya congela; esto construye la línea congelada sin tocar sales/.
export interface LineaSnapshot {
  readonly sku: string;
  readonly qty: number;
  readonly precioCongeladoCentavos: bigint;
  readonly costoCongeladoCentavos: bigint;
  readonly descuentoCentavos: bigint;
  readonly precioId: string | null;
}

export interface FichaProducto {
  readonly gananciaCentavos: bigint;
  readonly markupBp: number | null;
  readonly margenBp: number | null;
  readonly cargaBp: number | null;
  readonly cargaOk: boolean;
}

// ---------------------------------------------------------------------------
// Zod de borde (mismas convenciones que src/lib/validation.ts: listas
// cerradas, centavos como number int; el dominio convierte a bigint).
// ---------------------------------------------------------------------------

export const direccionAjusteSchema = z.enum(["suba", "baja"]);

export const vigenciaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("ahora") }),
  z.object({
    tipo: z.literal("programada"),
    aplica_en: z.string().datetime({ offset: true }),
  }),
]);

export const ajusteMasivoSchema = z.object({
  idempotency_key: z.string().min(1).max(128),
  direccion: direccionAjusteSchema,
  porcentaje: z.number().finite().positive().max(300),
  vigencia: vigenciaSchema,
  confirmado: z.boolean().refine((v) => v === true, "requiere confirmación reforzada"),
  paso_centavos: z.number().int().positive().optional(),
  items: z
    .array(
      z.object({
        sku: z.string().min(1).max(64),
        vigente_centavos: z.number().int().min(0).max(999_999_999),
        costo_centavos: z.number().int().min(0).max(999_999_999),
      }),
    )
    .min(1)
    .max(500),
});

export const settingsSchema = z.object({
  paso_centavos: z.number().int().positive(),
  direccion: z.literal("arriba"),
  tope_suba_bp: z.number().int().min(1).max(SUBA_MAX_BP),
  tope_baja_bp: z.number().int().min(1).max(BAJA_MAX_BP),
});

export const fichaInputSchema = z.object({
  costo_centavos: z.number().int().min(0).max(999_999_999),
  precio_centavos: z.number().int().min(0).max(999_999_999),
  impuestos_pct: z.number().finite().min(0).max(100).default(0),
  comisiones_pct: z.number().finite().min(0).max(100).default(0),
});

export const snapshotLineaSchema = z.object({
  sku: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(999),
  precio_vigente_centavos: z.number().int().min(0).max(999_999_999),
  costo_vigente_centavos: z.number().int().min(0).max(999_999_999),
  descuento_centavos: z.number().int().min(0).max(999_999_999).default(0),
  precio_id: z.string().max(64).optional(),
});

// ---------------------------------------------------------------------------
// Cálculo central GP1: nuevo = vigente * (1 ± p) + redondeo, mitad-arriba.
// ---------------------------------------------------------------------------

export function porcentajeABp(porcentaje: number): number {
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) throw new Error("porcentaje inválido");
  return Math.round(porcentaje * 100);
}

function exigirRango(direccion: DireccionAjuste, porcentaje: number): number {
  // Piso/techo en crudo antes de redondear a bp: 0.009% no puede colarse
  // como 0.01% por redondeo.
  if (direccion === "suba") {
    if (porcentaje < 0.01 || porcentaje > 300) throw new Error("suba fuera de rango 0.01-300");
  } else {
    if (porcentaje < 0.01 || porcentaje > 90) throw new Error("baja fuera de rango 0.01-90");
  }
  const bp = porcentajeABp(porcentaje);
  if (direccion === "suba") {
    if (bp < SUBA_MIN_BP || bp > SUBA_MAX_BP) throw new Error("suba fuera de rango 0.01-300");
  } else {
    if (bp < BAJA_MIN_BP || bp > BAJA_MAX_BP) throw new Error("baja fuera de rango 0.01-90");
  }
  return bp;
}

// Bruto sin redondear, mitad-arriba con enteros. p llega con 2 decimales
// como máximo, así que denominador 10000 es exacto (p/100 = pCents/10000).
export function brutoSinRedondeo(
  vigenteCentavos: bigint,
  direccion: DireccionAjuste,
  porcentaje: number,
): bigint {
  if (vigenteCentavos < 0n) throw new Error("precio vigente negativo");
  const bp = exigirRango(direccion, porcentaje);
  const numer =
    direccion === "suba"
      ? vigenteCentavos * (10_000n + BigInt(bp))
      : vigenteCentavos * (10_000n - BigInt(bp));
  return (numer + 5_000n) / 10_000n;
}

export function calcularPrecioNuevo(
  vigenteCentavos: bigint,
  direccion: DireccionAjuste,
  porcentaje: number,
  pasoCentavos: bigint,
): { brutoCentavos: bigint; nuevoCentavos: bigint } {
  const bruto = brutoSinRedondeo(vigenteCentavos, direccion, porcentaje);
  const nuevo = redondearArriba(bruto, pasoCentavos);
  return { brutoCentavos: bruto, nuevoCentavos: nuevo };
}

// Previa GP1: no muta, no persiste, no redondea distinto del cálculo real.
export function previsualizarAjuste(
  items: ReadonlyArray<ItemCatalogo>,
  direccion: DireccionAjuste,
  porcentaje: number,
  pasoCentavos: bigint,
): LineaPrevia[] {
  return items.map((it) => {
    const { brutoCentavos, nuevoCentavos } = calcularPrecioNuevo(
      it.vigenteCentavos,
      direccion,
      porcentaje,
      pasoCentavos,
    );
    return Object.freeze({
      sku: it.sku,
      vigenteCentavos: it.vigenteCentavos,
      brutoCentavos,
      nuevoCentavos,
    });
  });
}

// ---------------------------------------------------------------------------
// GP1 crear ajuste: 1 tx idempotente, confirmación reforzada, sensible exige
// online. Mismo contrato visible que confirmar_venta: retry => 409 con el
// original (E3), nunca duplica.
// ---------------------------------------------------------------------------

export interface CrearAjusteInput {
  readonly idempotencyKey: string;
  readonly direccion: DireccionAjuste;
  readonly porcentaje: number;
  readonly vigenciaTipo: "ahora" | "programada";
  readonly aplicaEn: string | null;
  readonly confirmado: boolean;
  readonly online: boolean;
  readonly rol: Rol;
  readonly creadoPor: string;
  readonly ahoraIso: string;
  readonly pasoCentavos?: bigint;
  readonly items: ReadonlyArray<ItemCatalogo>;
  readonly vistos: ReadonlyMap<string, Ajuste>;
}

export type CrearAjusteResult =
  | { status: 201; ajuste: Ajuste; previa: LineaPrevia[]; auditoria: AuditoriaPrecios }
  | { status: 403; error: string }
  | { status: 409; error: string; original?: Ajuste }
  | { status: 422; error: string };

function cuerpoIgual(a: Ajuste, b: CrearAjusteInput): boolean {
  if (a.direccion !== b.direccion || a.porcentaje !== b.porcentaje) return false;
  if (a.vigenciaTipo !== b.vigenciaTipo || a.aplicaEn !== b.aplicaEn) return false;
  if (a.items.length !== b.items.length) return false;
  return a.items.every(
    (it, i) => {
      const otro = b.items[i];
      return (
        otro !== undefined &&
        it.sku === otro.sku &&
        it.vigenteCentavos === otro.vigenteCentavos &&
        it.costoCentavos === otro.costoCentavos
      );
    },
  );
}

export function crearAjuste(input: CrearAjusteInput): CrearAjusteResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) {
    if (cuerpoIgual(visto, input)) {
      return { status: 409, error: "idempotency-key repetida", original: visto };
    }
    return { status: 409, error: "idempotency-key repetida con distinto cuerpo" };
  }
  // Por qué online acá y no en Zod: igual que C15/C16 en caja, el permiso es
  // regla de dominio y debe cumplirse también en reintentos de sync.
  if (!input.online) return { status: 403, error: "ajuste sensible exige online" };
  if (!input.confirmado) return { status: 422, error: "requiere confirmación reforzada" };
  if (!input.idempotencyKey || !input.creadoPor) return { status: 422, error: "ajuste inválido" };
  if (input.items.length === 0 || input.items.length > 500) {
    return { status: 422, error: "ajuste sin líneas o excede 500" };
  }
  let bp: number;
  try {
    bp = exigirRango(input.direccion, input.porcentaje);
  } catch {
    return { status: 422, error: "porcentaje fuera de rango" };
  }
  void bp;
  const paso = input.pasoCentavos ?? PASO_DEFECTO;
  if (input.vigenciaTipo === "programada") {
    if (!input.aplicaEn) return { status: 422, error: "programada exige aplica_en" };
    if (input.aplicaEn <= input.ahoraIso) {
      return { status: 422, error: "aplica_en debe ser futuro" };
    }
  }
  let previa: LineaPrevia[];
  try {
    previa = previsualizarAjuste(input.items, input.direccion, input.porcentaje, paso);
  } catch {
    return { status: 422, error: "línea inválida" };
  }
  const ajuste: Ajuste = Object.freeze({
    id: `aj-${input.idempotencyKey}`,
    idempotencyKey: input.idempotencyKey,
    direccion: input.direccion,
    porcentaje: input.porcentaje,
    pasoCentavos: paso,
    vigenciaTipo: input.vigenciaTipo,
    aplicaEn: input.vigenciaTipo === "programada" ? input.aplicaEn : null,
    estado: "pendiente" as const,
    creadoPor: input.creadoPor,
    creadoEn: input.ahoraIso,
    items: Object.freeze([...input.items]) as ReadonlyArray<ItemCatalogo>,
  });
  const auditoria: AuditoriaPrecios = Object.freeze({
    id: `${ajuste.id}:creacion`,
    quien: input.creadoPor,
    cuando: input.ahoraIso,
    antes: previa.map((l) => `${l.sku}=${l.vigenteCentavos}`).join(","),
    despues: previa.map((l) => `${l.sku}=${l.nuevoCentavos}`).join(","),
    motivo: `ajuste ${input.direccion} ${input.porcentaje}% ${input.vigenciaTipo}`,
  });
  return { status: 201, ajuste, previa, auditoria };
}

// ---------------------------------------------------------------------------
// GP3 vigencia + programados cancelables. Aplicado jamás se cancela:
// reversible solo vía ajuste nuevo. El job es función pura (sin infra).
// ---------------------------------------------------------------------------

export type CancelarResult =
  | { ok: true; ajuste: Ajuste; auditoria: AuditoriaPrecios }
  | { ok: false; error: string };

export function cancelarAjuste(
  ajuste: Ajuste,
  quien: string,
  ahoraIso: string,
): CancelarResult {
  if (ajuste.estado !== "pendiente") {
    return { ok: false, error: "solo pendiente es cancelable; aplicado revierte vía ajuste nuevo" };
  }
  if (ajuste.vigenciaTipo === "programada" && ajuste.aplicaEn !== null && ajuste.aplicaEn <= ahoraIso) {
    return { ok: false, error: "ya alcanzó vigencia, no cancelable" };
  }
  const cancelado: Ajuste = Object.freeze({ ...ajuste, estado: "cancelado" as const });
  const auditoria: AuditoriaPrecios = Object.freeze({
    id: `${ajuste.id}:cancelacion`,
    quien,
    cuando: ahoraIso,
    antes: "pendiente",
    despues: "cancelado",
    motivo: "cancelación de programado",
  });
  return { ok: true, ajuste: cancelado, auditoria };
}

export interface AplicadoJob {
  readonly ajuste: Ajuste;
  readonly nuevosPrecios: ReadonlyArray<LineaPrevia>;
}

export interface JobResult {
  readonly ajustes: ReadonlyArray<Ajuste>;
  readonly aplicados: ReadonlyArray<AplicadoJob>;
  readonly auditoria: ReadonlyArray<AuditoriaPrecios>;
}

// Job "aplica programados a hora vigencia": filtra pendientes con
// aplicaEn <= ahora, calcula con la misma fórmula GP1 y audita como Sistema.
export function aplicarProgramados(
  ajustes: ReadonlyArray<Ajuste>,
  ahoraIso: string,
): JobResult {
  const out: Ajuste[] = [];
  const aplicados: AplicadoJob[] = [];
  const auditoria: AuditoriaPrecios[] = [];
  for (const a of ajustes) {
    if (
      a.estado === "pendiente" &&
      a.vigenciaTipo === "programada" &&
      a.aplicaEn !== null &&
      a.aplicaEn <= ahoraIso
    ) {
      const nuevosPrecios = previsualizarAjuste(a.items, a.direccion, a.porcentaje, a.pasoCentavos);
      out.push(Object.freeze({ ...a, estado: "aplicado" as const }));
      aplicados.push({ ajuste: a, nuevosPrecios });
      auditoria.push(
        Object.freeze({
          id: `${a.id}:aplicacion`,
          quien: "sistema",
          cuando: ahoraIso,
          antes: nuevosPrecios.map((l) => `${l.sku}=${l.vigenteCentavos}`).join(","),
          despues: nuevosPrecios.map((l) => `${l.sku}=${l.nuevoCentavos}`).join(","),
          motivo: "job vigencia programada",
        }),
      );
    } else {
      out.push(a);
    }
  }
  return { ajustes: Object.freeze(out), aplicados: Object.freeze(aplicados), auditoria: Object.freeze(auditoria) };
}

// ---------------------------------------------------------------------------
// GP4 snapshot por línea + offline con catálogo local (sin recalcular).
// ---------------------------------------------------------------------------

export function congelarLinea(args: {
  readonly sku: string;
  readonly qty: number;
  readonly precioVigenteCentavos: bigint;
  readonly costoVigenteCentavos: bigint;
  readonly descuentoCentavos?: bigint;
  readonly precioId?: string;
}): LineaSnapshot {
  const dto = snapshotLineaSchema.parse({
    sku: args.sku,
    qty: args.qty,
    precio_vigente_centavos: Number(args.precioVigenteCentavos),
    costo_vigente_centavos: Number(args.costoVigenteCentavos),
    descuento_centavos: args.descuentoCentavos !== undefined ? Number(args.descuentoCentavos) : 0,
    precio_id: args.precioId,
  });
  return Object.freeze({
    sku: dto.sku,
    qty: dto.qty,
    precioCongeladoCentavos: BigInt(dto.precio_vigente_centavos),
    costoCongeladoCentavos: BigInt(dto.costo_vigente_centavos),
    descuentoCentavos: BigInt(dto.descuento_centavos),
    precioId: dto.precio_id ?? null,
  });
}

// Offline: usa el catálogo local tal cual; un ticket cerrado jamás se
// recalcula (ni por redondeo ni por ajustes posteriores).
export function resolverPrecioOffline(
  catalogoLocal: ReadonlyMap<string, bigint>,
  sku: string,
): bigint {
  const precio = catalogoLocal.get(sku);
  if (precio === undefined) throw new Error(`sin precio local para ${sku}`);
  return precio;
}

// Precio manual prevalece sobre la recomendación del bot/sistema.
export function elegirPrecioEnTicket(args: {
  readonly manualCentavos?: bigint;
  readonly recomendadoCentavos: bigint;
}): bigint {
  return args.manualCentavos ?? args.recomendadoCentavos;
}

// ---------------------------------------------------------------------------
// GP5 ficha costo/precio/ganancia + markup/margen, con tope de carga <60%.
// Markup/margen en puntos base (50.00% = 5000bp), mitad-arriba.
// ---------------------------------------------------------------------------

function pctBp(parte: bigint, todo: bigint): number | null {
  if (todo <= 0n) return null;
  const num = parte * 10_000n;
  const signo = num < 0n ? -1n : 1n;
  const abs = num * signo;
  let q = abs / todo;
  if ((abs % todo) * 2n >= todo) q += 1n;
  return Number(signo * q);
}

export function fichaProducto(args: {
  readonly costoCentavos: bigint;
  readonly precioCentavos: bigint;
  readonly impuestosPct?: number;
  readonly comisionesPct?: number;
}): FichaProducto {
  if (args.costoCentavos < 0n || args.precioCentavos < 0n) {
    throw new Error("ficha con montos negativos");
  }
  const impuestos = args.impuestosPct ?? 0;
  const comisiones = args.comisionesPct ?? 0;
  if (!Number.isFinite(impuestos) || !Number.isFinite(comisiones) || impuestos < 0 || comisiones < 0) {
    throw new Error("impuestos/comisiones inválidos");
  }
  const ganancia = args.precioCentavos - args.costoCentavos;
  const markupBp = args.costoCentavos > 0n ? pctBp(ganancia, args.costoCentavos) : null;
  const margenBp = args.precioCentavos > 0n ? pctBp(ganancia, args.precioCentavos) : null;
  const cargaBp =
    margenBp === null ? null : Math.round(impuestos * 100) + Math.round(comisiones * 100) + margenBp;
  return Object.freeze({
    gananciaCentavos: ganancia,
    markupBp,
    margenBp,
    cargaBp,
    cargaOk: cargaBp === null ? true : cargaBp < CARGA_MAX_PCT * 100,
  });
}

// Modo markup fijo: recalcula precio desde costo + markup y redondea arriba.
// Exige confirmación explícita porque pisa el precio manual vigente.
export function precioDesdeMarkup(args: {
  readonly costoCentavos: bigint;
  readonly markupPct: number;
  readonly pasoCentavos?: bigint;
  readonly confirmado: boolean;
}): { brutoCentavos: bigint; nuevoCentavos: bigint } {
  if (!args.confirmado) throw new Error("markup fijo requiere confirmación");
  if (args.costoCentavos < 0n) throw new Error("costo negativo");
  if (!Number.isFinite(args.markupPct) || args.markupPct < 0 || args.markupPct > 1000) {
    throw new Error("markup fuera de rango 0-1000");
  }
  const paso = args.pasoCentavos ?? PASO_DEFECTO;
  const bp = Math.round(args.markupPct * 100);
  const bruto = (args.costoCentavos * (10_000n + BigInt(bp)) + 5_000n) / 10_000n;
  return { brutoCentavos: bruto, nuevoCentavos: redondearArriba(bruto, paso) };
}

// ---------------------------------------------------------------------------
// GP7 config: solo Dueño online. Empleado => 403, offline => 403 sensible.
// ---------------------------------------------------------------------------

export type ActualizarSettingsResult =
  | { status: 200; settings: Settings; auditoria: AuditoriaPrecios }
  | { status: 403; error: string }
  | { status: 422; error: string };

export function actualizarSettings(args: {
  readonly rol: Rol;
  readonly online: boolean;
  readonly parche: Partial<Settings>;
  readonly quien: string;
  readonly ahoraIso: string;
}): ActualizarSettingsResult {
  if (args.rol !== "dueno") return { status: 403, error: "config de precios solo Dueño" };
  if (!args.online) return { status: 403, error: "config sensible exige online" };
  const paso = args.parche.pasoCentavos ?? SETTINGS_DEFECTO.pasoCentavos;
  try {
    redondearArriba(0n, paso);
  } catch {
    return { status: 422, error: "paso inválido (GP7: $1/$10/$50/$100)" };
  }
  if (args.parche.direccion !== undefined && args.parche.direccion !== "arriba") {
    return { status: 422, error: "dirección fija arriba" };
  }
  const topeSuba = args.parche.topeSubaBp ?? SETTINGS_DEFECTO.topeSubaBp;
  const topeBaja = args.parche.topeBajaBp ?? SETTINGS_DEFECTO.topeBajaBp;
  if (!Number.isInteger(topeSuba) || topeSuba < 1 || topeSuba > SUBA_MAX_BP) {
    return { status: 422, error: "tope suba inválido" };
  }
  if (!Number.isInteger(topeBaja) || topeBaja < 1 || topeBaja > BAJA_MAX_BP) {
    return { status: 422, error: "tope baja inválido" };
  }
  const settings: Settings = Object.freeze({
    pasoCentavos: paso,
    direccion: "arriba" as const,
    topeSubaBp: topeSuba,
    topeBajaBp: topeBaja,
  });
  const auditoria: AuditoriaPrecios = Object.freeze({
    id: `settings:${args.ahoraIso}`,
    quien: args.quien,
    cuando: args.ahoraIso,
    antes: `paso=${SETTINGS_DEFECTO.pasoCentavos}`,
    despues: `paso=${settings.pasoCentavos}`,
    motivo: "config redondeo GP7",
  });
  return { status: 200, settings, auditoria };
}

// ---------------------------------------------------------------------------
// GP8 auditoría inmutable genérica + GP10 señales sin montos.
// ---------------------------------------------------------------------------

export function auditar(args: {
  readonly quien: string;
  readonly cuando: string;
  readonly antes: string;
  readonly despues: string;
  readonly motivo: string;
  readonly id: string;
}): AuditoriaPrecios {
  if (!args.quien || !args.cuando || !args.id) throw new Error("auditoría incompleta");
  return Object.freeze({
    id: args.id,
    quien: args.quien,
    cuando: args.cuando,
    antes: args.antes,
    despues: args.despues,
    motivo: args.motivo,
  });
}

// GP10: 1 DB por cliente; al panel solo salen contadores, jamás centavos.
// Por construcción no hay campo de monto: si algún día se agrega, este tipo
// y su test lo bloquean.
export interface OpsSignalPrecios {
  readonly tipo: "precios_ajuste_creado" | "precios_ajuste_aplicado" | "precios_config";
  readonly cantidad: number;
  readonly ventana: string;
}

export function senalOpsSinMontos(args: {
  readonly tipo: OpsSignalPrecios["tipo"];
  readonly cantidad: number;
  readonly ventana: string;
}): OpsSignalPrecios {
  if (!Number.isInteger(args.cantidad) || args.cantidad < 0) throw new Error("cantidad inválida");
  return Object.freeze({ tipo: args.tipo, cantidad: args.cantidad, ventana: args.ventana });
}
