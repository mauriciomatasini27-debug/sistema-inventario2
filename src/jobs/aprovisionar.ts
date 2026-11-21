import { and, eq, sql } from "drizzle-orm";
import { control } from "../lib/store.js";
import { getControlDb } from "../lib/db.js";
import {
  memberships,
  opsSignalsOutbox,
  provisionJobs,
  tenantDatabases,
  tenants,
} from "../db/schema.js";
import {
  MAX_REINTENTOS,
  PASOS_APROVISIONAMIENTO,
  avanzarJob,
  esperaReintentoMs,
  nombreDatabase,
  trialHasta,
  type EstadoJob,
  type PasoAprovisionamiento,
} from "../modules/tenants/aprovisionar.js";


export interface ResultadoProvision {
  tenantId: string;
  estado: string;
  membershipDuenoId?: string | undefined;
}

export function encolarAprovisionamiento(tenantId: string, requestKey?: string): string {
  for (const j of control.jobs.values()) {
    if (j.tenantId === tenantId && (j.estado === "pendiente" || j.estado === "aprovisionando")) {
      return j.id;
    }
  }
  const id = crypto.randomUUID();
  control.jobs.set(id, { id, tenantId, estado: "pendiente", intentos: 0 });
  void requestKey;
  return id;
}

export async function ejecutarAprovisionamiento(jobId: string, workerId?: string): Promise<ResultadoProvision> {
  const worker = workerId ?? `prov-${process.pid}`;
  const durable = await intentarDrizzle(jobId, worker);
  if (durable) return durable;

  const job = control.jobs.get(jobId);
  if (!job) throw new Error("job inexistente");
  const tenant = control.tenants.get(job.tenantId);
  if (!tenant) throw new Error("tenant inexistente");

  const database = control.databases.get(tenant.id)?.database ?? nombreDatabase(tenant.id);
  let estado: EstadoJob = {
    estado: job.estado === "activo" ? "activo" : "aprovisionando",
    pasoActual: (job.pasoActual as PasoAprovisionamiento | null) ?? "crear_base",
    intentos: job.intentos,
  };

  for (const paso of PASOS_APROVISIONAMIENTO) {
    if (estado.pasoActual && PASOS_APROVISIONAMIENTO.indexOf(paso) < PASOS_APROVISIONAMIENTO.indexOf(estado.pasoActual)) {
      continue;
    }
    ejecutarPasoMemoria(tenant.id, database, paso, tenant.ownerGoogleSub);
    estado = avanzarJob({ ...estado, pasoActual: paso }, { tipo: "paso_ok", paso });
  }

  job.estado = estado.estado;
  job.pasoActual = estado.pasoActual ?? null;
  job.intentos = estado.intentos;
  if (estado.estado === "activo") {
    tenant.estado = "activo";
    tenant.trialHasta = trialHasta(new Date());
    control.opsOutbox.push({
      tipo: "tenant_aprovisionado",
      payload: {
        tenant_id: tenant.id,
        database,
        owner_google_sub: tenant.ownerGoogleSub,
        plan: tenant.plan,
        occurred_at: new Date().toISOString(),
      },
    });
  }
  const membership = [...control.memberships.values()].find(
    (mm) => mm.tenantId === tenant.id && mm.googleSub === tenant.ownerGoogleSub,
  );
  return { tenantId: tenant.id, estado: estado.estado, membershipDuenoId: membership?.id };
}

export function registrarFalloJob(jobId: string, paso: PasoAprovisionamiento, error: string): EstadoJob {
  const job = control.jobs.get(jobId);
  const actual: EstadoJob = {
    estado: "aprovisionando",
    pasoActual: paso,
    intentos: job?.intentos ?? 0,
  };
  const next = avanzarJob(actual, { tipo: "paso_fallo", paso, error });
  if (job) {
    job.estado = next.estado;
    job.pasoActual = next.pasoActual ?? null;
    job.intentos = next.intentos;
    job.error = next.error;
  }
  void esperaReintentoMs;
  void MAX_REINTENTOS;
  return next;
}

function ejecutarPasoMemoria(tenantId: string, database: string, paso: PasoAprovisionamiento, owner: string): void {
  if (paso === "registrar_catalogo") {
    control.databases.set(tenantId, { tenantId, database, estado: "lista", schemaVersion: "1" });
  }
  if (paso === "crear_membership_dueno") {
    const ya = [...control.memberships.values()].some(
      (mm) => mm.tenantId === tenantId && mm.googleSub === owner && mm.estado === "activo",
    );
    if (!ya) {
      const id = crypto.randomUUID();
      control.memberships.set(id, { id, tenantId, googleSub: owner, rol: "dueno", permisos: [], estado: "activo" });
    }
  }
}

async function intentarDrizzle(jobId: string, worker: string): Promise<ResultadoProvision | null> {
  if (!process.env.CONTROL_DATABASE_URL) return null;
  try {
    const db = getControlDb();
    const previas = await db.select().from(provisionJobs).where(eq(provisionJobs.id, jobId)).limit(1);
    const previa = previas[0];
    if (!previa || !previa.tenantId) return null;

    const sellado = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"provision:" + (previa.tenantId as string)}))`);
      const filas = await tx.select().from(provisionJobs).where(eq(provisionJobs.id, jobId)).limit(1);
      const job = filas[0];
      if (!job || !job.tenantId) throw new Error("job inexistente");
      const tenantId = job.tenantId as string;
      if (job.estado === "activo") {
        const tns = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        const tn = tns[0];
        if (!tn) throw new Error("tenant inexistente");
        const mbs = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.tenantId, tenantId), eq(memberships.googleSub, tn.ownerGoogleSub as string)))
          .limit(1);
        return { hecho: true, tenantId, ownerSub: tn.ownerGoogleSub as string, plan: tn.plan, membershipId: mbs[0]?.id as string | undefined };
      }
      await tx
        .update(provisionJobs)
        .set({ claimedAt: new Date(), claimedBy: worker, estado: "aprovisionando", updatedAt: new Date() })
        .where(eq(provisionJobs.id, jobId));
      const tns = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const tn = tns[0];
      if (!tn) throw new Error("tenant inexistente");
      const dbs = await tx.select().from(tenantDatabases).where(eq(tenantDatabases.tenantId, tenantId)).limit(1);
      const database = dbs[0]?.database ?? nombreDatabase(tenantId);
      const ownerSub = tn.ownerGoogleSub as string;
      let estado: EstadoJob = {
        estado: "aprovisionando",
        pasoActual: (job.pasoActual as PasoAprovisionamiento | null) ?? "crear_base",
        intentos: job.intentos ?? 0,
      };
      const trial = trialHasta(new Date());
      let membershipId: string | undefined;
      for (const paso of PASOS_APROVISIONAMIENTO) {
        if (estado.pasoActual && PASOS_APROVISIONAMIENTO.indexOf(paso) < PASOS_APROVISIONAMIENTO.indexOf(estado.pasoActual)) {
          continue;
        }
        if (paso === "registrar_catalogo") {
          await tx
            .insert(tenantDatabases)
            .values({ tenantId, database, estado: "lista", schemaVersion: "1" })
            .onConflictDoUpdate({ target: tenantDatabases.tenantId, set: { estado: "lista", schemaVersion: "1" } });
        }
        if (paso === "crear_membership_dueno") {
          const ya = await tx
            .select({ id: memberships.id })
            .from(memberships)
            .where(and(eq(memberships.tenantId, tenantId), eq(memberships.googleSub, ownerSub)))
            .limit(1);
          membershipId = ya[0]?.id as string | undefined;
          if (!membershipId) {
            membershipId = crypto.randomUUID();
            await tx
              .insert(memberships)
              .values({ id: membershipId, tenantId, googleSub: ownerSub, rol: "dueno", permisos: [], estado: "activo" })
              .onConflictDoNothing({ target: memberships.id });
          }
        }
        if (paso === "marcar_activo") {
          await tx.update(tenants).set({ estado: "activo", trialHasta: new Date(trial) }).where(eq(tenants.id, tenantId));
        }
        estado = avanzarJob({ ...estado, pasoActual: paso }, { tipo: "paso_ok", paso });
      }
      if (estado.estado === "activo") {
        await tx
          .update(provisionJobs)
          .set({ estado: "activo", pasoActual: null, intentos: 0, updatedAt: new Date() })
          .where(eq(provisionJobs.id, jobId));
        await tx.update(tenants).set({ estado: "activo", trialHasta: new Date(trial) }).where(eq(tenants.id, tenantId));
        await tx
          .insert(tenantDatabases)
          .values({ tenantId, database, estado: "lista", schemaVersion: "1" })
          .onConflictDoUpdate({ target: tenantDatabases.tenantId, set: { estado: "lista", schemaVersion: "1" } });
        if (!membershipId) {
          const ya = await tx
            .select({ id: memberships.id })
            .from(memberships)
            .where(and(eq(memberships.tenantId, tenantId), eq(memberships.googleSub, ownerSub)))
            .limit(1);
          membershipId = ya[0]?.id as string | undefined;
          if (!membershipId) {
            membershipId = crypto.randomUUID();
            await tx
              .insert(memberships)
              .values({ id: membershipId, tenantId, googleSub: ownerSub, rol: "dueno", permisos: [], estado: "activo" })
              .onConflictDoNothing({ target: memberships.id });
          }
        }
        await tx.insert(opsSignalsOutbox).values({
          tipo: "tenant_aprovisionado",
          payload: {
            tenant_id: tenantId,
            database,
            owner_google_sub: ownerSub,
            plan: tn.plan,
            occurred_at: new Date().toISOString(),
          },
        });
      }
      return { hecho: estado.estado === "activo", tenantId, database, ownerSub, plan: tn.plan, trial, membershipId };
    });

    if (sellado.hecho) {
      const mem = control.tenants.get(sellado.tenantId);
      if (!mem) {
        control.tenants.set(sellado.tenantId, {
          id: sellado.tenantId,
          nombreComercio: "",
          slug: "",
          estado: "activo",
          plan: sellado.plan,
          moneda: "ARS",
          ownerGoogleSub: sellado.ownerSub,
          esDemo: sellado.plan === "demo",
        });
      } else {
        mem.estado = "activo";
      }
      const job = control.jobs.get(jobId);
      if (job) {
        job.estado = "activo";
        job.pasoActual = null;
        job.intentos = 0;
      } else {
        control.jobs.set(jobId, { id: jobId, tenantId: sellado.tenantId, estado: "activo", intentos: 0 });
      }
      if (!("database" in sellado)) return { tenantId: sellado.tenantId, estado: "activo", membershipDuenoId: sellado.membershipId };
      const s = sellado as { tenantId: string; database: string; ownerSub: string; plan: string; trial: string; membershipId: string | undefined };
      control.databases.set(s.tenantId, { tenantId: s.tenantId, database: s.database, estado: "lista", schemaVersion: "1" });
      const t = control.tenants.get(s.tenantId);
      if (t) t.trialHasta = s.trial;
      if (s.membershipId && !control.memberships.get(s.membershipId)) {
        control.memberships.set(s.membershipId, { id: s.membershipId, tenantId: s.tenantId, googleSub: s.ownerSub, rol: "dueno", permisos: [], estado: "activo" });
      }
      control.opsOutbox.push({
        tipo: "tenant_aprovisionado",
        payload: { tenant_id: s.tenantId, database: s.database, owner_google_sub: s.ownerSub, plan: s.plan, occurred_at: new Date().toISOString() },
      });
      const membership = [...control.memberships.values()].find(
        (mm) => mm.tenantId === s.tenantId && mm.googleSub === s.ownerSub,
      );
      return { tenantId: s.tenantId, estado: "activo", membershipDuenoId: membership?.id ?? s.membershipId };
    }
    const pendiente = control.jobs.get(jobId);
    if (pendiente) {
      pendiente.estado = "aprovisionando";
    }
    const actual = await getControlDb().select().from(provisionJobs).where(eq(provisionJobs.id, jobId)).limit(1);
    return { tenantId: actual[0]?.tenantId as string, estado: (actual[0]?.estado as string) ?? "aprovisionando" };
  } catch {
    return null;
  }
}
