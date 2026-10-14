// LANE E — Proveedores y órdenes de compra FP1-FP12 (Nivel 2: Compras).
// Núcleo puro: sin IO, sin Drizzle, sin reloj propio (ahoraIso entra por
// parámetro para que jobs y tests sean deterministas). Todo inmutable: se
// devuelven valores nuevos congelados, nunca se muta la entrada.
// Dinero siempre bigint centavos.
// Alcance: suppliers (crear/editar) + purchase_orders (crear/editar/cerrar).
// NO toca cash/, sales/, credit/, pricing/ ni schema.ts: las tablas viven en
// src/db/schema-proveedores.ts.

import { z } from "zod";

// ---------------------------------------------------------------------------
// CUIT: 11 dígitos con dígito verificador (pesos 5 4 3 2 7 6 5 4 3 2,
// módulo 11; resto 11→0, resto 10→9). Acepta guiones/puntos/espacios.
// ---------------------------------------------------------------------------

const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export function normalizarCuit(input: string): string {
  return input.replace(/\D/g, "");
}

export function validarCuit(input: string): boolean {
  const d = normalizarCuit(input);
  if (!/^\d{11}$/.test(d)) return false;
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    const dig = d.charCodeAt(i) - 48;
    if (dig < 0 || dig > 9) return false;
    suma += dig * (PESOS_CUIT[i] ?? 0);
  }
  let ver = 11 - (suma % 11);
  if (ver === 11) ver = 0;
  else if (ver === 10) ver = 9;
  return ver === d.charCodeAt(10) - 48;
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export interface Supplier {
  readonly id: string;
  readonly cuit: string;
  readonly nombre: string;
  readonly email: string | null;
  readonly telefono: string | null;
  readonly activo: boolean;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
}

export const supplierInputSchema = z.object({
  cuit: z.string().min(11).max(14),
  nombre: z.string().min(2).max(80),
  email: z.string().email().max(320).optional(),
  telefono: z.string().min(6).max(24).optional(),
});

export interface CrearSupplierInput {
  readonly cuit: string;
  readonly nombre: string;
  readonly email?: string | undefined;
  readonly telefono?: string | undefined;
  readonly ahoraIso: string;
  readonly creados: ReadonlyMap<string, Supplier>;
}

export type CrearSupplierResult =
  | { status: 201; supplier: Supplier }
  | { status: 409; error: string; original: Supplier }
  | { status: 422; error: string };

export function crearSupplier(input: CrearSupplierInput): CrearSupplierResult {
  const cuit = normalizarCuit(input.cuit);
  const ya = input.creados.get(cuit);
  if (ya) return { status: 409, error: "proveedor ya existe", original: ya };
  const nombre = input.nombre.trim();
  if (!validarCuit(cuit)) return { status: 422, error: "cuit inválido (dígito verificador)" };
  if (nombre.length < 2 || nombre.length > 80) {
    return { status: 422, error: "nombre 2-80 caracteres" };
  }
  if (input.email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    return { status: 422, error: "email inválido" };
  }
  return {
    status: 201,
    supplier: Object.freeze({
      id: `sup-${cuit}`,
      cuit,
      nombre,
      email: input.email ?? null,
      telefono: input.telefono ?? null,
      activo: true,
      creadoEn: input.ahoraIso,
      actualizadoEn: input.ahoraIso,
    }),
  };
}

export interface ParcheSupplier {
  readonly nombre?: string | undefined;
  readonly email?: string | null | undefined;
  readonly telefono?: string | null | undefined;
  readonly activo?: boolean | undefined;
}

export type EditarSupplierResult =
  | { ok: true; supplier: Supplier }
  | { ok: false; error: string };

export function editarSupplier(
  actual: Supplier,
  parche: ParcheSupplier,
  ahoraIso: string,
): EditarSupplierResult {
  let nombre = actual.nombre;
  if (parche.nombre !== undefined) {
    const n = parche.nombre.trim();
    if (n.length < 2 || n.length > 80) return { ok: false, error: "nombre 2-80 caracteres" };
    nombre = n;
  }
  let email = actual.email;
  if (parche.email !== undefined) {
    if (parche.email !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parche.email)) {
      return { ok: false, error: "email inválido" };
    }
    email = parche.email;
  }
  return {
    ok: true,
    supplier: Object.freeze({
      ...actual,
      nombre,
      email,
      telefono: parche.telefono !== undefined ? parche.telefono : actual.telefono,
      activo: parche.activo !== undefined ? parche.activo : actual.activo,
      actualizadoEn: ahoraIso,
    }),
  };
}

// ---------------------------------------------------------------------------
// Purchase orders: crear/editar (abierta) / cerrar. Cerrada jamás se edita.
// ---------------------------------------------------------------------------

export interface PurchaseOrderLine {
  readonly sku: string;
  readonly qty: number;
  readonly costoCentavos: bigint;
}

export type EstadoOC = "abierta" | "cerrada";

export interface PurchaseOrder {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly supplierCuit: string;
  readonly estado: EstadoOC;
  readonly lineas: ReadonlyArray<PurchaseOrderLine>;
  readonly totalCentavos: bigint;
  readonly creadoPor: string;
  readonly creadoEn: string;
  readonly cerradoEn: string | null;
  /** B6.2 Bot WA: marca semanal (lista del viernes). Default false (web). */
  readonly esSemanal?: boolean | undefined;
  /** B8.6 Bot WA: origen web|bot. Default web. */
  readonly origen?: string | undefined;
  /** B8.6 Bot WA: canal email|wa_manual. Solo cuando se envía. */
  readonly canal?: string | undefined;
}

// B6.2: marca un borrador como semanal sin mutar (el mismo que ve la web).
export function marcarSemanal(actual: PurchaseOrder): PurchaseOrder {
  if (actual.estado !== "abierta") return actual;
  return Object.freeze({ ...actual, esSemanal: true, origen: actual.origen ?? "web" });
}

// B8.6: registra origen bot + canal al confirmar/enviar. Puro.
export function registrarEnvioBot(actual: PurchaseOrder, canal: "email" | "wa_manual"): PurchaseOrder {
  return Object.freeze({ ...actual, origen: "bot", canal });
}

export const purchaseOrderLineSchema = z.object({
  sku: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(9999),
  costo_centavos: z.number().int().min(0).max(999_999_999),
});

export function totalOrden(lineas: ReadonlyArray<PurchaseOrderLine>): bigint {
  let total = 0n;
  for (const l of lineas) total += BigInt(l.qty) * l.costoCentavos;
  return total;
}

function lineasValidas(lineas: ReadonlyArray<PurchaseOrderLine>): boolean {
  if (lineas.length === 0 || lineas.length > 100) return false;
  for (const l of lineas) {
    if (!l.sku || l.sku.length > 64) return false;
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 9999) return false;
    if (l.costoCentavos < 0n || l.costoCentavos > 999_999_999n) return false;
  }
  return true;
}

export interface CrearOrdenInput {
  readonly idempotencyKey: string;
  readonly supplierCuit: string;
  readonly lineas: ReadonlyArray<PurchaseOrderLine>;
  readonly creadoPor: string;
  readonly ahoraIso: string;
  readonly vistos: ReadonlyMap<string, PurchaseOrder>;
}

export type CrearOrdenResult =
  | { status: 201; orden: PurchaseOrder }
  | { status: 409; error: string; original?: PurchaseOrder }
  | { status: 422; error: string };

function cuerpoOrdenIgual(a: PurchaseOrder, b: CrearOrdenInput): boolean {
  if (a.supplierCuit !== normalizarCuit(b.supplierCuit)) return false;
  if (a.creadoPor !== b.creadoPor) return false;
  if (a.lineas.length !== b.lineas.length) return false;
  return a.lineas.every((l, i) => {
    const o = b.lineas[i];
    return (
      o !== undefined && l.sku === o.sku && l.qty === o.qty && l.costoCentavos === o.costoCentavos
    );
  });
}

export function crearOrden(input: CrearOrdenInput): CrearOrdenResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) {
    if (cuerpoOrdenIgual(visto, input)) {
      return { status: 409, error: "idempotency-key repetida", original: visto };
    }
    return { status: 409, error: "idempotency-key repetida con distinto cuerpo" };
  }
  if (!input.idempotencyKey || !input.creadoPor) {
    return { status: 422, error: "orden inválida" };
  }
  const cuit = normalizarCuit(input.supplierCuit);
  if (!validarCuit(cuit)) return { status: 422, error: "cuit proveedor inválido" };
  if (!lineasValidas(input.lineas)) return { status: 422, error: "líneas inválidas (1-100, qty 1-9999)" };
  const total = totalOrden(input.lineas);
  if (total <= 0n) return { status: 422, error: "orden sin monto" };
  return {
    status: 201,
    orden: Object.freeze({
      id: `oc-${input.idempotencyKey}`,
      idempotencyKey: input.idempotencyKey,
      supplierCuit: cuit,
      estado: "abierta" as const,
      lineas: Object.freeze([...input.lineas]),
      totalCentavos: total,
      creadoPor: input.creadoPor,
      creadoEn: input.ahoraIso,
      cerradoEn: null,
    }),
  };
}

export type EditarOrdenResult =
  | { ok: true; orden: PurchaseOrder }
  | { ok: false; error: string };

export function editarOrden(
  actual: PurchaseOrder,
  lineas: ReadonlyArray<PurchaseOrderLine>,
  ahoraIso: string,
): EditarOrdenResult {
  void ahoraIso;
  if (actual.estado !== "abierta") {
    return { ok: false, error: "orden cerrada no editable" };
  }
  if (!lineasValidas(lineas)) return { ok: false, error: "líneas inválidas (1-100, qty 1-9999)" };
  const total = totalOrden(lineas);
  if (total <= 0n) return { ok: false, error: "orden sin monto" };
  return {
    ok: true,
    orden: Object.freeze({ ...actual, lineas: Object.freeze([...lineas]), totalCentavos: total }),
  };
}

export type CerrarOrdenResult =
  | { ok: true; orden: PurchaseOrder }
  | { ok: false; error: string };

export function cerrarOrden(
  actual: PurchaseOrder,
  quien: string,
  ahoraIso: string,
): CerrarOrdenResult {
  void quien;
  if (actual.estado !== "abierta") return { ok: false, error: "orden ya cerrada" };
  return {
    ok: true,
    orden: Object.freeze({ ...actual, estado: "cerrada" as const, cerradoEn: ahoraIso }),
  };
}
