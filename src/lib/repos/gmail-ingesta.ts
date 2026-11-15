import { and, eq } from "drizzle-orm";
import {
  emailIngestionFilters,
  emailIngestionLog,
  serviceAccounts,
} from "../../db/schema-servicios.js";
import { emailIngestionDrafts } from "../../db/schema-google.js";
import { getTenantDb } from "../db.js";
import { dondeTenant, filaConTenant } from "../tenant-scope.js";
import type {
  CuentaCatalogo,
  DecisionIngesta,
  FiltroIngesta,
} from "../../modules/utilities/ingesta_gmail.js";
import type { ConfianzaCampo, OrigenExtraccion } from "../../modules/utilities/facturas_servicios.js";
import { confianzaParaGuardar } from "../../modules/utilities/cuerpo-factura.js";

export interface BorradorIngestaInput {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly messageId: string;
  readonly gmailAttachmentId: string | null;
  readonly accountId: string | null;
  readonly periodo: string | null;
  readonly vencimiento: string | null;
  readonly montoCentavos: bigint | null;
  readonly origen: OrigenExtraccion;
  readonly confianzaMonto: ConfianzaCampo;
  readonly confianzaVencimiento: ConfianzaCampo;
  readonly venceEn: Date;
  readonly recordatorioEn: Date;
  // GGL-S10b: el comprobante del cuerpo viaja con el borrador. Sin esto
  // la imagen se arma y se pierde al guardar.
  readonly pideRevision?: boolean;
  readonly comprobanteCuerpo?: { readonly mime: "image/png"; readonly bytes: Buffer } | null;
}

export interface LogIngestaInput {
  readonly tenantId: string;
  readonly messageId: string;
  readonly historyId: string | null;
  readonly remitenteDominio: string | null;
  readonly decision: DecisionIngesta;
  readonly motivo: string;
  readonly filtroId: string | null;
  readonly accountId: string | null;
}

export interface RemitenteIngestaPanel {
  readonly id: string;
  readonly remitente: string;
  readonly servicio: string | null;
  readonly proveedor: string | null;
  readonly activo: boolean;
}

// GGL-REMITENTES: pausar aplica al siguiente mensaje (activo=false en capa 1).
export async function listarRemitentesIngesta(tenantId: string): Promise<ReadonlyArray<RemitenteIngestaPanel>> {
  const db = getTenantDb(tenantId);
  const filas = await db.select().from(emailIngestionFilters).where(eq(emailIngestionFilters.tenantId, tenantId));
  return filas.map((f) => ({
    id: f.id,
    remitente: f.remitente,
    servicio: f.servicio,
    proveedor: f.proveedor,
    activo: f.activo,
  }));
}

export async function actualizarActivoRemitenteIngesta(input: {
  readonly tenantId: string;
  readonly filtroId: string;
  readonly activo: boolean;
}): Promise<boolean> {
  const db = getTenantDb(input.tenantId);
  const actualizados = await db
    .update(emailIngestionFilters)
    .set({ activo: input.activo })
    .where(and(eq(emailIngestionFilters.tenantId, input.tenantId), eq(emailIngestionFilters.id, input.filtroId)))
    .returning({ id: emailIngestionFilters.id });
  return actualizados.length > 0;
}

export async function leerFiltrosIngesta(tenantId: string): Promise<ReadonlyArray<FiltroIngesta>> {
  const db = getTenantDb(tenantId);
  const filas = await db.select().from(emailIngestionFilters).where(eq(emailIngestionFilters.tenantId, tenantId));
  return filas.map((f) => ({
    id: f.id,
    remitente: f.remitente,
    ...(f.servicio !== null ? { servicio: f.servicio } : {}),
    ...(f.proveedor !== null ? { proveedor: f.proveedor } : {}),
    keywords: Array.isArray(f.keywords) ? (f.keywords as ReadonlyArray<string>) : [],
    activo: f.activo,
  }));
}

export async function leerCatalogoCuentas(tenantId: string): Promise<ReadonlyArray<CuentaCatalogo>> {
  const db = getTenantDb(tenantId);
  const filas = await db.select().from(serviceAccounts).where(eq(serviceAccounts.tenantId, tenantId));
  return filas.map((c) => ({
    accountId: c.id,
    servicio: c.servicio,
    proveedor: c.proveedor,
    emails: c.emailOrigen !== null ? [c.emailOrigen] : [],
  }));
}

export async function existeLogIngesta(tenantId: string, messageId: string): Promise<boolean> {
  const db = getTenantDb(tenantId);
  const [fila] = await db
    .select({ id: emailIngestionLog.id })
    .from(emailIngestionLog)
    .where(and(eq(emailIngestionLog.tenantId, tenantId), eq(emailIngestionLog.messageId, messageId)))
    .limit(1);
  return Boolean(fila);
}

export async function guardarBorradorIngesta(
  input: BorradorIngestaInput,
): Promise<{ readonly id: string; readonly nuevo: boolean }> {
  const db = getTenantDb(input.tenantId);
  const [creado] = await db
    .insert(emailIngestionDrafts)
    .values({
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      messageId: input.messageId,
      gmailAttachmentId: input.gmailAttachmentId,
      accountId: input.accountId,
      canal: "gmail",
      periodo: input.periodo,
      vencimiento: input.vencimiento,
      montoCentavos: input.montoCentavos,
      origen: input.origen,
      confianza: confianzaParaGuardar({
        monto: input.confianzaMonto,
        vencimiento: input.confianzaVencimiento,
        ...(input.pideRevision === true ? { pideRevision: true } : {}),
        ...(input.comprobanteCuerpo ? { comprobante: input.comprobanteCuerpo } : {}),
      }),
      estado: "pendiente",
      venceEn: input.venceEn,
      recordatorioEn: input.recordatorioEn,
    })
    .onConflictDoNothing({
      target: [emailIngestionDrafts.tenantId, emailIngestionDrafts.messageId],
    })
    .returning({ id: emailIngestionDrafts.id });
  if (creado) return { id: creado.id, nuevo: true };
  const [existente] = await db
    .select({ id: emailIngestionDrafts.id })
    .from(emailIngestionDrafts)
    .where(
      and(
        eq(emailIngestionDrafts.tenantId, input.tenantId),
        eq(emailIngestionDrafts.messageId, input.messageId),
      ),
    )
    .limit(1);
  if (!existente) throw new Error("El borrador no se pudo guardar");
  return { id: existente.id, nuevo: false };
}

export async function registrarLogIngesta(input: LogIngestaInput): Promise<void> {
  const db = getTenantDb(input.tenantId);
  // P1-84: email_ingestion_log con tenant_id (0048).
  await db
    .insert(emailIngestionLog)
    .values(
      filaConTenant({
        messageId: input.messageId,
        historyId: input.historyId,
        remitenteDominio: input.remitenteDominio,
        decision: input.decision,
        motivo: input.motivo,
        filtroId: input.filtroId,
        accountId: input.accountId,
        tenantId: input.tenantId,
      }),
    )
    .onConflictDoNothing({ target: [emailIngestionLog.tenantId, emailIngestionLog.messageId] });
}
