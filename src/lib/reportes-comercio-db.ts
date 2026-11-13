import { and, desc, eq } from "drizzle-orm";
import { getControlDb } from "./db.js";
import { platformFeedbackReports } from "../db/schema-admin.js";
import type {
  ContextoReporteSeguro,
  EstadoReporteComercio,
  ReporteComercioMem,
  TipoReporteComercio,
} from "./reportes-comercio-store.js";

export type MotivoPersistenciaFallida = "sin_url" | "sin_tabla" | "error";

export type ResultadoPersistir =
  | { ok: true }
  | { ok: false; motivo: MotivoPersistenciaFallida };

let tablaDisponible: boolean | null = null;

export function tablaReportesDisponible(): boolean | null {
  return tablaDisponible;
}

export function resetTablaReportesProbe(): void {
  tablaDisponible = null;
}

function filaAMem(row: typeof platformFeedbackReports.$inferSelect): ReporteComercioMem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    nombreComercio: row.nombreComercio,
    autorGoogleSub: row.autorGoogleSub,
    idempotencyKey: row.idempotencyKey,
    tipo: row.tipo as TipoReporteComercio,
    texto: row.texto,
    estado: row.estado as EstadoReporteComercio,
    contexto: row.contexto as ContextoReporteSeguro,
    creadoEn: row.creadoEn.toISOString(),
    actualizadoEn: row.actualizadoEn.toISOString(),
  };
}

function clasificarError(e: unknown): MotivoPersistenciaFallida {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = String((e as { code?: unknown }).code);
    if (code === "42P01") return "sin_tabla";
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("Falta CONTROL_DATABASE_URL")) return "sin_url";
  if (/does not exist|no existe/i.test(msg)) return "sin_tabla";
  return "error";
}

export async function persistirReporteComercio(r: ReporteComercioMem): Promise<ResultadoPersistir> {
  try {
    const db = getControlDb();
    await db.insert(platformFeedbackReports).values({
      id: r.id,
      tenantId: r.tenantId,
      nombreComercio: r.nombreComercio,
      autorGoogleSub: r.autorGoogleSub,
      idempotencyKey: r.idempotencyKey,
      tipo: r.tipo,
      texto: r.texto,
      estado: r.estado,
      contexto: r.contexto,
      creadoEn: new Date(r.creadoEn),
      actualizadoEn: new Date(r.actualizadoEn),
    });
    tablaDisponible = true;
    return { ok: true };
  } catch (e) {
    const motivo = clasificarError(e);
    if (motivo === "sin_tabla") tablaDisponible = false;
    return { ok: false, motivo };
  }
}

export async function actualizarEstadoReporteDb(
  id: string,
  estado: string,
  actualizadoEn: string,
): Promise<ResultadoPersistir> {
  try {
    const db = getControlDb();
    await db
      .update(platformFeedbackReports)
      .set({ estado, actualizadoEn: new Date(actualizadoEn) })
      .where(eq(platformFeedbackReports.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: clasificarError(e) };
  }
}

export async function leerReporteDb(id: string): Promise<ReporteComercioMem | null> {
  try {
    const db = getControlDb();
    const [row] = await db.select().from(platformFeedbackReports).where(eq(platformFeedbackReports.id, id)).limit(1);
    if (!row) return null;
    tablaDisponible = true;
    return filaAMem(row);
  } catch (e) {
    if (clasificarError(e) === "sin_tabla") tablaDisponible = false;
    return null;
  }
}

export async function leerPorClaveDb(idempotencyKey: string): Promise<ReporteComercioMem | null> {
  try {
    const db = getControlDb();
    const [row] = await db
      .select()
      .from(platformFeedbackReports)
      .where(eq(platformFeedbackReports.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!row) return null;
    tablaDisponible = true;
    return filaAMem(row);
  } catch (e) {
    if (clasificarError(e) === "sin_tabla") tablaDisponible = false;
    return null;
  }
}

export async function listarPropiosDb(tenantId: string, googleSub: string): Promise<ReporteComercioMem[] | null> {
  try {
    const db = getControlDb();
    const rows = await db
      .select()
      .from(platformFeedbackReports)
      .where(
        and(eq(platformFeedbackReports.tenantId, tenantId), eq(platformFeedbackReports.autorGoogleSub, googleSub)),
      )
      .orderBy(desc(platformFeedbackReports.creadoEn));
    tablaDisponible = true;
    return rows.map(filaAMem);
  } catch (e) {
    const motivo = clasificarError(e);
    if (motivo === "sin_tabla") tablaDisponible = false;
    if (motivo === "sin_url") return null;
    return [];
  }
}

export async function listarPlataformaDb(
  filtroEstado?: EstadoReporteComercio,
): Promise<ReporteComercioMem[] | null> {
  try {
    const db = getControlDb();
    const rows = await db
      .select()
      .from(platformFeedbackReports)
      .orderBy(desc(platformFeedbackReports.creadoEn));
    tablaDisponible = true;
    const mapped = rows.map(filaAMem);
    if (!filtroEstado) return mapped;
    return mapped.filter((r) => r.estado === filtroEstado);
  } catch (e) {
    const motivo = clasificarError(e);
    if (motivo === "sin_tabla") tablaDisponible = false;
    if (motivo === "sin_url") return null;
    return [];
  }
}

export function mensajePersistenciaFallida(motivo: MotivoPersistenciaFallida): string {
  if (motivo === "sin_url") {
    return "No hay base de control configurada; no podemos guardar el envío.";
  }
  if (motivo === "sin_tabla") {
    return "Todavía no está lista la tabla de reportes en el servidor. Probá más tarde.";
  }
  return "No pudimos guardar el envío. Probá de nuevo en unos minutos.";
}
