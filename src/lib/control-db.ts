import { eq } from "drizzle-orm";
import { getControlDb } from "./db.js";
import { filaConTenant } from "./tenant-scope.js";
import {
  authEvents,
  devicePins,
  idMappings,
  invitations,
  memberships,
  outbox,
  provisionJobs,
  sessions,
  tenantDatabases,
  tenants,
  users,
  whatsappIdentities,
  type AuthEventDetalle,
  type OutboxPayload,
} from "../db/schema.js";
import { whatsappCodes } from "../db/schema-whatsapp.js";
import { deviceSyncState, offlineGrants } from "../db/schema-sync.js";
import { rubroSchema } from "./validation.js";

// Write-through de control best-effort (mismo patrón que server-db para el
// tenant). El store en memoria sigue siendo la fuente de verdad en
// monoproceso; esto solo agrega copia durable cuando hay CONTROL_DATABASE_URL
// viva. Nunca lanza: sin env/tabla/conexión el caller sigue con memoria.
type ControlDb = ReturnType<typeof getControlDb>;

async function intentarControl(fn: (db: ControlDb) => Promise<unknown>): Promise<boolean> {
  try {
    await fn(getControlDb());
    return true;
  } catch {
    return false;
  }
}

export function persistirUsuario(u: {
  googleSub: string;
  email: string;
  emailVerificado: boolean;
  nombre?: string | undefined;
  fotoUrl?: string | undefined;
  ultimoLoginAt?: string | undefined;
}): Promise<boolean> {
  return intentarControl((db) =>
    db
      .insert(users)
      .values({
        googleSub: u.googleSub,
        email: u.email,
        emailVerificado: u.emailVerificado,
        nombre: u.nombre ?? null,
        fotoUrl: u.fotoUrl ?? null,
        ultimoLoginAt: u.ultimoLoginAt ? new Date(u.ultimoLoginAt) : null,
      })
      .onConflictDoUpdate({
        target: users.googleSub,
        set: {
          email: u.email,
          emailVerificado: u.emailVerificado,
          nombre: u.nombre ?? null,
          fotoUrl: u.fotoUrl ?? null,
          ultimoLoginAt: u.ultimoLoginAt ? new Date(u.ultimoLoginAt) : null,
        },
      }),
  );
}

export function persistirSesion(s: {
  idHash: string;
  googleSub: string;
  tenantId: string | null;
  expiraAt: string;
  expiraAbsoluta?: string | undefined;
  lastSeenAt?: string | undefined;
  reauthAt?: string | undefined;
}): Promise<boolean> {
  return intentarControl((db) =>
    db
      .insert(sessions)
      .values({
        idHash: s.idHash,
        googleSub: s.googleSub,
        tenantId: s.tenantId,
        expiraAt: new Date(s.expiraAt),
        expiraAbsoluta: s.expiraAbsoluta ? new Date(s.expiraAbsoluta) : null,
        lastSeenAt: s.lastSeenAt ? new Date(s.lastSeenAt) : null,
        reauthAt: s.reauthAt ? new Date(s.reauthAt) : null,
      })
      .onConflictDoUpdate({
        target: sessions.idHash,
        set: {
          // P1-68: el alta pega el tenant en la sesión ya persistida del login.
          tenantId: s.tenantId,
          expiraAt: new Date(s.expiraAt),
          lastSeenAt: s.lastSeenAt ? new Date(s.lastSeenAt) : null,
          ...(s.reauthAt ? { reauthAt: new Date(s.reauthAt) } : {}),
        },
      }),
  );
}

// P1-23: lee una sesión por hash para rehidratar el Map en otra instancia.
export async function leerSesionDb(idHash: string): Promise<{
  idHash: string;
  googleSub: string;
  tenantId: string | null;
  expiraAt: string;
  expiraAbsoluta?: string | undefined;
  lastSeenAt?: string | undefined;
  revocadaAt?: string | undefined;
  motivo?: string | undefined;
  reauthAt?: string | undefined;
} | null> {
  try {
    const rows = await getControlDb()
      .select()
      .from(sessions)
      .where(eq(sessions.idHash, idHash))
      .limit(1);
    const row = rows[0];
    if (!row?.googleSub) return null;
    return {
      idHash: row.idHash,
      googleSub: row.googleSub,
      tenantId: row.tenantId ?? null,
      expiraAt: row.expiraAt.toISOString(),
      ...(row.expiraAbsoluta ? { expiraAbsoluta: row.expiraAbsoluta.toISOString() } : {}),
      ...(row.lastSeenAt ? { lastSeenAt: row.lastSeenAt.toISOString() } : {}),
      ...(row.revocadaAt ? { revocadaAt: row.revocadaAt.toISOString() } : {}),
      ...(row.motivoRevocacion ? { motivo: row.motivoRevocacion } : {}),
      ...(row.reauthAt ? { reauthAt: row.reauthAt.toISOString() } : {}),
    };
  } catch {
    return null;
  }
}

export function revocarSesionDb(idHash: string, motivo: string): Promise<boolean> {
  return intentarControl((db) =>
    db.update(sessions).set({ revocadaAt: new Date(), motivoRevocacion: motivo }).where(eq(sessions.idHash, idHash)),
  );
}

export function persistirMembership(m: {
  id: string;
  tenantId: string;
  googleSub: string;
  rol: string;
  permisos: string[];
  estado: string;
  puedeUsarBot?: boolean | undefined;
}): Promise<boolean> {
  return intentarControl((db) =>
    db
      .insert(memberships)
      .values({
        id: m.id,
        tenantId: m.tenantId,
        googleSub: m.googleSub,
        rol: m.rol,
        permisos: m.permisos,
        estado: m.estado,
        ...(m.puedeUsarBot !== undefined ? { puedeUsarBot: m.puedeUsarBot } : {}),
      })
      .onConflictDoNothing({ target: memberships.id }),
  );
}

export function actualizarBotFlagDb(id: string, puedeUsarBot: boolean): Promise<boolean> {
  return intentarControl((db) =>
    db.update(memberships).set({ puedeUsarBot }).where(eq(memberships.id, id)),
  );
}

export function revocarMembershipsDb(tenantId: string, revocadoPor: string): Promise<boolean> {
  return intentarControl(async (db) => {
    const rows = await db.select({ id: memberships.id }).from(memberships).where(eq(memberships.tenantId, tenantId));
    for (const r of rows) {
      await db
        .update(memberships)
        .set({ estado: "revocado", revocadoAt: new Date(), revocadoPor })
        .where(eq(memberships.id, r.id));
    }
  });
}

export function persistirInvitacionEstado(tokenHash: string, estado: string, aceptadaPor?: string): Promise<boolean> {
  return intentarControl((db) =>
    db
      .update(invitations)
      .set({ estado, ...(aceptadaPor !== undefined ? { aceptadaPor } : {}) })
      .where(eq(invitations.tokenHash, tokenHash)),
  );
}

async function leerControl<T>(fn: (db: ControlDb) => Promise<T>): Promise<T | null> {
  try {
    return await fn(getControlDb());
  } catch {
    return null;
  }
}

export function buscarAltasPorDueno(ownerGoogleSub: string): Promise<AltaExistente[]> {
  return leerControl(async (db) => {
    const filas = await db
      .select({
        tenantId: tenants.id,
        ownerGoogleSub: tenants.ownerGoogleSub,
        nombreComercio: tenants.nombreComercio,
        requestKey: tenants.requestKey,
      })
      .from(tenants)
      .where(eq(tenants.ownerGoogleSub, ownerGoogleSub));
    return filas.map((f) => ({
      tenantId: f.tenantId,
      ownerGoogleSub: f.ownerGoogleSub ?? ownerGoogleSub,
      nombreComercio: f.nombreComercio,
      requestKey: f.requestKey ?? undefined,
    }));
  }).then((r) => r ?? []);
}

// P1-68: ids ya reclamados en control (cualquier dueño) para no reusar una
// TENANT_DATABASE_URL_<id> de otro comercio.
export function listarIdsTenantsControl(): Promise<string[]> {
  return leerControl(async (db) => {
    const filas = await db.select({ id: tenants.id }).from(tenants);
    return filas.map((f) => f.id);
  }).then((r) => r ?? []);
}

export function buscarDatabasePorTenant(tenantId: string): Promise<string | null> {
  return leerControl(async (db) => {
    const filas = await db
      .select({ database: tenantDatabases.database })
      .from(tenantDatabases)
      .where(eq(tenantDatabases.tenantId, tenantId))
      .limit(1);
    return filas[0]?.database ?? null;
  });
}

interface AltaExistente {
  tenantId: string;
  ownerGoogleSub: string;
  nombreComercio: string;
  requestKey?: string | undefined;
}

// U4: alta pendiente DB-first (tenant + catalogo + job en pendiente con ids
// explicitos de memoria). Idempotente por onConflictDoNothing; resuelve false
// sin DB o ante error y el caller sigue con memoria. El runner durable
// (src/jobs/aprovisionar.ts) reclama y converge a activo en la misma tx.
export function asegurarAltaPendiente(a: {
  id: string;
  nombreComercio: string;
  slug: string;
  plan: string;
  moneda: string;
  ownerGoogleSub: string;
  esDemo: boolean;
  rubro?: string | undefined;
  requestKey: string;
  database: string;
  jobId: string;
}): Promise<boolean> {
  const rubroDb = a.rubro ? rubroSchema.safeParse(a.rubro) : undefined;
  return intentarControl(async (db) => {
    await db
      .insert(tenants)
      .values({
        id: a.id,
        nombreComercio: a.nombreComercio,
        slug: a.slug,
        estado: "pendiente",
        plan: a.plan,
        moneda: a.moneda,
        ownerGoogleSub: a.ownerGoogleSub,
        esDemo: a.esDemo,
        requestKey: a.requestKey,
        ...(rubroDb?.success ? { rubro: rubroDb.data } : {}),
      })
      .onConflictDoNothing();
    await db
      .insert(tenantDatabases)
      .values({ tenantId: a.id, database: a.database, estado: "pendiente" })
      .onConflictDoNothing();
    await db
      .insert(provisionJobs)
      .values({ id: a.jobId, tenantId: a.id, estado: "pendiente", requestKey: a.requestKey })
      .onConflictDoNothing({ target: provisionJobs.id });
  });
}

export function persistirPurgaDemo(tenantId: string): Promise<boolean> {
  return intentarControl((db) =>
    db.update(tenants).set({ estado: "baja" }).where(eq(tenants.id, tenantId)),
  );
}

export function persistirPinDispositivo(p: { deviceCode: string; pinHash: string; bloqueado: boolean }): Promise<boolean> {
  return intentarControl((db) =>
    db
      .insert(devicePins)
      .values(filaConTenant({ deviceCode: p.deviceCode, pinHash: p.pinHash, bloqueado: p.bloqueado, actualizadoEn: new Date() }))
      .onConflictDoUpdate({
        target: devicePins.deviceCode,
        set: { pinHash: p.pinHash, bloqueado: p.bloqueado, actualizadoEn: new Date() },
      }),
  );
}
export function persistirAuthEvent(e: {
  tenantId: string | null;
  tipo: string;
  actor?: string | undefined;
  detalle?: AuthEventDetalle | null | undefined;
}): Promise<boolean> {
  return intentarControl((db) =>
    db.insert(authEvents).values({ tenantId: e.tenantId, tipo: e.tipo, actor: e.actor ?? null, detalle: e.detalle ?? null }),
  );
}

export function persistirCodigoWhatsapp(c: {
  numeroE164: string;
  codigoHash: string;
  metodo: string;
  expiraEn: Date;
}): Promise<boolean> {
  return intentarControl((db) => db.insert(whatsappCodes).values({ numeroE164: c.numeroE164, codigoHash: c.codigoHash, metodo: c.metodo, expiraEn: c.expiraEn }));
}

export function persistirBotLink(l: { tenantId: string; googleSub: string; numero: string; estado: string }): Promise<boolean> {
  return intentarControl(async (db) => {
    const rows = await db.select({ id: whatsappIdentities.id }).from(whatsappIdentities).where(eq(whatsappIdentities.numero, l.numero));
    if (rows.length > 0) {
      for (const r of rows) {
        await db.update(whatsappIdentities).set({ estado: l.estado }).where(eq(whatsappIdentities.id, r.id));
      }
      return;
    }
    await db.insert(whatsappIdentities).values({ tenantId: l.tenantId, googleSub: l.googleSub, numero: l.numero, estado: l.estado });
  });
}

// SYNC-S3/S5/S6 (PRD-SYNC-01): copia durable best-effort del heartbeat, el
// registro de devices y los grants. Memoria sigue mandando; sin env/tabla la
// promesa resuelve false y el flujo continúa.
export function persistirDeviceSync(d: {
  deviceCode: string;
  tenantId?: string | null;
  ultimaVistaEn: string;
  pendientes: number;
  ultimaOpHlc?: string | null;
}): Promise<boolean> {
  return intentarControl((db) =>
    db
      .insert(deviceSyncState)
      .values({
        deviceCode: d.deviceCode,
        tenantId: d.tenantId ?? null,
        ultimaVistaEn: new Date(d.ultimaVistaEn),
        pendientes: d.pendientes,
        ultimaOpHlc: d.ultimaOpHlc ?? null,
        actualizadoEn: new Date(),
      })
      .onConflictDoUpdate({
        target: deviceSyncState.deviceCode,
        set: {
          ultimaVistaEn: new Date(d.ultimaVistaEn),
          pendientes: d.pendientes,
          ultimaOpHlc: d.ultimaOpHlc ?? null,
          actualizadoEn: new Date(),
        },
      }),
  );
}

export function persistirOfflineGrant(g: {
  grantId: string;
  tokenHash: string;
  tenantId: string;
  googleSub: string;
  deviceCode: string;
  alcance: string;
  expiraEn: string;
}): Promise<boolean> {
  return intentarControl((db) =>
    db
      .insert(offlineGrants)
      .values({
        grantId: g.grantId,
        tokenHash: g.tokenHash,
        tenantId: g.tenantId,
        googleSub: g.googleSub,
        deviceCode: g.deviceCode,
        alcance: g.alcance,
        expiraEn: new Date(g.expiraEn),
      })
      .onConflictDoNothing(),
  );
}

export function revocarOfflineGrantDb(grantId: string): Promise<boolean> {
  return intentarControl((db) =>
    db.update(offlineGrants).set({ revocadoEn: new Date() }).where(eq(offlineGrants.grantId, grantId)),
  );
}

// PERS-S2 (PRD-PERS-01): copia durable best-effort del push (outbox + mapping).
// Memoria (`store.outbox`) sigue mandando; sin env/tabla resuelve false.
export function persistirOutboxOp(o: {
  opId: string;
  deviceCode: string;
  deviceSeq: number;
  hlc: string;
  modulo: string;
  payload: OutboxPayload;
}): Promise<boolean> {
  return intentarControl((db) =>
    db
      .insert(outbox)
      .values(
        filaConTenant({
          opId: o.opId,
          deviceCode: o.deviceCode,
          deviceSeq: o.deviceSeq,
          hlc: o.hlc,
          modulo: o.modulo,
          payload: o.payload,
        }),
      )
      .onConflictDoNothing(),
  );
}

export function persistirIdMapping(m: { opId: string; idProvisorio: string; idDefinitivo: string }): Promise<boolean> {
  return intentarControl((db) =>
    db
      .insert(idMappings)
      .values(
        filaConTenant({
          opId: m.opId,
          idProvisorio: m.idProvisorio,
          idDefinitivo: m.idDefinitivo,
        }),
      )
      .onConflictDoNothing(),
  );
}
