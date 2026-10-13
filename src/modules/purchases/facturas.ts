// LANE E — Facturas de proveedores FP1-FP12: ingesta→borrador→confirmación.
// Núcleo puro: sin IO, sin Drizzle, sin reloj propio (ahoraIso entra por
// parámetro). Sin bot WA, sin Photos, sin PaddleOCR: el núcleo recibe
// bytes_ref + texto extraído como input puro; la confianza por campo la trae
// el llamante (el motor OCR real vive fuera de este lane).
// Reglas ADR-0005: nada se registra sin toque explícito [Confirmar]; E1
// bloquea confirmar (422) si fecha/monto con confianza baja; E2 duplicado
// por wamid/message-id devuelve existente (200) sin reprocesar; E5 vencido
// a 7 días bloquea confirmar/editar/descartar (410, solo lectura).
// supplier_invoices INMUTABLE (solo INSERT + compensatorio nota_credito);
// supplier_drafts MUTABLE. Dinero siempre bigint centavos.

import { z } from "zod";
import type { Medio } from "../../lib/validation.js";
import { normalizarCuit, validarCuit } from "./proveedores.js";

export type ConfianzaCampo = "alta" | "media" | "baja";
export type OrigenIngesta = "wa" | "gmail";
export type EstadoBorrador = "pendiente" | "confirmada" | "descartada";

export const VENCIMIENTO_BORRADOR_MS = 7 * 24 * 60 * 60 * 1000;

export interface ItemBorrador {
  readonly sku: string | null;
  readonly cantidad: number;
  readonly subtotalCentavos: bigint;
}

export interface ConfianzaPorCampo {
  readonly cuit: ConfianzaCampo;
  readonly fecha: ConfianzaCampo;
  readonly total: ConfianzaCampo;
}

export interface Borrador {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly origen: OrigenIngesta;
  readonly bytesRef: string;
  readonly cuit: string | null;
  readonly nombreProveedor: string | null;
  readonly fechaIso: string | null;
  readonly totalCentavos: bigint | null;
  readonly items: ReadonlyArray<ItemBorrador>;
  readonly confianza: ConfianzaPorCampo;
  readonly estado: EstadoBorrador;
  readonly fotoPendiente: boolean;
  readonly confirmadoPor: string | null;
  readonly facturaId: string | null;
  readonly creadoEn: string;
  readonly venceAt: string;
}

export interface Factura {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly draftId: string;
  readonly supplierCuit: string;
  readonly nombreProveedor: string | null;
  readonly tipo: "factura" | "nota_credito";
  readonly fechaIso: string;
  readonly totalCentavos: bigint;
  readonly items: ReadonlyArray<ItemBorrador>;
  readonly compensatoriaDe: string | null;
  readonly creadoPor: string;
  readonly creadoEn: string;
}

export interface PagoProveedor {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly facturaId: string | null;
  readonly supplierCuit: string;
  readonly montoCentavos: bigint;
  readonly metodo: Medio;
  readonly creadoPor: string;
  readonly fechaIso: string;
  readonly creadoEn: string;
}

// Descriptor compatible con caja SIN importar cash/: la ruta HTTP lo persiste
// como cash_movements {origen: "retiro", tipo_retiro: "gasto_operativo",
// categoria_id: "pago_proveedor"}. Este lane nunca escribe cash_movements.
export interface EgresoCajaDescriptor {
  readonly tipo: "egreso";
  readonly categoriaId: "pago_proveedor";
  readonly montoCentavos: bigint;
  readonly metodo: Medio;
  readonly nota: string;
}

// Descriptor para alimentar cost_history (Lane C) SIN importar pricing/:
// la ruta HTTP inserta una fila por descriptor con motivo trazable.
export interface CostoDescriptor {
  readonly sku: string;
  readonly costoCentavos: bigint;
  readonly motivo: string;
}

// ---------------------------------------------------------------------------
// Normalización AR: montos "164.800,00" (punto miles, coma decimal) y fechas
// dd/mm/aaaa. Throw con mensaje; el llamante decide 422/415.
// ---------------------------------------------------------------------------

export function parseMontoAR(texto: string): bigint {
  const t = texto.trim().replace(/^\$\s*/, "").replace(/\s+/g, "");
  if (!t || t.startsWith("-")) throw new Error("monto AR inválido");
  let enteroTxt: string;
  let decTxt: string;
  if (t.includes(",")) {
    const partes = t.split(",");
    if (partes.length !== 2) throw new Error("monto AR inválido");
    const ent = partes[0] ?? "";
    const dec = partes[1] ?? "";
    if (!/^\d{1,3}(\.\d{3})*$/.test(ent) && !/^\d+$/.test(ent)) {
      throw new Error("monto AR inválido");
    }
    if (!/^\d{1,2}$/.test(dec)) throw new Error("monto AR inválido");
    enteroTxt = ent.replace(/\./g, "");
    decTxt = dec.padEnd(2, "0");
  } else {
    if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new Error("monto AR inválido");
    const partes = t.split(".");
    if (partes.length === 2 && (partes[1]?.length ?? 0) === 3 && t.length > 4) {
      // "164.800" ambiguo: con punto y 3 decimales se lee como miles AR.
      enteroTxt = t.replace(/\./g, "");
      decTxt = "00";
    } else if (partes.length === 2) {
      enteroTxt = partes[0] ?? "0";
      decTxt = (partes[1] ?? "").padEnd(2, "0");
    } else {
      enteroTxt = t;
      decTxt = "00";
    }
  }
  if (!/^\d+$/.test(enteroTxt)) throw new Error("monto AR inválido");
  return BigInt(enteroTxt) * 100n + BigInt(decTxt);
}

export function parseFechaAR(texto: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim());
  if (!m) throw new Error("fecha AR inválida (dd/mm/aaaa)");
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) throw new Error("fecha AR inválida");
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) {
    throw new Error("fecha AR inexistente");
  }
  const p2 = (n: number): string => String(n).padStart(2, "0");
  return `${yyyy}-${p2(mm)}-${p2(dd)}`;
}

export const ingestaBorradorSchema = z.object({
  idempotency_key: z.string().min(1).max(128),
  origen: z.enum(["wa", "gmail"]),
  bytes_ref: z.string().min(1).max(512),
  es_comprobante: z.boolean(),
  cuit_texto: z.string().max(14).optional(),
  nombre_proveedor: z.string().max(80).optional(),
  fecha_texto: z.string().max(10).optional(),
  total_texto: z.string().max(32).optional(),
});

// Suma de ítems vs total con tolerancia 1% (ADR-0005 normalización AR).
export function verificarSumaItems(
  items: ReadonlyArray<ItemBorrador>,
  totalCentavos: bigint,
): { ok: boolean; diferenciaCentavos: bigint } {
  let suma = 0n;
  for (const it of items) suma += it.subtotalCentavos;
  const diferenciaCentavos = suma >= totalCentavos ? suma - totalCentavos : totalCentavos - suma;
  if (totalCentavos <= 0n) return { ok: suma === 0n, diferenciaCentavos };
  return { ok: diferenciaCentavos * 100n <= totalCentavos, diferenciaCentavos };
}

// ---------------------------------------------------------------------------
// Ingesta: crea el borrador MUTABLE. E2: clave repetida → 200 con existente.
// E3: no comprobante → 415, job no creado. Nunca registra factura.
// ---------------------------------------------------------------------------

export interface IngerirBorradorInput {
  readonly idempotencyKey: string;
  readonly origen: OrigenIngesta;
  readonly bytesRef: string;
  readonly esComprobante: boolean;
  readonly cuitTexto?: string | undefined;
  readonly nombreProveedor?: string | undefined;
  readonly fechaTexto?: string | undefined;
  readonly totalTexto?: string | undefined;
  readonly items?: ReadonlyArray<ItemBorrador> | undefined;
  readonly confianza?: Partial<ConfianzaPorCampo> | undefined;
  readonly fotoPendiente?: boolean | undefined;
  readonly ahoraIso: string;
  readonly vistos: ReadonlyMap<string, Borrador>;
}

export type IngerirBorradorResult =
  | { status: 201; borrador: Borrador; avisoRevisar: boolean }
  | { status: 200; borrador: Borrador; duplicado: true }
  | { status: 415; error: string }
  | { status: 422; error: string };

function itemsValidos(items: ReadonlyArray<ItemBorrador>): boolean {
  if (items.length > 100) return false;
  for (const it of items) {
    if (!Number.isInteger(it.cantidad) || it.cantidad < 1) return false;
    if (it.subtotalCentavos < 0n || it.subtotalCentavos > 999_999_999_00n) return false;
    if (it.sku !== null && (it.sku.length === 0 || it.sku.length > 64)) return false;
  }
  return true;
}

export function ingerirBorrador(input: IngerirBorradorInput): IngerirBorradorResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { status: 200, borrador: visto, duplicado: true };
  if (!input.esComprobante) return { status: 415, error: "adjunto no es comprobante" };
  if (!input.idempotencyKey || !input.bytesRef) return { status: 422, error: "ingesta inválida" };
  const items = input.items ?? [];
  if (!itemsValidos(items)) return { status: 422, error: "ítems inválidos" };

  let cuit: string | null = null;
  let confCuit: ConfianzaCampo = "baja";
  if (input.cuitTexto !== undefined && input.cuitTexto.trim() !== "") {
    if (validarCuit(input.cuitTexto)) {
      cuit = normalizarCuit(input.cuitTexto);
      confCuit = "alta";
    } else {
      confCuit = "baja";
    }
  }
  let fechaIso: string | null = null;
  let confFecha: ConfianzaCampo = "baja";
  if (input.fechaTexto !== undefined && input.fechaTexto.trim() !== "") {
    try {
      fechaIso = parseFechaAR(input.fechaTexto);
      confFecha = "alta";
    } catch {
      confFecha = "baja";
    }
  }
  let totalCentavos: bigint | null = null;
  let confTotal: ConfianzaCampo = "baja";
  if (input.totalTexto !== undefined && input.totalTexto.trim() !== "") {
    try {
      totalCentavos = parseMontoAR(input.totalTexto);
      confTotal = "alta";
    } catch {
      confTotal = "baja";
    }
  }
  const confianza: ConfianzaPorCampo = Object.freeze({
    cuit: input.confianza?.cuit ?? confCuit,
    fecha: input.confianza?.fecha ?? confFecha,
    total: input.confianza?.total ?? confTotal,
  });
  const borrador: Borrador = Object.freeze({
    id: `borr-${input.idempotencyKey}`,
    idempotencyKey: input.idempotencyKey,
    origen: input.origen,
    bytesRef: input.bytesRef,
    cuit,
    nombreProveedor: input.nombreProveedor?.trim() || null,
    fechaIso,
    totalCentavos,
    items: Object.freeze([...items]),
    confianza,
    estado: "pendiente" as const,
    fotoPendiente: input.fotoPendiente ?? false,
    confirmadoPor: null,
    facturaId: null,
    creadoEn: input.ahoraIso,
    venceAt: new Date(Date.parse(input.ahoraIso) + VENCIMIENTO_BORRADOR_MS).toISOString(),
  });
  const avisoRevisar =
    confianza.cuit === "media" || confianza.fecha === "media" || confianza.total === "media";
  return { status: 201, borrador, avisoRevisar };
}

// Estado derivado: vencida se calcula contra ahoraIso, no se persiste.
export function estadoBorrador(
  b: Borrador,
  ahoraIso: string,
): "pendiente" | "confirmada" | "descartada" | "vencida" {
  if (b.estado !== "pendiente") return b.estado;
  return ahoraIso > b.venceAt ? "vencida" : "pendiente";
}

// ---------------------------------------------------------------------------
// Editar: borrador MUTABLE por texto ("monto 164800"). Lo editado por humano
// sube a confianza alta. Vencido → 410, resuelto → 409.
// ---------------------------------------------------------------------------

export interface ParcheBorrador {
  readonly cuitTexto?: string | undefined;
  readonly nombreProveedor?: string | undefined;
  readonly fechaTexto?: string | undefined;
  readonly totalTexto?: string | undefined;
  readonly items?: ReadonlyArray<ItemBorrador> | undefined;
  readonly fotoPendiente?: boolean | undefined;
}

export type EditarBorradorResult =
  | { status: 200; borrador: Borrador }
  | { status: 409; error: string }
  | { status: 410; error: string }
  | { status: 422; error: string };

export function editarBorrador(
  actual: Borrador,
  parche: ParcheBorrador,
  ahoraIso: string,
): EditarBorradorResult {
  if (actual.estado !== "pendiente") {
    return { status: 409, error: "borrador ya resuelto (confirmado o descartado)" };
  }
  if (ahoraIso > actual.venceAt) return { status: 410, error: "borrador vencido, solo lectura" };

  let cuit = actual.cuit;
  let confCuit = actual.confianza.cuit;
  if (parche.cuitTexto !== undefined) {
    if (!validarCuit(parche.cuitTexto)) return { status: 422, error: "cuit inválido" };
    cuit = normalizarCuit(parche.cuitTexto);
    confCuit = "alta";
  }
  let fechaIso = actual.fechaIso;
  let confFecha = actual.confianza.fecha;
  if (parche.fechaTexto !== undefined) {
    try {
      fechaIso = parseFechaAR(parche.fechaTexto);
    } catch {
      return { status: 422, error: "fecha inválida (dd/mm/aaaa)" };
    }
    confFecha = "alta";
  }
  let totalCentavos = actual.totalCentavos;
  let confTotal = actual.confianza.total;
  if (parche.totalTexto !== undefined) {
    try {
      totalCentavos = parseMontoAR(parche.totalTexto);
    } catch {
      return { status: 422, error: "monto inválido" };
    }
    confTotal = "alta";
  }
  let items = actual.items;
  if (parche.items !== undefined) {
    if (!itemsValidos(parche.items)) return { status: 422, error: "ítems inválidos" };
    items = Object.freeze([...parche.items]);
  }
  return {
    status: 200,
    borrador: Object.freeze({
      ...actual,
      cuit,
      nombreProveedor:
        parche.nombreProveedor !== undefined
          ? parche.nombreProveedor.trim() || null
          : actual.nombreProveedor,
      fechaIso,
      totalCentavos,
      items,
      confianza: Object.freeze({ cuit: confCuit, fecha: confFecha, total: confTotal }),
      fotoPendiente: parche.fotoPendiente ?? actual.fotoPendiente,
    }),
  };
}

// ---------------------------------------------------------------------------
// Confirmar: ÚNICO camino que registra factura (toque explícito). E1: fecha o
// monto en baja → 422. E5: vencido → 410. Reintento → 409.
// ---------------------------------------------------------------------------

export interface ConfirmarBorradorInput {
  readonly quien: string;
  readonly ahoraIso: string;
}

export type ConfirmarBorradorResult =
  | {
      status: 201;
      factura: Factura;
      borrador: Borrador;
      descriptoresCosto: ReadonlyArray<CostoDescriptor>;
      avisoRevisar: boolean;
    }
  | { status: 409; error: string }
  | { status: 410; error: string }
  | { status: 422; error: string };

export function confirmarBorrador(
  actual: Borrador,
  input: ConfirmarBorradorInput,
): ConfirmarBorradorResult {
  if (actual.estado !== "pendiente") {
    return { status: 409, error: "borrador ya resuelto (confirmado o descartado)" };
  }
  if (input.ahoraIso > actual.venceAt) return { status: 410, error: "borrador vencido" };
  if (actual.confianza.fecha === "baja" || actual.confianza.total === "baja") {
    return { status: 422, error: "confianza baja en fecha o monto: corregir por texto (E1)" };
  }
  if (actual.cuit === null) return { status: 422, error: "cuit requerido" };
  if (actual.fechaIso === null) return { status: 422, error: "fecha requerida" };
  if (actual.totalCentavos === null || actual.totalCentavos <= 0n) {
    return { status: 422, error: "monto requerido y positivo" };
  }
  if (actual.items.length > 0) {
    const v = verificarSumaItems(actual.items, actual.totalCentavos);
    if (!v.ok) return { status: 422, error: "suma de ítems difiere del total (>1%)" };
  }
  const factura: Factura = Object.freeze({
    id: `fac-${actual.idempotencyKey}`,
    idempotencyKey: actual.idempotencyKey,
    draftId: actual.id,
    supplierCuit: actual.cuit,
    nombreProveedor: actual.nombreProveedor,
    tipo: "factura" as const,
    fechaIso: actual.fechaIso,
    totalCentavos: actual.totalCentavos,
    items: actual.items,
    compensatoriaDe: null,
    creadoPor: input.quien,
    creadoEn: input.ahoraIso,
  });
  const borrador: Borrador = Object.freeze({
    ...actual,
    estado: "confirmada" as const,
    confirmadoPor: input.quien,
    facturaId: factura.id,
  });
  const avisoRevisar =
    actual.confianza.cuit === "media" ||
    actual.confianza.fecha === "media" ||
    actual.confianza.total === "media";
  return {
    status: 201,
    factura,
    borrador,
    descriptoresCosto: Object.freeze(descriptoresCosto(factura)),
    avisoRevisar,
  };
}

export type DescartarBorradorResult =
  | { status: 200; borrador: Borrador }
  | { status: 409; error: string }
  | { status: 410; error: string };

export function descartarBorrador(
  actual: Borrador,
  ahoraIso: string,
): DescartarBorradorResult {
  if (actual.estado !== "pendiente") return { status: 409, error: "borrador ya resuelto" };
  if (ahoraIso > actual.venceAt) return { status: 410, error: "borrador vencido, solo lectura" };
  return { status: 200, borrador: Object.freeze({ ...actual, estado: "descartada" as const }) };
}

// ---------------------------------------------------------------------------
// Factura INMUTABLE: sin editores. La corrección es compensatorio
// (nota_credito que referencia, nunca muta el original).
// ---------------------------------------------------------------------------

export interface AnularFacturaInput {
  readonly idempotencyKey: string;
  readonly motivo: string;
  readonly quien: string;
  readonly ahoraIso: string;
  readonly vistos: ReadonlyMap<string, Factura>;
  readonly compensadas: ReadonlySet<string>;
}

export type AnularFacturaResult =
  | { status: 201; compensatorio: Factura }
  | { status: 409; error: string; original?: Factura }
  | { status: 422; error: string };

export function anularFacturaConCompensatorio(
  factura: Factura,
  input: AnularFacturaInput,
): AnularFacturaResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) {
    if (visto.compensatoriaDe === factura.id) {
      return { status: 409, error: "idempotency-key repetida", original: visto };
    }
    return { status: 409, error: "idempotency-key repetida con distinto cuerpo" };
  }
  if (factura.tipo !== "factura") return { status: 422, error: "solo una factura se compensa" };
  if (input.compensadas.has(factura.id)) return { status: 409, error: "factura ya compensada" };
  if (!input.motivo.trim()) return { status: 422, error: "motivo requerido" };
  return {
    status: 201,
    compensatorio: Object.freeze({
      id: `nc-${input.idempotencyKey}`,
      idempotencyKey: input.idempotencyKey,
      draftId: factura.draftId,
      supplierCuit: factura.supplierCuit,
      nombreProveedor: factura.nombreProveedor,
      tipo: "nota_credito" as const,
      fechaIso: factura.fechaIso,
      totalCentavos: factura.totalCentavos,
      items: factura.items,
      compensatoriaDe: factura.id,
      creadoPor: input.quien,
      creadoEn: input.ahoraIso,
    }),
  };
}

// Costo unitario por ítem con sku: alimenta cost_history vía descriptor
// (la inserción real la hace la ruta, fuera de este lane).
export function descriptoresCosto(factura: Factura): CostoDescriptor[] {
  const out: CostoDescriptor[] = [];
  for (const it of factura.items) {
    if (it.sku === null || it.cantidad < 1) continue;
    out.push(
      Object.freeze({
        sku: it.sku,
        costoCentavos: it.subtotalCentavos / BigInt(it.cantidad),
        motivo: `factura ${factura.id}`,
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pagos: registran egreso compatible con caja vía descriptor (sin tocar
// cash/). Pago que excede el saldo se rechaza 422.
// ---------------------------------------------------------------------------

export interface RegistrarPagoInput {
  readonly idempotencyKey: string;
  readonly factura?: Factura | null | undefined;
  readonly supplierCuit: string;
  readonly montoCentavos: bigint;
  readonly metodo: Medio;
  readonly fechaIso: string;
  readonly creadoPor: string;
  readonly ahoraIso: string;
  readonly vistos: ReadonlyMap<string, PagoProveedor>;
  readonly pagosPrevios: ReadonlyArray<PagoProveedor>;
}

export type RegistrarPagoResult =
  | { status: 201; pago: PagoProveedor; egresoCaja: EgresoCajaDescriptor }
  | { status: 409; error: string; original?: PagoProveedor }
  | { status: 422; error: string };

function cuerpoPagoIgual(a: PagoProveedor, b: RegistrarPagoInput): boolean {
  const facturaId = b.factura?.id ?? null;
  return (
    a.facturaId === facturaId &&
    a.supplierCuit === normalizarCuit(b.supplierCuit) &&
    a.montoCentavos === b.montoCentavos &&
    a.metodo === b.metodo &&
    a.fechaIso === b.fechaIso
  );
}

export function saldoFactura(
  factura: Factura,
  pagos: ReadonlyArray<PagoProveedor>,
): bigint {
  let pagado = 0n;
  for (const p of pagos) {
    if (p.facturaId === factura.id) pagado += p.montoCentavos;
  }
  return factura.totalCentavos - pagado;
}

export function egresoCajaParaPago(pago: PagoProveedor): EgresoCajaDescriptor {
  return Object.freeze({
    tipo: "egreso" as const,
    categoriaId: "pago_proveedor" as const,
    montoCentavos: pago.montoCentavos,
    metodo: pago.metodo,
    nota: `pago ${pago.id} fac ${pago.facturaId ?? "s/factura"}`,
  });
}

export function registrarPago(input: RegistrarPagoInput): RegistrarPagoResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) {
    if (cuerpoPagoIgual(visto, input)) {
      return { status: 409, error: "idempotency-key repetida", original: visto };
    }
    return { status: 409, error: "idempotency-key repetida con distinto cuerpo" };
  }
  const cuit = normalizarCuit(input.supplierCuit);
  if (!validarCuit(cuit)) return { status: 422, error: "cuit proveedor inválido" };
  if (input.montoCentavos <= 0n) return { status: 422, error: "monto debe ser positivo" };
  if (!input.creadoPor) return { status: 422, error: "pago inválido" };
  if (input.factura) {
    if (input.factura.supplierCuit !== cuit) {
      return { status: 422, error: "pago de otro proveedor" };
    }
    if (input.factura.tipo !== "factura") return { status: 422, error: "no se paga una nota" };
    if (input.montoCentavos > saldoFactura(input.factura, input.pagosPrevios)) {
      return { status: 422, error: "pago excede saldo de la factura" };
    }
  }
  const pago: PagoProveedor = Object.freeze({
    id: `pag-${input.idempotencyKey}`,
    idempotencyKey: input.idempotencyKey,
    facturaId: input.factura?.id ?? null,
    supplierCuit: cuit,
    montoCentavos: input.montoCentavos,
    metodo: input.metodo,
    creadoPor: input.creadoPor,
    fechaIso: input.fechaIso,
    creadoEn: input.ahoraIso,
  });
  return { status: 201, pago, egresoCaja: egresoCajaParaPago(pago) };
}

export interface EstadoCuenta {
  readonly totalFacturadoCentavos: bigint;
  readonly totalPagadoCentavos: bigint;
  readonly saldoCentavos: bigint;
}

export function estadoCuenta(
  supplierCuit: string,
  facturas: ReadonlyArray<Factura>,
  pagos: ReadonlyArray<PagoProveedor>,
): EstadoCuenta {
  const cuit = normalizarCuit(supplierCuit);
  let facturado = 0n;
  for (const f of facturas) {
    if (f.supplierCuit === cuit && f.tipo === "factura") facturado += f.totalCentavos;
  }
  let pagado = 0n;
  for (const p of pagos) {
    if (p.supplierCuit === cuit) pagado += p.montoCentavos;
  }
  return Object.freeze({
    totalFacturadoCentavos: facturado,
    totalPagadoCentavos: pagado,
    saldoCentavos: facturado - pagado,
  });
}
