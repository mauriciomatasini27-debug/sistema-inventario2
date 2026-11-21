import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { getControlDb, getTenantDb } from "../lib/db.js";
import {
  authEvents,
  invitations,
  memberships,
  ocrEventos,
  ocrJobs,
  sessions,
  tenants,
  users,
  whatsappIdentities,
} from "../db/schema.js";
import {
  emailIngestionDrafts,
  gmailConnectionEvents,
  gmailIngestionJobs,
  gmailWatchRoutes,
  googleConnections,
} from "../db/schema-google.js";
import {
  proveedorContactos,
  proveedorCupo,
  proveedorInvitaciones,
  supplierDrafts,
  supplierMatchLog,
  suppliers,
} from "../db/schema-proveedores.js";
import { adminAuditLog, platformFeedbackReports, tenantLifecycleEvents } from "../db/schema-admin.js";
import { customerMovements, customers } from "../db/schema-credito.js";
import { deliveryStatus, emailOutbox } from "../db/schema-email.js";
import {
  botTurnos,
  notificationPreferences,
  whatsappCodes,
  whatsappSessions,
  whatsappUsage,
} from "../db/schema-whatsapp.js";
import { descifrarRefreshTokenGmail } from "../lib/repos/google-conexiones.js";
import { revocarTokenGoogle } from "../modules/integraciones/google-oauth.js";
import { type AvisoRetencion, elegir_tenants_retencion, type TenantCerrable } from "../modules/tenants/retencion-clientes.js";

// P10-90: job de retención (/privacidad, PR #369): a los 90 días del cierre
// anonimiza o borra los datos personales del comercio (clientes, WhatsApp,
// OCR, proveedores, Gmail, cuentas, feedback y auditoría; P10-90) y deja los
// comprobantes fiscales y la plata (ventas, caja, saldos de fiado, facturas y
// pagos a proveedores). Revoca el permiso de Gmail en Google y 7 días antes
// manda un aviso al dueño.
// Idempotente: cada paso filtra solo filas que todavía tienen datos, así que
// re-correr no cambia nada ni deja un evento nuevo. Corre con X-Job-Secret
// (ver /api/jobs/retencion-clientes).

export const NOMBRE_CLIENTE_ANONIMO = "Cliente eliminado";
export const NUMERO_ANONIMO = "anonimizado";
export const NOMBRE_PROVEEDOR_ANONIMO = "Proveedor eliminado";
export const EMAIL_USUARIO_ANONIMO = "eliminado@modoops.invalid";
export const ACTOR_ANONIMO = "anonimizado";
const TIPO_EVENTO_RETENCION = "retencion_clientes_aplicada";

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
  ocrBorrados: number;
  borradoresProveedorBorrados: number;
  contactosProveedorBorrados: number;
  proveedoresAnonimizados: number;
  gmailBorrado: number;
  membresiasBorradas: number;
  sesionesBorradas: number;
  invitacionesBorradas: number;
  usuariosBorrados: number;
  usuariosAnonimizados: number;
  googleRevocado: number;
  feedbackBorrado: number;
  auditoriaAnonimizada: number;
}

// P10-90: lo que el job necesita de afuera; los tests lo reemplazan.
export interface DepsRetencion {
  // P10-90: revoca en Google el refresh token de Gmail del comercio. false si no hay
  // conexión; lanza si Google o el KMS fallan.
  revocarGoogle: (tenantId: string) => Promise<boolean>;
}

const depsReales: DepsRetencion = {
  async revocarGoogle(tenantId) {
    const token = await descifrarRefreshTokenGmail(tenantId);
    if (!token) return false;
    await revocarTokenGoogle(token);
    return true;
  },
};

export interface ResultadoRetencion {
  anonimizados: string[];
  sinFechaCierre: string[];
  conteos: Record<string, ConteoRetencion>;
  // P10-90: Google no respondió; la conexión queda y se reintenta en la
  // próxima corrida (borrarla sin revocar dejaría el permiso vivo en Google).
  revocacionGooglePendiente: string[];
  avisados: string[];
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
  // P10-90: vale la última baja; si el comercio se reabrió y volvió a cerrar,
  // los 90 días cuentan desde el último cierre.
  const ultima = new Map<string, number>();
  for (const e of eventos) {
    const ms = new Date(e.creadoEn).getTime();
    const previa = ultima.get(e.tenantId);
    if (previa === undefined || ms > previa) ultima.set(e.tenantId, ms);
  }
  return filas.map((f) => {
    const ms = ultima.get(f.id);
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

type ConteoCuentas = Pick<
  ConteoRetencion,
  "membresiasBorradas" | "sesionesBorradas" | "invitacionesBorradas" | "usuariosBorrados" | "usuariosAnonimizados"
> & { readonly subsRetirados: string[] };

// P10-90: cuentas del dueño y empleados. Se va la membresía de este comercio;
// el usuario solo se borra (o anonimiza, si otra fila lo referencia) cuando no
// le queda ninguna membresía activa ni es dueño de otro comercio que no esté
// en baja. Corre después de borrar whatsapp_identities (FK a users).
async function limpiarCuentas(tenantId: string): Promise<ConteoCuentas> {
  return getControlDb().transaction(async (tx) => {
    const candidatos = new Set<string>();
    for (const f of await tx
      .select({ sub: memberships.googleSub })
      .from(memberships)
      .where(and(eq(memberships.tenantId, tenantId), isNotNull(memberships.googleSub)))) {
      if (f.sub) candidatos.add(f.sub);
    }
    for (const f of await tx.select({ sub: tenants.ownerGoogleSub }).from(tenants).where(eq(tenants.id, tenantId))) {
      if (f.sub) candidatos.add(f.sub);
    }
    const sesionesTenant = await tx.delete(sessions).where(eq(sessions.tenantId, tenantId)).returning({ id: sessions.idHash });
    const invs = await tx.delete(invitations).where(eq(invitations.tenantId, tenantId)).returning({ id: invitations.id });
    const membs = await tx.delete(memberships).where(eq(memberships.tenantId, tenantId)).returning({ id: memberships.id });
    await tx.update(tenants).set({ ownerGoogleSub: null }).where(and(eq(tenants.id, tenantId), isNotNull(tenants.ownerGoogleSub)));

    let sesionesUsuario = 0;
    let usuariosBorrados = 0;
    let usuariosAnonimizados = 0;
    const subsRetirados: string[] = [];
    for (const sub of [...candidatos].sort()) {
      const activa = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
        .where(and(eq(memberships.googleSub, sub), eq(memberships.estado, "activo"), ne(tenants.estado, "baja")))
        .limit(1);
      const duenoVivo = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(and(eq(tenants.ownerGoogleSub, sub), ne(tenants.estado, "baja")))
        .limit(1);
      if (activa.length > 0 || duenoVivo.length > 0) continue;
      subsRetirados.push(sub);
      sesionesUsuario += (await tx.delete(sessions).where(eq(sessions.googleSub, sub)).returning({ id: sessions.idHash })).length;
      const refs =
        (await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.googleSub, sub)).limit(1)).length +
        (await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.ownerGoogleSub, sub)).limit(1)).length +
        (await tx.select({ id: whatsappIdentities.id }).from(whatsappIdentities).where(eq(whatsappIdentities.googleSub, sub)).limit(1))
          .length;
      if (refs === 0) {
        usuariosBorrados += (await tx.delete(users).where(eq(users.googleSub, sub)).returning({ sub: users.googleSub })).length;
        continue;
      }
      usuariosAnonimizados += (
        await tx
          .update(users)
          .set({ email: EMAIL_USUARIO_ANONIMO, emailVerificado: false, nombre: null, fotoUrl: null })
          .where(and(eq(users.googleSub, sub), or(ne(users.email, EMAIL_USUARIO_ANONIMO), isNotNull(users.nombre), isNotNull(users.fotoUrl))))
          .returning({ sub: users.googleSub })
      ).length;
    }
    return {
      membresiasBorradas: membs.length,
      sesionesBorradas: sesionesTenant.length + sesionesUsuario,
      invitacionesBorradas: invs.length,
      usuariosBorrados,
      usuariosAnonimizados,
      subsRetirados,
    };
  });
}

// P10-90 (migración 0052, autorizada por Mauri 2026-11-21): auth_events,
// gmail_connection_events y admin_audit_log son append-only; el trigger deja
// cambiar solo actor/detalle y solo con modoops.retencion = 'on' en esta
// transacción. Se anonimizan las filas del comercio y las de las personas que
// se retiraron. El evento del propio job queda (solo trae conteos).
async function anonimizarAuditoria(tenantId: string, subs: ReadonlyArray<string>): Promise<number> {
  return getControlDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('modoops.retencion', 'on', true)`);
    const deTenantOSub =
      subs.length > 0 ? or(eq(authEvents.tenantId, tenantId), inArray(authEvents.actor, [...subs])) : eq(authEvents.tenantId, tenantId);
    const auth = await tx
      .update(authEvents)
      .set({ actor: ACTOR_ANONIMO, detalle: null })
      .where(
        and(
          deTenantOSub,
          ne(authEvents.tipo, TIPO_EVENTO_RETENCION),
          or(isNull(authEvents.actor), ne(authEvents.actor, ACTOR_ANONIMO), isNotNull(authEvents.detalle)),
          or(isNotNull(authEvents.actor), isNotNull(authEvents.detalle)),
        ),
      )
      .returning({ id: authEvents.id });
    const gmail = await tx
      .update(gmailConnectionEvents)
      .set({ actor: ACTOR_ANONIMO })
      .where(
        and(
          eq(gmailConnectionEvents.tenantId, tenantId),
          isNotNull(gmailConnectionEvents.actor),
          ne(gmailConnectionEvents.actor, ACTOR_ANONIMO),
        ),
      )
      .returning({ id: gmailConnectionEvents.id });
    // P10-90: admin_audit_log encadena hashes sobre actor y detalle; la fila
    // anonimizada conserva hash y prev_hash y queda marcada para que
    // verificar-hash solo controle el encadenado.
    const admin = await tx
      .update(adminAuditLog)
      .set({
        actorGoogleSub: ACTOR_ANONIMO,
        detalle: sql`jsonb_build_object('kind', ${adminAuditLog.actoKind}, 'anonimizado', true)`,
      })
      .where(
        and(
          eq(adminAuditLog.tenantId, tenantId),
          or(ne(adminAuditLog.actorGoogleSub, ACTOR_ANONIMO), sql`${adminAuditLog.detalle} ->> 'anonimizado' is distinct from 'true'`),
        ),
      )
      .returning({ id: adminAuditLog.id });
    return auth.length + gmail.length + admin.length;
  });
}

export async function anonimizarTenant(
  tenantId: string,
  deps: DepsRetencion = depsReales,
  pendientes: string[] = [],
): Promise<ConteoRetencion> {
  const control = getControlDb();
  // P10-90: revocar antes de borrar el token cifrado.
  let googleRevocado = 0;
  let borrarConexionGoogle = true;
  try {
    if (await deps.revocarGoogle(tenantId)) googleRevocado = 1;
  } catch {
    borrarConexionGoogle = false;
    pendientes.push(tenantId);
  }
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
    // P10-90: OCR y borradores de facturas de proveedor (lo que llega por
    // WhatsApp o Gmail). Las imágenes no se guardan acá: bytes_ref es una
    // referencia (wa-media:<id> en Meta); se borra la fila con la referencia.
    // La factura confirmada (supplier_invoices) queda como registro fiscal.
    const ocr =
      (await tx.delete(ocrEventos).where(eq(ocrEventos.tenantId, tenantId)).returning({ id: ocrEventos.id })).length +
      (await tx.delete(ocrJobs).where(eq(ocrJobs.tenantId, tenantId)).returning({ id: ocrJobs.id })).length;
    const borradores =
      (await tx.delete(supplierMatchLog).where(eq(supplierMatchLog.tenantId, tenantId)).returning({ id: supplierMatchLog.id })).length +
      (await tx.delete(supplierDrafts).where(eq(supplierDrafts.tenantId, tenantId)).returning({ id: supplierDrafts.id })).length;
    const contactos =
      (await tx.delete(proveedorContactos).where(eq(proveedorContactos.tenantId, tenantId)).returning({ n: proveedorContactos.numeroE164 }))
        .length +
      (await tx.delete(proveedorCupo).where(eq(proveedorCupo.tenantId, tenantId)).returning({ n: proveedorCupo.numeroE164 })).length +
      (
        await tx
          .delete(proveedorInvitaciones)
          .where(eq(proveedorInvitaciones.tenantId, tenantId))
          .returning({ c: proveedorInvitaciones.codigoHash })
      ).length;
    // P10-90: el CUIT del proveedor queda (lo usan facturas y pagos, registro
    // fiscal); se van nombre, email y teléfono.
    const provs = await tx
      .update(suppliers)
      .set({ nombre: NOMBRE_PROVEEDOR_ANONIMO, email: null, telefono: null })
      .where(
        and(
          eq(suppliers.tenantId, tenantId),
          or(ne(suppliers.nombre, NOMBRE_PROVEEDOR_ANONIMO), isNotNull(suppliers.email), isNotNull(suppliers.telefono)),
        ),
      )
      .returning({ id: suppliers.id });
    // P10-90: conexión de Gmail del dueño (casilla y refresh token cifrado) y
    // lo que se ingirió por ella.
    const gmail =
      (await tx.delete(emailIngestionDrafts).where(eq(emailIngestionDrafts.tenantId, tenantId)).returning({ id: emailIngestionDrafts.id }))
        .length +
      (await tx.delete(gmailIngestionJobs).where(eq(gmailIngestionJobs.tenantId, tenantId)).returning({ id: gmailIngestionJobs.id })).length +
      (borrarConexionGoogle
        ? (await tx.delete(googleConnections).where(eq(googleConnections.tenantId, tenantId)).returning({ id: googleConnections.id })).length
        : 0);
    return {
      ocrBorrados: ocr,
      borradoresProveedorBorrados: borradores,
      contactosProveedorBorrados: contactos,
      proveedoresAnonimizados: provs.length,
      gmailBorrado: gmail,
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

  const rutasGmail = await control
    .delete(gmailWatchRoutes)
    .where(eq(gmailWatchRoutes.tenantId, tenantId))
    .returning({ id: gmailWatchRoutes.id });
  const { subsRetirados, ...cuentas } = await limpiarCuentas(tenantId);
  const feedback = await control
    .delete(platformFeedbackReports)
    .where(eq(platformFeedbackReports.tenantId, tenantId))
    .returning({ id: platformFeedbackReports.id });
  const auditoriaAnonimizada = await anonimizarAuditoria(tenantId, subsRetirados);

  const conteo: ConteoRetencion = {
    ...deNegocio,
    ...cuentas,
    googleRevocado,
    feedbackBorrado: feedback.length,
    auditoriaAnonimizada,
    gmailBorrado: deNegocio.gmailBorrado + rutasGmail.length,
    identidadesWhatsappBorradas: identidades.length,
    sesionesWhatsappBorradas,
    codigosWhatsappBorrados,
  };
  if (Object.values(conteo).some((n) => n > 0)) {
    await control.insert(authEvents).values({
      tenantId,
      tipo: TIPO_EVENTO_RETENCION,
      actor: "sistema:retencion-clientes",
      detalle: { ...conteo },
    });
  }
  return conteo;
}

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

// P10-90: aviso al dueño 7 días antes del borrado. Una sola vez por cierre:
// la clave de idempotencia lleva la fecha de cierre.
async function avisarDueno(aviso: AvisoRetencion): Promise<boolean> {
  const control = getControlDb();
  const [fila] = await control
    .select({ nombre: tenants.nombreComercio, email: users.email })
    .from(tenants)
    .innerJoin(users, eq(users.googleSub, tenants.ownerGoogleSub))
    .where(eq(tenants.id, aviso.id))
    .limit(1);
  if (!fila?.email || fila.email === EMAIL_USUARIO_ANONIMO) return false;
  const dia = fechaCorta(aviso.borradoEn);
  const asunto = `El ${dia} borramos los datos de ${fila.nombre}`;
  const texto =
    `Hola. La cuenta de ${fila.nombre} en ModoOps está cerrada desde el ${fechaCorta(aviso.cierre)}. ` +
    `El ${dia} vamos a borrar o anonimizar los datos de tus clientes, proveedores, WhatsApp, OCR, Gmail y las cuentas de acceso, ` +
    `como dice nuestra política de privacidad. Los comprobantes fiscales se conservan. ` +
    `Si querés reabrir la cuenta antes de esa fecha, respondé este mail.`;
  const insertadas = await getTenantDb(aviso.id)
    .insert(emailOutbox)
    .values({
      tenantId: aviso.id,
      categoria: "retencion",
      plantilla: "retencion_aviso_v1",
      destinatario: fila.email,
      asunto,
      html: `<p>${texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
      texto,
      idempotencyKey: `retencion-aviso:${aviso.id}:${aviso.cierre}`,
      estado: "pendiente",
    })
    .onConflictDoNothing()
    .returning({ id: emailOutbox.id });
  return insertadas.length > 0;
}

export async function ejecutarRetencionClientes(
  ahora = new Date(),
  deps: DepsRetencion = depsReales,
): Promise<ResultadoRetencion> {
  const { vencidos, sinFechaCierre, avisar } = elegir_tenants_retencion(await tenantsCerrados(), ahora);
  const conteos: Record<string, ConteoRetencion> = {};
  const revocacionGooglePendiente: string[] = [];
  for (const id of vencidos) conteos[id] = await anonimizarTenant(id, deps, revocacionGooglePendiente);
  const avisados: string[] = [];
  for (const a of avisar) if (await avisarDueno(a)) avisados.push(a.id);
  return { anonimizados: vencidos, sinFechaCierre, conteos, revocacionGooglePendiente, avisados };
}
