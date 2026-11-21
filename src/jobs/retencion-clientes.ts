import { and, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { getControlDb, getTenantDb } from "../lib/db.js";
import { authEvents, tenants, whatsappIdentities } from "../db/schema.js";
import { tenantLifecycleEvents } from "../db/schema-admin.js";
import { customerMovements, customers } from "../db/schema-credito.js";
import { deliveryStatus, emailOutbox } from "../db/schema-email.js";
import {
  botTurnos,
  notificationPreferences,
  whatsappCodes,
  whatsappSessions,
  whatsappUsage,
} from "../db/schema-whatsapp.js";
import { elegir_tenants_retencion, type TenantCerrable } from "../modules/tenants/retencion-clientes.js";

// P10-90: job de retención (/privacidad, PR #369). A los 90 días del cierre
// anonimiza o borra los datos personales del comercio y deja los
// comprobantes fiscales y la plata (ventas, caja, saldos de fiado).
// Idempotente: cada paso filtra solo filas que todavía tienen datos, así que
// re-correr no cambia nada ni deja un evento nuevo. Corre con X-Job-Secret
// (ver /api/jobs/retencion-clientes).

export const NOMBRE_CLIENTE_ANONIMO = "Cliente eliminado";
export const NUMERO_ANONIMO = "anonimizado";

export interface ConteoRetencion {
  clientesAnonimizados: number;
  motivosFiadoBorrados: number;
  usoWhatsappAnonimizado: number;
  turnosBotBorrados: number;
  preferenciasBorradas: number;
  emailsBorrados: number;
  identidadesWhatsappBorradas: number;
  sesionesWhatsappBorradas: number;
  codigosWhatsappBorrados: number;
}

export interface ResultadoRetencion {
  anonimizados: string[];
  sinFechaCierre: string[];
  conteos: Record<string, ConteoRetencion>;
}

function iso(v: Date | string | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

async function tenantsCerrados(): Promise<TenantCerrable[]> {
  const db = getControlDb();
  const filas = await db
    .select({ id: tenants.id, estado: tenants.estado, esDemo: tenants.esDemo, trialHasta: tenants.trialHasta })
    .from(tenants)
    .where(eq(tenants.estado, "baja"));
  if (filas.length === 0) return [];
  const eventos = await db
    .select({ tenantId: tenantLifecycleEvents.tenantId, creadoEn: tenantLifecycleEvents.creadoEn })
    .from(tenantLifecycleEvents)
    .where(and(eq(tenantLifecycleEvents.aEstado, "baja"), inArray(tenantLifecycleEvents.tenantId, filas.map((f) => f.id))));
  const primera = new Map<string, number>();
  for (const e of eventos) {
    const ms = new Date(e.creadoEn).getTime();
    const previa = primera.get(e.tenantId);
    if (previa === undefined || ms < previa) primera.set(e.tenantId, ms);
  }
  return filas.map((f) => {
    const ms = primera.get(f.id);
    return {
      id: f.id,
      estado: f.estado,
      esDemo: f.esDemo,
      trialHasta: iso(f.trialHasta),
      bajaEn: ms === undefined ? null : new Date(ms).toISOString(),
    };
  });
}

// P10-90: números de WhatsApp vinculados a este comercio y a ningún otro.
// Sesiones y códigos no tienen tenant_id: un número que sigue vinculado a otro
// comercio conserva su sesión.
async function numerosSoloDe(tenantId: string): Promise<string[]> {
  const control = getControlDb();
  const negocio = getTenantDb(tenantId);
  const propios = new Set<string>();
  const ids = await control
    .select({ numero: whatsappIdentities.numero })
    .from(whatsappIdentities)
    .where(and(eq(whatsappIdentities.tenantId, tenantId), isNotNull(whatsappIdentities.numero)));
  for (const f of ids) if (f.numero) propios.add(f.numero);
  const usos = await negocio
    .selectDistinct({ numero: whatsappUsage.numeroE164 })
    .from(whatsappUsage)
    .where(and(eq(whatsappUsage.tenantId, tenantId), ne(whatsappUsage.numeroE164, NUMERO_ANONIMO)));
  for (const f of usos) propios.add(f.numero);
  const turnos = await negocio
    .selectDistinct({ numero: botTurnos.numeroE164 })
    .from(botTurnos)
    .where(eq(botTurnos.tenantId, tenantId));
  for (const f of turnos) propios.add(f.numero);
  if (propios.size === 0) return [];
  const ajenos = await control
    .select({ numero: whatsappIdentities.numero })
    .from(whatsappIdentities)
    .where(
      and(
        inArray(whatsappIdentities.numero, [...propios]),
        or(isNull(whatsappIdentities.tenantId), ne(whatsappIdentities.tenantId, tenantId)),
      ),
    );
  for (const f of ajenos) if (f.numero) propios.delete(f.numero);
  return [...propios].sort();
}

export async function anonimizarTenant(tenantId: string): Promise<ConteoRetencion> {
  const control = getControlDb();
  const negocio = getTenantDb(tenantId);
  const numeros = await numerosSoloDe(tenantId);
  let sesionesWhatsappBorradas = 0;
  let codigosWhatsappBorrados = 0;
  if (numeros.length > 0) {
    sesionesWhatsappBorradas = (
      await negocio.delete(whatsappSessions).where(inArray(whatsappSessions.numeroE164, numeros)).returning({ id: whatsappSessions.id })
    ).length;
    codigosWhatsappBorrados = (
      await control.delete(whatsappCodes).where(inArray(whatsappCodes.numeroE164, numeros)).returning({ id: whatsappCodes.id })
    ).length;
  }

  const deNegocio = await negocio.transaction(async (tx) => {
    const clientes = await tx
      .update(customers)
      .set({ nombre: NOMBRE_CLIENTE_ANONIMO, telefono: null, dni: null, notas: null })
      .where(
        and(
          eq(customers.tenantId, tenantId),
          or(ne(customers.nombre, NOMBRE_CLIENTE_ANONIMO), isNotNull(customers.telefono), isNotNull(customers.dni), isNotNull(customers.notas)),
        ),
      )
      .returning({ id: customers.id });
    const motivos = await tx
      .update(customerMovements)
      .set({ motivo: null })
      .where(and(eq(customerMovements.tenantId, tenantId), isNotNull(customerMovements.motivo)))
      .returning({ id: customerMovements.id });
    const usos = await tx
      .update(whatsappUsage)
      .set({ numeroE164: NUMERO_ANONIMO })
      .where(and(eq(whatsappUsage.tenantId, tenantId), ne(whatsappUsage.numeroE164, NUMERO_ANONIMO)))
      .returning({ id: whatsappUsage.id });
    const turnos = await tx.delete(botTurnos).where(eq(botTurnos.tenantId, tenantId)).returning({ id: botTurnos.id });
    const prefs = await tx
      .delete(notificationPreferences)
      .where(eq(notificationPreferences.tenantId, tenantId))
      .returning({ id: notificationPreferences.id });
    // P10-90: delivery_status referencia email_outbox; se borra primero.
    await tx.delete(deliveryStatus).where(eq(deliveryStatus.tenantId, tenantId));
    const emails = await tx.delete(emailOutbox).where(eq(emailOutbox.tenantId, tenantId)).returning({ id: emailOutbox.id });
    return {
      clientesAnonimizados: clientes.length,
      motivosFiadoBorrados: motivos.length,
      usoWhatsappAnonimizado: usos.length,
      turnosBotBorrados: turnos.length,
      preferenciasBorradas: prefs.length,
      emailsBorrados: emails.length,
    };
  });

  const identidades = await control
    .delete(whatsappIdentities)
    .where(eq(whatsappIdentities.tenantId, tenantId))
    .returning({ id: whatsappIdentities.id });

  const conteo: ConteoRetencion = {
    ...deNegocio,
    identidadesWhatsappBorradas: identidades.length,
    sesionesWhatsappBorradas,
    codigosWhatsappBorrados,
  };
  if (Object.values(conteo).some((n) => n > 0)) {
    await control.insert(authEvents).values({
      tenantId,
      tipo: "retencion_clientes_aplicada",
      actor: "sistema:retencion-clientes",
      detalle: { ...conteo },
    });
  }
  return conteo;
}

export async function ejecutarRetencionClientes(ahora = new Date()): Promise<ResultadoRetencion> {
  const { vencidos, sinFechaCierre } = elegir_tenants_retencion(await tenantsCerrados(), ahora);
  const conteos: Record<string, ConteoRetencion> = {};
  for (const id of vencidos) conteos[id] = await anonimizarTenant(id);
  return { anonimizados: vencidos, sinFechaCierre, conteos };
}
