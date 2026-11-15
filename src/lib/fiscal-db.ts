import { eq, like, sql } from "drizzle-orm";
import { BaseNoDisponible, intentarLeer, intentarPersistir } from "./server-db.js";
import { getTenantDb } from "./db.js";
import { esModoMulti, esModoShared, tenantActual } from "./tenant-mode.js";
import { dondeTenant } from "./tenant-scope.js";
import { fiscalDocuments, fiscalWizard } from "../db/schema-fiscal.js";
import type { StoredFiscalDoc } from "./store.js";
import type { DelegacionEstado, WizardEstado } from "../modules/fiscal/wizard.js";

export type TenantDb = ReturnType<typeof getTenantDb>;

export function dbViva(tenantId?: string): TenantDb | null {
  try {
    return getTenantDb(tenantId);
  } catch {
    return null;
  }
}

type FilaFiscal = typeof fiscalDocuments.$inferSelect;

function filaAFiscalDoc(f: FilaFiscal): StoredFiscalDoc {
  return {
    id: f.id,
    idempotency_key: f.idempotencyKey,
    sale_id: f.saleId ?? "",
    tenant_id: f.tenantId ?? null,
    cbte_tipo: f.cbteTipo,
    pto_vta: f.ptoVta,
    cbte_nro: f.cbteNro,
    cbte_fch: f.cbteFch,
    doc_tipo: f.docTipo,
    doc_nro: f.docNro.toString(),
    cond_iva_receptor: f.condIvaReceptor,
    estado: f.estado as StoredFiscalDoc["estado"],
    cae: f.cae,
    cae_vto: f.caeVto,
    qr_payload: f.qrPayload,
    imp_iva_centavos: f.impIvaCentavos !== null ? f.impIvaCentavos.toString() : null,
    alic_iva_id: f.alicIvaId,
    client_ocurred_at: f.clientOcurredAt ? f.clientOcurredAt.toISOString() : null,
    venta_leyenda: f.ventaLeyenda,
    imp_total_centavos: f.impTotalCentavos.toString(),
    intentos: f.intentos,
    proximo_intento: f.proximoIntento ? f.proximoIntento.toISOString() : null,
    ultimo_error_codigo: f.ultimoErrorCodigo,
    motivo_castellano: f.motivoCastellano,
    no_facturar: (f.noFacturar as StoredFiscalDoc["no_facturar"]) ?? null,
  };
}

function esUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Unión memoria (caliente) + DB (fría). Dedup por idempotency_key, gana memoria. */
export function unionFiscalDocs(
  memoria: Iterable<StoredFiscalDoc>,
  db: ReadonlyArray<StoredFiscalDoc>,
): StoredFiscalDoc[] {
  const out = new Map<string, StoredFiscalDoc>();
  for (const d of memoria) out.set(d.idempotency_key, d);
  for (const d of db) {
    if (!out.has(d.idempotency_key)) out.set(d.idempotency_key, d);
  }
  return [...out.values()];
}

// Por qué null visible en single: filas previas sin dueño siguen como hoy;
// en multi una fila sin tenant_id no se muestra a nadie (ISO-S4).
export function soloDelTenant(docs: Iterable<StoredFiscalDoc>, tenantId: string): StoredFiscalDoc[] {
  const out: StoredFiscalDoc[] = [];
  for (const d of docs) {
    if (d.tenant_id === tenantId) out.push(d);
    else if (!esModoMulti() && (d.tenant_id === undefined || d.tenant_id === null)) out.push(d);
  }
  return out;
}

export async function leerFiscalDocPorKey(db: TenantDb, key: string): Promise<StoredFiscalDoc | null> {
  const filas = await db
    .select()
    .from(fiscalDocuments)
    .where(dondeTenant(fiscalDocuments.tenantId, eq(fiscalDocuments.idempotencyKey, key)))
    .limit(1);
  const fila = filas[0];
  return fila ? filaAFiscalDoc(fila) : null;
}

/**
 * Lee el doc de una operación ND por su header-key (`nd:<key>:%`). Cubre todas
 * las ramas (espera/12/7/2): el replay con la misma clave choca aunque la
 * factura haya cambiado de estado entre el POST y el replay. Sin ESCAPE: una
 * clave con %/_ solo puede sobre-coincidir (falla cerrado a 409, nunca duplica).
 */
export async function leerNdPorHeaderKey(db: TenantDb, key: string): Promise<StoredFiscalDoc | null> {
  const filas = await db
    .select()
    .from(fiscalDocuments)
    .where(dondeTenant(fiscalDocuments.tenantId, like(fiscalDocuments.idempotencyKey, `nd:${key}:%`)))
    .limit(1);
  const fila = filas[0];
  return fila ? filaAFiscalDoc(fila) : null;
}

/** Lee un doc fiscal por id (uuid). Sin uuid válido resuelve null sin tocar DB. */
export async function leerFiscalDocPorId(db: TenantDb, id: string): Promise<StoredFiscalDoc | null> {
  if (!esUuid(id)) return null;
  const filas = await db
    .select()
    .from(fiscalDocuments)
    .where(dondeTenant(fiscalDocuments.tenantId, eq(fiscalDocuments.id, id)))
    .limit(1);
  const fila = filas[0];
  return fila ? filaAFiscalDoc(fila) : null;
}

export interface ReintentoCorrecciones {
  readonly docNro?: string;
  readonly condIva?: string;
}

export type ReencolarFallo =
  | { readonly ok: false; readonly codigo: "inexistente"; readonly doc: null }
  | { readonly ok: false; readonly codigo: "no-facturar" | "no-reintentable"; readonly doc: StoredFiscalDoc };

/**
 * PERS-S4 G2a: reencola un doc rechazado/pendiente en 1 UPDATE atómico
 * (estado + intentos+1 + limpieza T3 + correcciones). El WHERE re-chequea el
 * estado: el perdedor de una carrera relee y recibe el motivo exacto
 * (inexistente / no-facturar / no-reintentable). Lanza ante caída de DB para
 * que el caller caiga a la vía memoria histórica.
 */
export async function reencolarFiscalDoc(
  db: TenantDb,
  id: string,
  corr: ReintentoCorrecciones,
): Promise<{ readonly ok: true; readonly doc: StoredFiscalDoc } | ReencolarFallo> {
  const actual = await leerFiscalDocPorId(db, id);
  if (!actual) return { ok: false, codigo: "inexistente", doc: null };
  if (actual.no_facturar) return { ok: false, codigo: "no-facturar", doc: actual };
  if (actual.estado !== "rechazado" && actual.estado !== "pendiente") {
    return { ok: false, codigo: "no-reintentable", doc: actual };
  }
  const sets = [
    sql`estado = 'pendiente'`,
    sql`intentos = intentos + 1`,
    sql`proximo_intento = null`,
    sql`ultimo_error_codigo = null`,
    sql`motivo_castellano = null`,
  ];
  if (corr.docNro !== undefined) sets.push(sql`doc_nro = ${BigInt(corr.docNro)}`);
  if (corr.condIva !== undefined) sets.push(sql`cond_iva_receptor = ${corr.condIva}`);
  const q = sql`update fiscal_documents set ${sql.join(sets, sql`, `)} where id = ${id} and estado in ('rechazado', 'pendiente') and no_facturar is null returning intentos, idempotency_key`;
  const filas = (await db.execute(q)) as unknown as Array<{ intentos: unknown; idempotency_key: unknown }>;
  const ganada = filas[0];
  if (!ganada) {
    const vigente = await leerFiscalDocPorId(db, id);
    if (!vigente) return { ok: false, codigo: "inexistente", doc: null };
    if (vigente.no_facturar) return { ok: false, codigo: "no-facturar", doc: vigente };
    return { ok: false, codigo: "no-reintentable", doc: vigente };
  }
  return {
    ok: true,
    doc: {
      ...actual,
      estado: "pendiente",
      intentos: Number(ganada.intentos),
      proximo_intento: null,
      ultimo_error_codigo: null,
      motivo_castellano: null,
      ...(corr.docNro !== undefined ? { doc_nro: corr.docNro } : {}),
      ...(corr.condIva !== undefined ? { cond_iva_receptor: corr.condIva } : {}),
    },
  };
}

// PERS-S4 fiscal (ADR-0018/0019): copia durable best-effort de fiscalDocs.
// Memoria sigue mandando; sin DB resuelve false/null. Append-only: el INSERT
// usa onConflictDoNothing (gana el primero); los reintentos (retry) mutan
// solo memoria hasta el cutover con lock de numeración.
export function persistirFiscalDoc(d: StoredFiscalDoc, tenantId?: string): Promise<boolean> {
  const dueno = tenantId ?? d.tenant_id ?? tenantActual() ?? null;
  if (esModoShared() && !dueno) throw new Error("Falta tenant");
  return intentarPersistir((db) =>
    db
      .insert(fiscalDocuments)
      .values({
        id: d.id,
        idempotencyKey: d.idempotency_key,
        saleId: d.sale_id,
        tenantId: dueno as string,
        cbteTipo: d.cbte_tipo,
        ptoVta: d.pto_vta,
        cbteNro: d.cbte_nro,
        cbteFch: d.cbte_fch,
        docTipo: d.doc_tipo,
        docNro: BigInt(d.doc_nro),
        condIvaReceptor: d.cond_iva_receptor,
        impTotalCentavos: d.imp_total_centavos !== undefined && d.imp_total_centavos !== null ? BigInt(d.imp_total_centavos) : 0n,
        impIvaCentavos: d.imp_iva_centavos ? BigInt(d.imp_iva_centavos) : null,
        alicIvaId: d.alic_iva_id ?? null,
        clientOcurredAt: d.client_ocurred_at ? new Date(d.client_ocurred_at) : null,
        ventaLeyenda: d.venta_leyenda ?? null,
        estado: d.estado,
        cae: d.cae,
        caeVto: d.cae_vto,
        qrPayload: d.qr_payload,
      })
      .onConflictDoNothing({ target: [fiscalDocuments.tenantId, fiscalDocuments.idempotencyKey] }),
    dueno ?? undefined,
  );
}

/** Lee los docs fiscales del tenant desde DB, o null sin DB (el caller usa memoria). */
export async function leerFiscalDocs(tenantId?: string): Promise<StoredFiscalDoc[] | null> {
  if (esModoShared() && !tenantId && !tenantActual()) throw new Error("Falta tenant");
  try {
    return await intentarLeer(async (db) => {
      if (esModoShared()) {
        const filas = await db.select().from(fiscalDocuments).where(dondeTenant(fiscalDocuments.tenantId));
        return filas.map(filaAFiscalDoc);
      }
      if (tenantId === undefined) {
        const filas = await db.select().from(fiscalDocuments);
        return filas.map(filaAFiscalDoc);
      }
      const filas = await db.select().from(fiscalDocuments).where(eq(fiscalDocuments.tenantId, tenantId));
      return filas.map(filaAFiscalDoc);
    }, tenantId);
  } catch (e) {
    // Fiscal sigue en cutover pendiente (PERS-S4): sin base del tenant, memoria.
    if (e instanceof BaseNoDisponible) return null;
    throw e;
  }
}

type FilaWizard = typeof fiscalWizard.$inferSelect;

function filaAWizard(f: FilaWizard): WizardEstado {
  return {
    paso: f.paso,
    delegacion: f.delegacion as DelegacionEstado,
    pausaEn: f.pausaEn,
  };
}

/** Lee el wizard de un tenant desde DB, o null sin DB/error (el caller usa memoria). */
export async function leerWizardPorTenant(db: TenantDb | null, tenantId: string): Promise<WizardEstado | null> {
  if (!db) return null;
  try {
    const filas = await db.select().from(fiscalWizard).where(eq(fiscalWizard.tenantId, tenantId)).limit(1);
    const fila = filas[0];
    return fila ? filaAWizard(fila) : null;
  } catch {
    return null;
  }
}

/**
 * PERS-S4 G2b: upsert DB-first last-writer-wins por tenant_id con relectura.
 * Nunca lanza: sin DB o ante error resuelve null y el caller usa memoria.
 */
export async function guardarWizard(
  db: TenantDb | null,
  tenantId: string,
  estado: WizardEstado,
): Promise<WizardEstado | null> {
  if (!db) return null;
  try {
    await db
      .insert(fiscalWizard)
      .values({
        tenantId,
        paso: estado.paso,
        delegacion: estado.delegacion,
        pausaEn: estado.pausaEn,
        actualizadoEn: new Date(),
      })
      .onConflictDoUpdate({
        target: fiscalWizard.tenantId,
        set: {
          paso: estado.paso,
          delegacion: estado.delegacion,
          pausaEn: estado.pausaEn,
          actualizadoEn: new Date(),
        },
      });
    return (await leerWizardPorTenant(db, tenantId)) ?? { ...estado };
  } catch {
    return null;
  }
}

/**
 * PERS-S4 G1: write DB-first idempotente por idempotency_key.
 * Pre-check + onConflictDoNothing con relectura: la carrera devuelve el
 * existente (fuente 'existe'). Nunca lanza: sin DB o ante error resuelve
 * 'memoria' y el caller usa el espejo.
 */
export async function asegurarFiscalDoc(
  d: StoredFiscalDoc,
  tenantId?: string,
): Promise<{ doc: StoredFiscalDoc; fuente: "db" | "existe" | "memoria" }> {
  // Por qué el contexto como dueño: dentro de una ruta de datos el tenant lo
  // fijó el middleware (ADR-0051); sin dueño en multi no se escribe nada.
  const dueno = tenantId ?? d.tenant_id ?? tenantActual() ?? null;
  if (esModoMulti() && !dueno) {
    throw new Error("Falta tenant: doc fiscal sin dueño en modo multi");
  }
  const conDueno = { ...d, tenant_id: dueno };
  const db = dbViva(dueno ?? undefined);
  if (!db) return { doc: conDueno, fuente: "memoria" };
  try {
    const previo = await leerFiscalDocPorKey(db, d.idempotency_key);
    if (previo) return { doc: previo, fuente: "existe" };
    const filas = await db
      .insert(fiscalDocuments)
      .values({
        id: d.id,
        idempotencyKey: d.idempotency_key,
        saleId: d.sale_id,
        tenantId: dueno as string,
        cbteTipo: d.cbte_tipo,
        ptoVta: d.pto_vta,
        cbteNro: d.cbte_nro,
        cbteFch: d.cbte_fch,
        docTipo: d.doc_tipo,
        docNro: BigInt(d.doc_nro),
        condIvaReceptor: d.cond_iva_receptor,
        impTotalCentavos: d.imp_total_centavos !== undefined && d.imp_total_centavos !== null ? BigInt(d.imp_total_centavos) : 0n,
        impIvaCentavos: d.imp_iva_centavos ? BigInt(d.imp_iva_centavos) : null,
        alicIvaId: d.alic_iva_id ?? null,
        clientOcurredAt: d.client_ocurred_at ? new Date(d.client_ocurred_at) : null,
        ventaLeyenda: d.venta_leyenda ?? null,
        estado: d.estado,
        intentos: d.intentos ?? 0,
        cae: d.cae,
        caeVto: d.cae_vto,
        qrPayload: d.qr_payload,
      })
      .onConflictDoNothing({ target: [fiscalDocuments.tenantId, fiscalDocuments.idempotencyKey] })
      .returning({ id: fiscalDocuments.id });
    if (!filas[0]) {
      const carrera = await leerFiscalDocPorKey(db, d.idempotency_key);
      return { doc: carrera ?? conDueno, fuente: "existe" };
    }
    return { doc: conDueno, fuente: "db" };
  } catch {
    return { doc: conDueno, fuente: "memoria" };
  }
}
