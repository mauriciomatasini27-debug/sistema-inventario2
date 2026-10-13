import type { APIRoute } from "astro";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { control } from "../../../../lib/store.js";
import { adminStore } from "../../../../lib/admin-store.js";
import { persistirActoAdmin, persistirHealthAdmin } from "../../../../lib/admin-db.js";
import { consumir_senal } from "../../../../modules/admin/senales.js";
import { registrar_acto } from "../../../../modules/admin/actos.js";
import { ultimoHashAdmin } from "../../../../lib/admin-store.js";
import { getControlDb } from "../../../../lib/db.js";
import { opsSignalsOutbox } from "../../../../db/schema.js";
import { exigirAdmin } from "../_guard.js";

export const prerender = false;

// POST /api/admin/senales/consumir — drena ops_signals_outbox (PA4).
// Job (X-Job-Secret, bypass en middleware) o admin manual. Con control viva
// drena por reclamo: reclama pendientes en una tx, procesa y confirma
// consumida. Una caída a mitad de camino deja reclamadas que el próximo
// consumo reanuda (nunca splice destructivo). Sin DB drena memoria.
export const POST: APIRoute = async ({ request }) => {
  const admin = exigirAdmin(request);
  if (admin instanceof Response) return admin;
  const actor = admin.googleSub;
  const worker = `senales-${process.pid}`;
  const ahora = new Date().toISOString();

  let consumidas = 0;
  let descartadas = 0;
  const cuenta = (ok: boolean) => {
    if (ok) consumidas += 1;
    else descartadas += 1;
  };

  if (process.env.CONTROL_DATABASE_URL) {
    const lote = await reclamarSenales(worker);
    for (const s of lote) {
      cuenta(procesarSenal({ id: `db:${s.id}`, tipo: s.tipo, payload: s.payload }, actor, ahora));
    }
    await confirmarSenales(
      worker,
      lote.map((s) => s.id),
    );
    if (lote.length > 0) {
      const listas = new Set(lote.map((s) => `${s.tipo}|${payloadTenant(s.payload) ?? ""}`));
      control.opsOutbox = control.opsOutbox.filter(
        (s) => !listas.has(`${s.tipo}|${payloadTenant(s.payload) ?? ""}`),
      );
    }
  }

  const pendientes = control.opsOutbox.splice(0, control.opsOutbox.length);

  pendientes.forEach((s, i) => {
    cuenta(procesarSenal({ id: `memoria:${i}:${s.tipo}`, tipo: s.tipo, payload: s.payload }, actor, ahora));
  });

  return Response.json({ consumidas, descartadas }, { status: 200 });
};

function procesarSenal(s: { id: string; tipo: string; payload: unknown }, actor: string, ahora: string): boolean {
    const previa = (() => {
      const t = payloadTenant(s.payload);
      if (!t) return null;
      const row = adminStore.health.get(t);
      if (!row) return null;
      return {
        tenantsActivos: 0,
        tenantsSuspendidos: 0,
        demosPurgadas: row.demosPurgadas,
        cobrosCentavos: row.cobrosCentavos,
        ultimaSenalEn: row.ultimaSenalEn,
      };
    })();
    const r = consumir_senal({ id: s.id, tipo: s.tipo, payload: s.payload }, previa);
    const registrado = registrar_acto({
      acto: r.acto,
      actorGoogleSub: actor,
      prevHash: ultimoHashAdmin(),
      origen: "job:consumir-senales",
    });
    adminStore.actos.push({
      id: registrado.hash,
      actorGoogleSub: actor,
      actoKind: r.acto.kind,
      tenantId: "tenantId" in r.acto ? (r.acto.tenantId ?? null) : null,
      detalle: r.acto,
      prevHash: registrado.prevHash,
      hash: registrado.hash,
      origen: registrado.origen,
      creadoEn: registrado.creadoEn,
    });
    void persistirActoAdmin({
      actorGoogleSub: actor,
      actoKind: r.acto.kind,
      tenantId: "tenantId" in r.acto ? (r.acto.tenantId ?? null) : null,
      detalle: r.acto,
      prevHash: registrado.prevHash,
      hash: registrado.hash,
      origen: registrado.origen,
    });
    if (!r.consumida) {
      return false;
    }
    const tenantId = payloadTenant(s.payload);
    if (tenantId) {
      const t = control.tenants.get(tenantId);
      const row = {
        tenantId,
        plan: t?.plan ?? "base",
        estadoVisto: t?.estado ?? "activo",
        ticketsHoy: r.salud.tenantsActivos,
        demosPurgadas: r.salud.demosPurgadas,
        cobrosCentavos: r.salud.cobrosCentavos,
        ultimaSenalEn: r.salud.ultimaSenalEn,
        actualizadoEn: ahora,
      };
      adminStore.health.set(tenantId, row);
      void persistirHealthAdmin({
        tenantId: row.tenantId,
        plan: row.plan,
        estadoVisto: row.estadoVisto,
        ticketsHoy: row.ticketsHoy,
        demosPurgadas: row.demosPurgadas,
        cobrosCentavos: row.cobrosCentavos,
        ultimaSenalEn: row.ultimaSenalEn,
      });
    }
  return true;
}

interface FilaSenal {
  id: string;
  tipo: string;
  payload: unknown;
}

async function reclamarSenales(worker: string): Promise<FilaSenal[]> {
  try {
    const db = getControlDb();
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('senales'))`);
      const filas = await tx
        .select({ id: opsSignalsOutbox.id, tipo: opsSignalsOutbox.tipo, payload: opsSignalsOutbox.payload })
        .from(opsSignalsOutbox)
        .where(or(eq(opsSignalsOutbox.estado, "pendiente"), eq(opsSignalsOutbox.estado, "reclamada")));
      if (filas.length === 0) return [];
      await tx
        .update(opsSignalsOutbox)
        .set({ estado: "reclamada", claimedAt: new Date(), claimedBy: worker })
        .where(
          and(
            inArray(
              opsSignalsOutbox.id,
              filas.map((f) => f.id),
            ),
            or(eq(opsSignalsOutbox.estado, "pendiente"), eq(opsSignalsOutbox.estado, "reclamada")),
          ),
        );
      return filas.map((f) => ({ id: f.id, tipo: f.tipo, payload: f.payload as unknown }));
    });
  } catch {
    return [];
  }
}

async function confirmarSenales(worker: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = getControlDb();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('senales'))`);
      await tx
        .update(opsSignalsOutbox)
        .set({ estado: "consumida" })
        .where(and(inArray(opsSignalsOutbox.id, ids), eq(opsSignalsOutbox.claimedBy, worker)));
    });
  } catch {
    /* la próxima vuelta reanuda las reclamadas */
  }
}

function payloadTenant(payload: unknown): string | null {
  if (payload !== null && typeof payload === "object" && "tenant_id" in payload) {
    const v = (payload as Record<string, unknown>)["tenant_id"];
    return typeof v === "string" && v ? v : null;
  }
  if (payload !== null && typeof payload === "object" && "tenantId" in payload) {
    const v = (payload as Record<string, unknown>)["tenantId"];
    return typeof v === "string" && v ? v : null;
  }
  return null;
}
