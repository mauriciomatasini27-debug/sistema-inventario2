import { eq } from "drizzle-orm";
import { fiscalSettings } from "../../db/schema-fiscal.js";
import { listarMovimientosCaja } from "./movimientos-caja.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import {
  crearAlmacenFiscalDocs,
  crearAlmacenFiscalWizard,
  crearListaMovimientos,
  type StoredFiscalDoc,
} from "./_almacen.js";
import {
  asegurarFiscalDoc,
  leerFiscalDocPorId,
  leerFiscalDocPorKey,
  leerFiscalDocs,
  leerNdPorHeaderKey,
  leerWizardPorTenant,
  guardarWizard,
  reencolarFiscalDoc,
  soloDelTenant,
  unionFiscalDocs,
  type ReintentoCorrecciones,
} from "../fiscal-db.js";
import { puertoMemoria, puertoPostgres, type PuertoFiscalDurable } from "../fiscal-emitir.js";
import { tenantActual } from "../tenant-mode.js";
import { validar_cuit } from "../../modules/fiscal/fiscal.js";
import { wizard_inicial, type WizardEstado } from "../../modules/fiscal/wizard.js";

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

function memoriaDelTenant(tenantId: string): StoredFiscalDoc[] {
  const fiscalDocs = crearAlmacenFiscalDocs();
  return soloDelTenant([...fiscalDocs.comoMapaSoloLectura().values()], tenantId);
}

function dbActual(): TenantDb | null {
  try {
    return dbVivaTenant();
  } catch (e) {
    if (e instanceof BaseNoDisponible) return null;
    throw e;
  }
}

/** Lectura: union memoria caliente + DB fria filtrada por tenant. Ante BaseNoDisponible cae a memoria (excepcion ADR-0052 en el repo). */
export async function listarFiscalDocs(tenantId: string): Promise<StoredFiscalDoc[]> {
  const memoria = memoriaDelTenant(tenantId);
  const db = dbActual();
  if (!db) return memoria;
  try {
    const dbDocs = await leerFiscalDocs(tenantId);
    if (!dbDocs) return memoria;
    return unionFiscalDocs(memoria, dbDocs);
  } catch {
    return memoria;
  }
}

/** Lookup por id en union (memoria primero, luego DB). Sin espejo: igual que la via historica. */
export async function buscarFiscalDocPorId(docId: string): Promise<StoredFiscalDoc | null> {
  const fiscalDocs = crearAlmacenFiscalDocs();
  for (const d of fiscalDocs.comoMapaSoloLectura().values()) {
    if (d.id === docId) return d;
  }
  const db = dbActual();
  if (!db) return null;
  try {
    return await leerFiscalDocPorId(db, docId);
  } catch {
    return null;
  }
}

/** Pre-check ND por prefijo `nd:<key>:%`. Espeja a memoria el hit de DB como hacia la ruta. */
export async function buscarNdPrevio(headerKey: string): Promise<StoredFiscalDoc | null> {
  const prefijo = `nd:${headerKey}:`;
  const fiscalDocs = crearAlmacenFiscalDocs();
  const memPrevio = [...fiscalDocs.comoMapaSoloLectura().values()].find((d) => d.idempotency_key.startsWith(prefijo)) ?? null;
  if (memPrevio) return memPrevio;
  const db = dbActual();
  if (!db) return null;
  try {
    const previoDb = await leerNdPorHeaderKey(db, headerKey);
    if (previoDb) fiscalDocs.guardar(previoDb.idempotency_key, previoDb);
    return previoDb;
  } catch {
    return null;
  }
}

/** Factura 11/6/1 por sale_id en union (memoria + DB). */
export async function buscarFacturaParaNd(saleId: string, tenantId?: string): Promise<StoredFiscalDoc | null> {
  const esFactura = (d: StoredFiscalDoc) =>
    d.sale_id === saleId && (d.cbte_tipo === "11" || d.cbte_tipo === "6" || d.cbte_tipo === "1");
  const fiscalDocs = crearAlmacenFiscalDocs();
  const memDocs = [...fiscalDocs.comoMapaSoloLectura().values()];
  const enMemoria = memDocs.find(esFactura) ?? null;
  if (enMemoria) return enMemoria;
  const db = dbActual();
  if (!db) return null;
  try {
    const dbDocs = await leerFiscalDocs(tenantId);
    if (!dbDocs) return null;
    return unionFiscalDocs(memDocs, dbDocs).find(esFactura) ?? null;
  } catch {
    return enMemoria;
  }
}

/** Lookup por idempotency_key en union (memoria primero, luego DB con espejo). Lectura con fallback a memoria. */
export async function buscarDocPorKey(key: string): Promise<StoredFiscalDoc | null> {
  const fiscalDocs = crearAlmacenFiscalDocs();
  const mem = fiscalDocs.obtener(key);
  if (mem) return mem;
  const db = dbActual();
  if (!db) return null;
  try {
    const doc = await leerFiscalDocPorKey(db, key);
    if (doc) fiscalDocs.guardar(doc.idempotency_key, doc);
    return doc;
  } catch {
    return null;
  }
}

/** NC acumuladas (13/8/3) por sale_id en union (memoria del tenant + DB). Para el tope de decidir_nc. */
export async function acumuladoNcParaVenta(saleId: string, tenantId?: string): Promise<bigint> {
  const fiscalDocs = crearAlmacenFiscalDocs();
  const memBase = tenantId ? memoriaDelTenant(tenantId) : [...fiscalDocs.comoMapaSoloLectura().values()];
  let docs = memBase;
  const db = dbActual();
  if (db) {
    try {
      const dbDocs = await leerFiscalDocs(tenantId);
      if (dbDocs) docs = unionFiscalDocs(memBase, dbDocs);
    } catch {
      docs = memBase;
    }
  }
  let acumulado = 0n;
  for (const d of docs) {
    if (d.sale_id === saleId && (d.cbte_tipo === "13" || d.cbte_tipo === "8" || d.cbte_tipo === "3")) {
      acumulado += BigInt(d.imp_total_centavos ?? "0");
    }
  }
  return acumulado;
}

/** Cobro asociado a la venta: memoria + cash_movements. Lectura con fallback a memoria. */
export async function hayCobroParaVenta(saleId: string): Promise<boolean> {
  const movimientos = crearListaMovimientos();
  const enMemoria = movimientos.listar().some((m) => m.sale_id === saleId);
  if (enMemoria) return true;
  const db = dbActual();
  if (!db) return enMemoria;
  try {
    const cobros = await listarMovimientosCaja(db, { tipo: "venta", saleId });
    return cobros.length > 0;
  } catch {
    return enMemoria;
  }
}

export type AsegurarDocResultado = { doc: StoredFiscalDoc; fuente: "db" | "existe" | "memoria" };

/** Alta idempotente por idempotency_key con espejo memoria (igual que la ruta historica). */
export async function asegurarDoc(doc: StoredFiscalDoc, tenantId?: string): Promise<AsegurarDocResultado> {
  const r = await asegurarFiscalDoc(doc, tenantId);
  crearAlmacenFiscalDocs().guardar(r.doc.idempotency_key, r.doc);
  return r;
}

export type ReencolarDocResultado =
  | { ok: true; doc: StoredFiscalDoc }
  | { ok: false; codigo: "inexistente" | "no-facturar" | "no-reintentable"; doc: StoredFiscalDoc | null };

function buscarEnMemoriaPorId(docId: string): StoredFiscalDoc | null {
  for (const d of crearAlmacenFiscalDocs().comoMapaSoloLectura().values()) {
    if (d.id === docId) return d;
  }
  return null;
}

function reencolarEnMemoria(doc: StoredFiscalDoc, corr: ReintentoCorrecciones): ReencolarDocResultado {
  const fiscalDocs = crearAlmacenFiscalDocs();
  const actualizado: StoredFiscalDoc = {
    ...doc,
    estado: "pendiente",
    intentos: (doc.intentos ?? 0) + 1,
    proximo_intento: null,
    ultimo_error_codigo: null,
    motivo_castellano: null,
    ...(corr.docNro !== undefined ? { doc_nro: corr.docNro } : {}),
    ...(corr.condIva !== undefined ? { cond_iva_receptor: corr.condIva } : {}),
  };
  fiscalDocs.guardar(doc.idempotency_key, actualizado);
  void asegurarFiscalDoc(actualizado).then(
    (r) => fiscalDocs.guardar(r.doc.idempotency_key, r.doc),
    () => {},
  );
  return { ok: true, doc: actualizado };
}

/** Reencolado DB-first con backfill desde memoria y via memoria ante caida (igual que la ruta historica). */
export async function reencolarDoc(docId: string, corr: ReintentoCorrecciones): Promise<ReencolarDocResultado> {
  const fiscalDocs = crearAlmacenFiscalDocs();
  const memDoc = buscarEnMemoriaPorId(docId);
  const db = dbActual();
  if (!db) {
    const doc = memDoc ?? null;
    if (!doc) return { ok: false, codigo: "inexistente", doc: null };
    if (doc.no_facturar) return { ok: false, codigo: "no-facturar", doc };
    if (doc.estado !== "rechazado" && doc.estado !== "pendiente") {
      return { ok: false, codigo: "no-reintentable", doc };
    }
    return reencolarEnMemoria(doc, corr);
  }
  try {
    let doc = memDoc;
    if (!doc) {
      try {
        doc = await leerFiscalDocPorId(db, docId);
      } catch {
        doc = null;
      }
    }
    if (!doc) return { ok: false, codigo: "inexistente", doc: null };
    if (doc.no_facturar) return { ok: false, codigo: "no-facturar", doc };
    if (doc.estado !== "rechazado" && doc.estado !== "pendiente") {
      return { ok: false, codigo: "no-reintentable", doc };
    }
    let r = await reencolarFiscalDoc(db, docId, corr);
    if (!r.ok && r.codigo === "inexistente" && memDoc) {
      await asegurarFiscalDoc(memDoc);
      r = await reencolarFiscalDoc(db, docId, corr);
    }
    if (!r.ok) {
      if (r.doc) fiscalDocs.guardar(r.doc.idempotency_key, r.doc);
      return r;
    }
    fiscalDocs.guardar(r.doc.idempotency_key, r.doc);
    return r;
  } catch {
    const doc = memDoc ?? (await buscarFiscalDocPorId(docId));
    if (!doc) return { ok: false, codigo: "inexistente", doc: null };
    if (doc.no_facturar) return { ok: false, codigo: "no-facturar", doc };
    if (doc.estado !== "rechazado" && doc.estado !== "pendiente") {
      return { ok: false, codigo: "no-reintentable", doc };
    }
    return reencolarEnMemoria(doc, corr);
  }
}

/** Wizard actual: memoria, luego DB, luego inicial. Lectura con fallback a memoria. */
export async function leerWizard(tenantId: string): Promise<WizardEstado> {
  const mem = crearAlmacenFiscalWizard().obtener(tenantId);
  if (mem) return { ...mem };
  const db = dbActual();
  if (!db) return { ...wizard_inicial() };
  try {
    return (await leerWizardPorTenant(db, tenantId)) ?? { ...wizard_inicial() };
  } catch {
    return { ...wizard_inicial() };
  }
}

/** Persiste el wizard (DB-first) con espejo memoria. Sin DB queda en memoria como hoy. */
export async function guardarWizardEstado(tenantId: string, estado: WizardEstado): Promise<WizardEstado> {
  const db = dbActual();
  const guardado = await guardarWizard(db, tenantId, estado);
  const final = guardado ?? estado;
  crearAlmacenFiscalWizard().guardar(tenantId, { ...final });
  return { ...final };
}

/** Puerto de emision: Postgres del tenant o memoria sin base (igual que la ruta historica). */
export function obtenerPuertoFiscal(): PuertoFiscalDurable {
  const db = dbActual();
  return db ? puertoPostgres(db) : puertoMemoria();
}

/** CUIT para emitir: body, luego fiscal_settings del tenant actual, luego env. Sin tenant en multi no lee filas ajenas. */
export async function resolverCuitFiscal(bodyCuit: string | undefined): Promise<number | null> {
  const db = dbActual();
  let crudo = bodyCuit ?? "";
  if (!crudo && db) {
    try {
      const dueno = tenantActual();
      if (dueno) {
        const filas = await db
          .select({ cuit: fiscalSettings.cuit })
          .from(fiscalSettings)
          .where(eq(fiscalSettings.tenantId, dueno))
          .limit(1);
        crudo = filas[0]?.cuit ?? "";
      } else {
        // Sin dueño y con base viva solo ocurre en single: en multi la
        // falta de tenant ya devolvió null en dbActual.
        const filas = await db.select({ cuit: fiscalSettings.cuit }).from(fiscalSettings).limit(1);
        crudo = filas[0]?.cuit ?? "";
      }
    } catch {
      crudo = "";
    }
  }
  if (!crudo) crudo = process.env["ARCA_CUIT_PROVEEDOR"] ?? "";
  const digitos = crudo.replace(/\D/g, "");
  if (!digitos || !validar_cuit(digitos)) return null;
  return Number(digitos);
}
