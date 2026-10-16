// LANE F — Facturas de servicios CS4/CS5/CS9/CS11 parcial (Nivel 2).
//
// Núcleo puro: sin IO, sin Drizzle, sin reloj propio (el "hoy" entra por
// parámetro para que el job nocturno y los tests sean deterministas).
// Todo inmutable: se devuelven valores nuevos congelados, nunca se muta
// la entrada. Dinero siempre bigint centavos.
//
// Alcance: normalización AR (CS4.6), suma ítems vs total 1% (ADR-0005),
// registro idempotente por message-id (CS9.1), estados pendiente/pagada +
// vencida DERIVADA (no persistida), próximas a vencer + vencidas (job
// nocturno = descriptor, ver ingesta_gmail.ts), pago con descriptor de
// egreso compatible con caja (CS5.1, sin tocar cash/), advertencias no
// bloqueantes CS4.7, señales ops sin montos (CS7.10/privacidad).
// Fuera: rutas HTTP, anulación CS11.2 (P1 con reversión C7), órdenes de
// pago CS6 (módulo payments), panel CS7, recordatorios CS12 (descriptores
// de eventos, el bot los emite).

import { z } from "zod";
import type { Servicio } from "./cuentas.js";

// ---------------------------------------------------------------------------
// Normalización AR (CS4.6, igual que Lane OCR/ADR-0005: "48.000,00",
// "48000" y "$ 48.000" normalizan al mismo valor en centavos).
// ---------------------------------------------------------------------------

// "164.800,00" -> 16480000n. Acepta punto de miles + coma decimal,
// entero en pesos ("48000"), "$ 48.000", decimales con 1 dígito ("48,5").
export function parsear_monto_ar(raw: string): bigint {
  const limpio = raw.trim().replace(/\$/g, "").replace(/\s+/g, "");
  if (!limpio) throw new Error("monto vacío");
  if (/-/.test(limpio)) throw new Error("monto negativo");
  let enteros: string;
  let decimales = "";
  const coma = limpio.lastIndexOf(",");
  if (coma >= 0) {
    enteros = limpio.slice(0, coma).replace(/\./g, "");
    decimales = limpio.slice(coma + 1);
    if (!/^\d{1,2}$/.test(decimales)) throw new Error(`monto inválido: ${raw}`);
    if (decimales.length === 1) decimales += "0";
  } else {
    enteros = limpio.replace(/\./g, "");
  }
  if (!/^\d+$/.test(enteros)) throw new Error(`monto inválido: ${raw}`);
  const pesos = BigInt(enteros === "" ? "0" : enteros);
  return pesos * 100n + BigInt(decimales === "" ? "0" : decimales);
}

// "20/10/2026" (o 20-10-2026, 20.10.2026) -> "2026-10-20".
// Acepta ISO "2026-10-20" passthrough. Valida calendario real.
export function parsear_fecha_ar(raw: string): string {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso?.[1] !== undefined && iso?.[2] !== undefined && iso?.[3] !== undefined) {
    exigir_fecha_real(Number(iso[1]), Number(iso[2]), Number(iso[3]), raw);
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const ar = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (!ar?.[1] || !ar?.[2] || !ar?.[3]) throw new Error(`fecha inválida: ${raw}`);
  const dia = Number(ar[1]);
  const mes = Number(ar[2]);
  const anio = Number(ar[3]);
  exigir_fecha_real(anio, mes, dia, raw);
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function exigir_fecha_real(anio: number, mes: number, dia: number, raw: string): void {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
    throw new Error(`fecha inválida: ${raw}`);
  }
  if (anio < 1900 || anio > 2200 || mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    throw new Error(`fecha inválida: ${raw}`);
  }
  const diasMes = [31, es_bisiesto(anio) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
  const tope = diasMes[(mes - 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11];
  if (dia > tope) throw new Error(`fecha inválida: ${raw}`);
}

function es_bisiesto(anio: number): boolean {
  return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
}

// Período de imputación MVP por fecha de emisión (CS7.6): "2026-10-08"
// -> "2026-10". El prorrateo de bimestres es P1.
export function periodo_de(fechaIso: string): string {
  return fechaIso.slice(0, 7);
}

// ADR-0005: suma de ítems vs total con tolerancia 1% (no bloquea, advierte).
export function suma_items_cuadra(itemsCentavos: ReadonlyArray<bigint>, totalCentavos: bigint): boolean {
  const suma = itemsCentavos.reduce((acc, v) => acc + v, 0n);
  const dif = suma >= totalCentavos ? suma - totalCentavos : totalCentavos - suma;
  const tolerancia = totalCentavos > 0n ? totalCentavos / 100n : 0n;
  const piso = 1n > tolerancia ? 1n : tolerancia;
  return dif <= piso;
}

// ---------------------------------------------------------------------------
// Tipos de dominio
// ---------------------------------------------------------------------------

export type OrigenExtraccion = "pdf_digital" | "ocr" | "email_respaldo";
export type ConfianzaCampo = "alta" | "media" | "baja";
export type EstadoGuardado = "pendiente" | "pagada";
// "vencida" es vista derivada (derivar_estado), nunca se persiste: así la
// fila confirmada queda inmutable salvo la transición pendiente->pagada.
export type EstadoVista = "pendiente" | "pagada" | "vencida";

export interface FacturaServicio {
  readonly id: string;
  readonly accountId: string;
  readonly messageId: string;
  readonly periodo: string;
  readonly vencimiento: string;
  readonly montoCentavos: bigint;
  readonly estado: EstadoGuardado;
  readonly necesitaRevision: boolean;
  readonly origen: OrigenExtraccion;
  readonly confianzaMonto: ConfianzaCampo;
  readonly confianzaVencimiento: ConfianzaCampo;
}

export const facturaSchema = z.object({
  account_id: z.string().min(1).max(128),
  message_id: z.string().min(1).max(256),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "período YYYY-MM"),
  vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "vencimiento YYYY-MM-DD"),
  monto_centavos: z.number().int().positive().max(999_999_999),
  necesita_revision: z.boolean().default(false),
  origen: z.enum(["pdf_digital", "ocr", "email_respaldo"]),
  confianza_monto: z.enum(["alta", "media", "baja"]).default("alta"),
  confianza_vencimiento: z.enum(["alta", "media", "baja"]).default("alta"),
});

// ---------------------------------------------------------------------------
// Registro idempotente CS9.1: message-id UNIQUE. Mismo contrato visible que
// crearAjuste (Lane C): retry idéntico => 409 con el original, nunca duplica.
// (En la capa de ingesta el duplicado se expone como 200+existente, E2.)
// ---------------------------------------------------------------------------

export interface RegistrarFacturaInput {
  readonly accountId: string;
  readonly messageId: string;
  readonly periodo: string;
  readonly vencimiento: string;
  readonly montoCentavos: bigint;
  readonly necesitaRevision?: boolean;
  readonly origen?: OrigenExtraccion;
  readonly confianzaMonto?: ConfianzaCampo;
  readonly confianzaVencimiento?: ConfianzaCampo;
  readonly itemsCentavos?: ReadonlyArray<bigint>;
  readonly promedioUltimos3Centavos?: bigint;
  readonly hoyIso?: string;
  readonly id?: string;
}

export type AdvertenciaFactura =
  | "vencimiento_pasado"
  | "monto_muy_distinto_promedio"
  | "suma_items_difiere"
  | "vencimiento_anterior_emision";

export interface RegistrarFacturaOk {
  readonly status: 201;
  readonly factura: FacturaServicio;
  readonly advertencias: ReadonlyArray<AdvertenciaFactura>;
}

export type RegistrarFacturaResult =
  | RegistrarFacturaOk
  | { readonly status: 409; readonly error: string; readonly original: FacturaServicio }
  | { readonly status: 422; readonly error: string };

export function registrar_factura(
  input: RegistrarFacturaInput,
  vistos: ReadonlyMap<string, FacturaServicio>,
): RegistrarFacturaResult {
  const visto = vistos.get(input.messageId);
  if (visto) return { status: 409, error: "message-id repetido", original: visto };
  if (!input.accountId || !input.messageId || input.messageId.length > 256) {
    return { status: 422, error: "factura inválida (cuenta/message-id)" };
  }
  if (!/^\d{4}-\d{2}$/.test(input.periodo)) return { status: 422, error: "período YYYY-MM" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.vencimiento)) return { status: 422, error: "vencimiento YYYY-MM-DD" };
  if (input.montoCentavos <= 0n) return { status: 422, error: "monto debe ser positivo" };

  const advertencias: AdvertenciaFactura[] = [];
  const hoy = input.hoyIso ?? input.vencimiento;
  if (input.vencimiento < hoy) advertencias.push("vencimiento_pasado");
  if (input.itemsCentavos !== undefined && !suma_items_cuadra(input.itemsCentavos, input.montoCentavos)) {
    advertencias.push("suma_items_difiere");
  }
  // CS4.7: monto ±50% vs promedio de los últimos 3 períodos (advertencia).
  const prom = input.promedioUltimos3Centavos;
  if (prom !== undefined && prom > 0n) {
    const dif = input.montoCentavos >= prom ? input.montoCentavos - prom : prom - input.montoCentavos;
    if (dif * 2n > prom) advertencias.push("monto_muy_distinto_promedio");
  }

  const factura: FacturaServicio = Object.freeze({
    id: input.id ?? crypto.randomUUID(),
    accountId: input.accountId,
    messageId: input.messageId,
    periodo: input.periodo,
    vencimiento: input.vencimiento,
    montoCentavos: input.montoCentavos,
    estado: "pendiente" as const,
    necesitaRevision: input.necesitaRevision ?? false,
    origen: input.origen ?? "pdf_digital",
    confianzaMonto: input.confianzaMonto ?? "alta",
    confianzaVencimiento: input.confianzaVencimiento ?? "alta",
  });
  return { status: 201, factura, advertencias: Object.freeze(advertencias) };
}

// ---------------------------------------------------------------------------
// Vencimientos: funciones puras deterministas (el job nocturno las llama;
// ver descriptor_job_vencimientos en ingesta_gmail.ts).
// ---------------------------------------------------------------------------

export function derivar_estado(factura: Pick<FacturaServicio, "estado" | "vencimiento">, hoyIso: string): EstadoVista {
  if (factura.estado === "pagada") return "pagada";
  return factura.vencimiento < hoyIso ? "vencida" : "pendiente";
}

export function dias_para_vencer(hoyIso: string, vencimientoIso: string): number {
  const ms = Date.parse(`${vencimientoIso}T00:00:00Z`) - Date.parse(`${hoyIso}T00:00:00Z`);
  return Math.floor(ms / 86_400_000);
}

// Próximas a vencer: pendientes con 0 <= días <= dentroDias, ordenadas.
export function proximas_a_vencer(
  facturas: ReadonlyArray<FacturaServicio>,
  hoyIso: string,
  dentroDias: number,
): FacturaServicio[] {
  return facturas
    .filter((f) => {
      if (derivar_estado(f, hoyIso) !== "pendiente") return false;
      const d = dias_para_vencer(hoyIso, f.vencimiento);
      return d >= 0 && d <= dentroDias;
    })
    .sort((a, b) => (a.vencimiento < b.vencimiento ? -1 : a.vencimiento > b.vencimiento ? 1 : 0));
}

export function vencidas(facturas: ReadonlyArray<FacturaServicio>, hoyIso: string): FacturaServicio[] {
  return facturas
    .filter((f) => derivar_estado(f, hoyIso) === "vencida")
    .sort((a, b) => (a.vencimiento < b.vencimiento ? -1 : a.vencimiento > b.vencimiento ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Pago CS5.1: registra el descriptor de egreso compatible con caja SIN
// modificar cash/. Origen "retiro" + tipo_retiro "gasto_operativo" pasa
// puede_registrar para Dueño y Empleado con permiso (C15: solo
// retiro_dueno exige Dueño). La categoría es la del tipo de servicio.
// El adaptador persiste factura pagada + egreso en UNA tx (CS5.4).
// ---------------------------------------------------------------------------

const CATEGORIA_POR_SERVICIO: Record<Servicio, string> = {
  luz: "luz",
  gas: "gas",
  agua: "agua",
  internet: "internet",
  telefono: "telefono",
  tasas: "tasas_municipales",
  arca: "arca",
  otro: "servicios",
};

export function categoria_para(servicio: Servicio): string {
  return CATEGORIA_POR_SERVICIO[servicio];
}

export interface EgresoServicio {
  readonly tipo: "egreso";
  readonly metodo: "Efectivo" | "Debito" | "Mercado Pago" | "QR" | "Transferencia";
  readonly monto_centavos: bigint;
  readonly origen: "retiro";
  readonly categoria_id: string;
  readonly tipo_retiro: "gasto_operativo";
  readonly nota: string;
}

export type PagarServicioResult =
  | { readonly status: 200; readonly factura: FacturaServicio; readonly egreso: EgresoServicio }
  | { readonly status: 409; readonly error: string }
  | { readonly status: 422; readonly error: string };

export function pagar_servicio(
  factura: FacturaServicio,
  args: {
    readonly servicio: Servicio;
    readonly proveedor: string;
    readonly numeroCuenta: string | null;
    readonly medio: EgresoServicio["metodo"];
    readonly notaExtra?: string;
  },
): PagarServicioResult {
  if (factura.estado === "pagada") return { status: 409, error: "factura ya pagada" };
  if (factura.montoCentavos <= 0n) return { status: 422, error: "monto inválido" };
  const cuentaTxt = args.numeroCuenta === null ? "s/c" : args.numeroCuenta;
  const base = `${args.proveedor} - Cuenta ${cuentaTxt} - Vto. ${factura.vencimiento.slice(8, 10)}/${factura.vencimiento.slice(5, 7)}`;
  const nota = args.notaExtra === undefined ? base : `${base} (${args.notaExtra})`;
  const egreso: EgresoServicio = Object.freeze({
    tipo: "egreso" as const,
    metodo: args.medio,
    monto_centavos: factura.montoCentavos,
    origen: "retiro" as const,
    categoria_id: categoria_para(args.servicio),
    tipo_retiro: "gasto_operativo" as const,
    nota: nota.slice(0, 280),
  });
  // Inmutable salvo la transición pendiente->pagada (CS11.1: período,
  // vencimiento, monto y message-id quedan intactos por construcción).
  const pagada: FacturaServicio = Object.freeze({ ...factura, estado: "pagada" as const });
  return { status: 200, factura: pagada, egreso };
}

// ---------------------------------------------------------------------------
// CS9.4 posible duplicado: misma cuenta + mismo monto + vencimiento a ±5
// días => advertir con [Es otra factura] [Es la misma]. Período distinto
// (misma cuenta y monto otro mes) NO duplica. Las anuladas se excluyen en
// el adaptador (requieren migración CS11.2, fuera de este slice).
// ---------------------------------------------------------------------------

export function es_posible_duplicado(
  candidata: Pick<FacturaServicio, "accountId" | "montoCentavos" | "vencimiento">,
  existentes: ReadonlyArray<Pick<FacturaServicio, "accountId" | "montoCentavos" | "vencimiento">>,
): boolean {
  return existentes.some(
    (e) =>
      e.accountId === candidata.accountId &&
      e.montoCentavos === candidata.montoCentavos &&
      Math.abs(dias_para_vencer(e.vencimiento, candidata.vencimiento)) <= 5,
  );
}

// ---------------------------------------------------------------------------
// CS5.6 vínculo con egreso cargado a mano: misma categoría, monto igual o
// parecido (tolerancia 1% de ADR-0005) en los últimos 10 días. Devuelve el
// más reciente o null (el Dueño elige [Sí, vincular] [No, es otro]).
// ---------------------------------------------------------------------------

export interface EgresoCandidato {
  readonly id: string;
  readonly categoriaId: string;
  readonly montoCentavos: bigint;
  readonly fechaIso: string;
}

export function sugerir_vinculo_egreso(
  factura: Pick<FacturaServicio, "montoCentavos">,
  categoriaId: string,
  egresos: ReadonlyArray<EgresoCandidato>,
  hoyIso: string,
): EgresoCandidato | null {
  const ventana = egresos
    .filter((e) => e.categoriaId === categoriaId)
    .filter((e) => {
      const d = dias_para_vencer(e.fechaIso, hoyIso);
      return d >= 0 && d <= 10;
    })
    .filter((e) => suma_items_cuadra([factura.montoCentavos], e.montoCentavos))
    .sort((a, b) => (a.fechaIso < b.fechaIso ? 1 : a.fechaIso > b.fechaIso ? -1 : 0));
  return ventana[0] ?? null;
}

// ---------------------------------------------------------------------------
// CS7 núcleo: totales del período por cuenta + variación contra el período
// anterior. Suma en bigint al centavo; variación entera en % o null sin
// base previa. Solo agrupa; el panel filtra confirmadas no anuladas.
// ---------------------------------------------------------------------------

export interface ResumenCuenta {
  readonly accountId: string;
  readonly totalCentavos: bigint;
  readonly previoCentavos: bigint;
  readonly variacionPct: number | null;
}

export interface ResumenConsumos {
  readonly periodo: string;
  readonly porCuenta: ReadonlyArray<ResumenCuenta>;
  readonly totalPeriodoCentavos: bigint;
}

function periodo_anterior(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  if (mes === 1) return `${String((anio ?? 0) - 1).padStart(4, "0")}-12`;
  return `${String(anio).padStart(4, "0")}-${String((mes ?? 2) - 1).padStart(2, "0")}`;
}

export function resumen_consumos(
  facturas: ReadonlyArray<Pick<FacturaServicio, "accountId" | "periodo" | "montoCentavos">>,
  periodo: string,
): ResumenConsumos {
  const previo = periodo_anterior(periodo);
  const totales = new Map<string, bigint>();
  const previos = new Map<string, bigint>();
  for (const f of facturas) {
    if (f.periodo === periodo) totales.set(f.accountId, (totales.get(f.accountId) ?? 0n) + f.montoCentavos);
    else if (f.periodo === previo) previos.set(f.accountId, (previos.get(f.accountId) ?? 0n) + f.montoCentavos);
  }
  const porCuenta: ResumenCuenta[] = [...totales.entries()].map(([accountId, total]) => {
    const base = previos.get(accountId) ?? 0n;
    const variacionPct =
      base > 0n ? Math.round(Number((total - base) * 100n / base)) : null;
    return Object.freeze({ accountId, totalCentavos: total, previoCentavos: base, variacionPct });
  });
  const totalPeriodo = [...totales.values()].reduce((acc, v) => acc + v, 0n);
  return Object.freeze({ periodo, porCuenta: Object.freeze(porCuenta), totalPeriodoCentavos: totalPeriodo });
}

// ---------------------------------------------------------------------------
// Descriptores de eventos (el bot/email los emite; acá solo se describen,
// igual que senalOpsSinMontos en Lane C). Sin montos hacia el panel.
// ---------------------------------------------------------------------------

export interface EventoServicios {
  readonly tipo:
    | "servicios_factura_registrada"
    | "servicios_factura_pagada"
    | "servicios_vencimiento_proximo"
    | "servicios_factura_vencida";
  readonly facturaId: string;
  readonly accountId: string;
  readonly periodo: string;
  readonly necesitaRevision: boolean;
}

export function evento_factura(factura: FacturaServicio, tipo: EventoServicios["tipo"]): EventoServicios {
  return Object.freeze({
    tipo,
    facturaId: factura.id,
    accountId: factura.accountId,
    periodo: factura.periodo,
    necesitaRevision: factura.necesitaRevision,
  });
}

export interface OpsSignalServicios {
  readonly tipo: "servicios_factura_detectada" | "servicios_factura_pagada" | "servicios_conexion_caida";
  readonly cantidad: number;
  readonly ventana: string;
}

// Por construcción no hay campo de monto: si algún día se agrega, el tipo
// y su test lo bloquean (mismo criterio que OpsSignalPrecios, Lane C).
export function senal_ops_servicios(args: {
  readonly tipo: OpsSignalServicios["tipo"];
  readonly cantidad: number;
  readonly ventana: string;
}): OpsSignalServicios {
  if (!Number.isInteger(args.cantidad) || args.cantidad < 0) throw new Error("cantidad inválida");
  return Object.freeze({ tipo: args.tipo, cantidad: args.cantidad, ventana: args.ventana });
}
