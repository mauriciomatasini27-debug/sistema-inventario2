import { eq } from "drizzle-orm";
import { getControlDb } from "./db.js";
import { platformFeedbackReports } from "../db/schema-admin.js";
import type { ReporteComercioMem } from "./reportes-comercio-store.js";

let tablaProbada: boolean | null = null;

export function tablaReportesDisponible(): boolean | null {
  return tablaProbada;
}

async function marcarTabla(ok: boolean): Promise<void> {
  tablaProbada = ok;
}

export async function persistirReporteComercio(r: ReporteComercioMem): Promise<boolean> {
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
    await marcarTabla(true);
    return true;
  } catch {
    await marcarTabla(false);
    return false;
  }
}

export async function actualizarEstadoReporteDb(
  id: string,
  estado: string,
  actualizadoEn: string,
): Promise<boolean> {
  try {
    const db = getControlDb();
    await db
      .update(platformFeedbackReports)
      .set({ estado, actualizadoEn: new Date(actualizadoEn) })
      .where(eq(platformFeedbackReports.id, id));
    return true;
  } catch {
    return false;
  }
}

export function resetTablaReportesProbe(): void {
  tablaProbada = null;
}
