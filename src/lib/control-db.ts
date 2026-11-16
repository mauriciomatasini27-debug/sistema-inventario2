import { and, eq, isNull } from "drizzle-orm";
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
import { normalizarEmail } from "../modules/auth/oidc.js";
import type { EfectoInvitacion } from "../modules/tenants/invitar-empleado.js";
import type { RegistroInvitacion } from "../modules/tenants/invitaciones.js";
import { control, type ControlInvitation, type ControlTenant } from "./store.js";
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

export function insertarInvitacionControl(registro: RegistroInvitacion): Promise<boolean> {
  return intentarControl((db) =>
    db
      .insert(invitations)
      .values({
        tokenHash: registro.tokenHash,
        tenantId: registro.tenantId,
        email: registro.email,
        rol: registro.rol,
        permisos: registro.permisos,
        estado: registro.estado,
        expiraAt: new Date(registro.expiraAt),
        creadaPor: registro.creadaPor ?? null,
      })
      .onConflictDoNothing({ target: invitations.tokenHash }),
  );
}

const ESTADOS_INVITACION = new Set(["pendiente", "aceptada", "vencida", "cancelada"]);

function estadoInvitacion(valor: string): ControlInvitation["estado"] | null {
  return ESTADOS_INVITACION.has(valor) ? (valor as ControlInvitation["estado"]) : null;
}

function hayPendienteVigente(tenantId: string, email: string, ahora: Date): boolean {
  const buscado = normalizarEmail(email);
  for (const inv of control.invitations.values()) {
    if (inv.tenantId !== tenantId || normalizarEmail(inv.email) !== buscado) continue;
    if (inv.estado === "pendiente" && new Date(inv.expiraAt).getTime() > ahora.getTime()) return true;
  }
  return false;
}

// P1-88: el mapa es lo que lee el accept. Si la copia durable falla, el mapa
// queda escrito: intentarControl no lanza y la memoria sigue siendo la fuente.
export async function aplicarEfectoInvitacion(efecto: EfectoInvitacion): Promise<"ok" | "carrera"> {
  const ahora = new Date();
  if (efecto.entrega === "nueva" && hayPendienteVigente(efecto.insertar.tenantId, efecto.insertar.email, ahora)) {
    return "carrera";
  }
  for (const hash of efecto.cancelarHashes) {
    const fila = control.invitations.get(hash);
    if (fila) fila.estado = "cancelada";
  }
  control.invitations.set(efecto.insertar.tokenHash, {
    tokenHash: efecto.insertar.tokenHash,
    tenantId: efecto.insertar.tenantId,
    email: efecto.insertar.email,
    rol: efecto.insertar.rol,
    permisos: [...efecto.insertar.permisos],
    estado: efecto.insertar.estado,
    expiraAt: efecto.insertar.expiraAt,
    ...(efecto.insertar.creadaPor !== undefined ? { creadaPor: efecto.insertar.creadaPor } : {}),
    ...(efecto.insertar.aceptadaPor !== undefined ? { aceptadaPor: efecto.insertar.aceptadaPor } : {}),
  });
  await insertarInvitacionControl(efecto.insertar);
  for (const hash of efecto.cancelarHashes) {
    await persistirInvitacionEstado(hash, "cancelada");
  }
  return "ok";
}

export async function leerInvitacionPorHash(tokenHash: string): Promise<ControlInvitation | null> {
  const previa = control.invitations.get(tokenHash);
  if (previa) return previa;
  const filas = await leerControl((db) =>
    db.select().from(invitations).where(eq(invitations.tokenHash, tokenHash)).limit(1),
  );
  const row = filas?.[0];
  if (!row?.tenantId) return null;
  const estado = estadoInvitacion(row.estado);
  const rol = row.rol === "dueno" || row.rol === "empleado" ? row.rol : null;
  if (!estado || !rol) return null;
  const inv: ControlInvitation = {
    tokenHash: row.tokenHash,
    tenantId: row.tenantId,
    email: row.email,
    rol,
    permisos: Array.isArray(row.permisos) ? row.permisos.filter((p): p is string => typeof p === "string") : [],
    estado,
    expiraAt: row.expiraAt.toISOString(),
    ...(row.creadaPor ? { creadaPor: row.creadaPor } : {}),
    ...(row.aceptadaPor ? { aceptadaPor: row.aceptadaPor } : {}),
  };
  control.invitations.set(inv.tokenHash, inv);
  return inv;
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

type FilaTenantControl = {
  id: string;
  nombreComercio: string;
  slug: string;
  estado: string;
  plan: string;
  moneda: string;
  ownerGoogleSub: string | null;
  esDemo: boolean;
  rubro: string | null;
  trialHasta: Date | null;
};

// P1-87: la fila de DB pisa estado/plan/slug/nombre/trial/demo/rubro/dueño.
// Una entrada que la DB no devolvió se queda: el Map también tiene altas solo-memoria.
function fusionarFilasTenantsControl(filas: readonly FilaTenantControl[]): number {
  for (const f of filas) {
    const previo = control.tenants.get(f.id);
    const trial = f.trialHasta ? f.trialHasta.toISOString() : undefined;
    const rubroOk = f.rubro ? rubroSchema.safeParse(f.rubro) : null;
    const desdeDb = {
      nombreComercio: f.nombreComercio,
      slug: f.slug,
      estado: f.estado,
      plan: f.plan,
      esDemo: f.esDemo,
      ownerGoogleSub: f.ownerGoogleSub ?? "",
      ...(rubroOk?.success ? { rubro: rubroOk.data } : {}),
      ...(trial ? { trialHasta: trial } : {}),
    };
    if (!previo) {
      control.tenants.set(f.id, { id: f.id, moneda: f.moneda || "ARS", ...desdeDb });
      continue;
    }
    const siguiente: ControlTenant = { ...previo, ...desdeDb };
    if (!rubroOk?.success) delete siguiente.rubro;
    if (!trial) delete siguiente.trialHasta;
    control.tenants.set(f.id, siguiente);
  }
  return filas.length;
}

// P1-87: el allowlist admin no tiene membership, así que el cold start no ve
// tenants. Este vuelco best-effort llena el Map; sin URL o si la lectura falla, devuelve 0.
export async function listarYSincronizarTenantsControl(): Promise<number> {
  const filas = await leerControl((db) =>
    db
      .select({
        id: tenants.id,
        nombreComercio: tenants.nombreComercio,
        slug: tenants.slug,
        estado: tenants.estado,
        plan: tenants.plan,
        moneda: tenants.moneda,
        ownerGoogleSub: tenants.ownerGoogleSub,
        esDemo: tenants.esDemo,
        rubro: tenants.rubro,
        trialHasta: tenants.trialHasta,
      })
      .from(tenants),
  );
  if (!filas) return 0;
  return fusionarFilasTenantsControl(filas);
}

// P1-87: el POST ya cambió el Map; esto deja el mismo estado en la tabla tenants.
export function persistirEstadoTenant(tenantId: string, estado: "activo" | "suspendido"): Promise<boolean> {
  return intentarControl((db) =>
    db.update(tenants).set({ estado }).where(eq(tenants.id, tenantId)),
  );
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
    // P1-79: reintento idempotente del alta; no pisa rubro ya persistido.
    if (rubroDb?.success) {
      await db
        .update(tenants)
        .set({ rubro: rubroDb.data })
        .where(and(eq(tenants.id, a.id), isNull(tenants.rubro)));
    }
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
