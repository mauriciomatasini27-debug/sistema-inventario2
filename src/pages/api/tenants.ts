import type { APIRoute } from "astro";
import { tenantSchema } from "../../lib/validation.js";
import { control } from "../../lib/store.js";
import { esSuperadmin, jsonError, resolverSesion } from "../../lib/control.js";
import { asegurarAltaPendiente, buscarAltasPorDueno, buscarDatabasePorTenant } from "../../lib/control-db.js";
import { ejecutarAprovisionamiento } from "../../jobs/aprovisionar.js";
import {
  decidirAlta,
  nombreDatabase,
  slugDeNombre,
} from "../../modules/tenants/aprovisionar.js";

export const prerender = false;

// durable (src/jobs/aprovisionar.ts): alta pendiente DB-first con espejo en
// memoria, reclamo con advisory lock y 409 por requestKey también en frío.
// La membership de Dueño se crea recién en el paso crear_membership_dueno:
// nunca activa sin base completa.
export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  if (!esSuperadmin(ctx.googleSub)) {
    return jsonError("No tenés permiso para crear comercios.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = tenantSchema.safeParse(body);
  if (!parsed.success) {
    const primero = parsed.error.issues[0];
    if (primero?.code === "invalid_value") {
      return jsonError("El plan es inválido. Usá demo, base o plus.", 422);
    }
    return jsonError(primero?.message ?? "Datos del comercio inválidos.", 422);
  }
  const b = parsed.data;
  const requestKey =
    b.request_key ?? request.headers.get("Idempotency-Key") ?? `${ctx.googleSub}:${b.nombre_comercio}`;

  const existentes = [...control.tenants.values()].map((t) => ({
    tenantId: t.id,
    ownerGoogleSub: t.ownerGoogleSub,
    nombreComercio: t.nombreComercio,
    requestKey: t.requestKey,
  }));
  const decision = decidirAlta({
    solicitud: {
      ownerGoogleSub: b.owner_google_sub,
      nombreComercio: b.nombre_comercio,
      plan: b.plan,
      requestKey,
    },
    existentes,
  });
  if (decision.accion === "reusar") {
    const t = control.tenants.get(decision.tenantId);
    return Response.json(
      { error: "Ya existe un comercio con ese nombre para este dueño.", tenant_id: decision.tenantId, database: t ? dbDe(t.id) : undefined },
      { status: 409 },
    );
  }
  if (process.env.CONTROL_DATABASE_URL) {
    const frias = await buscarAltasPorDueno(b.owner_google_sub);
    const fria = decidirAlta({
      solicitud: {
        ownerGoogleSub: b.owner_google_sub,
        nombreComercio: b.nombre_comercio,
        plan: b.plan,
        requestKey,
      },
      existentes: frias,
    });
    if (fria.accion === "reusar") {
      const t = control.tenants.get(fria.tenantId);
      const database = t ? dbDe(t.id) : await buscarDatabasePorTenant(fria.tenantId);
      return Response.json(
        { error: "Ya existe un comercio con ese nombre para este dueño.", tenant_id: fria.tenantId, database: database ?? undefined },
        { status: 409 },
      );
    }
  }

  const id = crypto.randomUUID();
  let slug = slugDeNombre(b.nombre_comercio);
  if ([...control.tenants.values()].some((t) => t.slug === slug)) slug = `${slug}-${id.slice(0, 8)}`;
  const database = nombreDatabase(id);
  control.tenants.set(id, {
    id,
    nombreComercio: b.nombre_comercio.trim(),
    slug,
    estado: "aprovisionando",
    plan: b.plan,
    moneda: b.moneda,
    ownerGoogleSub: b.owner_google_sub,
    esDemo: b.plan === "demo",
    requestKey,
  });
  control.databases.set(id, { tenantId: id, database, estado: "pendiente" });
  const jobId = crypto.randomUUID();
  control.jobs.set(jobId, { id: jobId, tenantId: id, estado: "pendiente", intentos: 0 });
  await asegurarAltaPendiente({
    id,
    nombreComercio: b.nombre_comercio.trim(),
    slug,
    plan: b.plan,
    moneda: b.moneda,
    ownerGoogleSub: b.owner_google_sub,
    esDemo: b.plan === "demo",
    requestKey,
    database,
    jobId,
  });

  const corrido = await ejecutarAprovisionamiento(jobId);
  void corrido;
  const membershipDueno = [...control.memberships.values()].find(
    (m) => m.tenantId === id && m.googleSub === b.owner_google_sub,
  );
  control.events.push({ tenantId: id, tipo: "alta_comercio", actor: ctx.googleSub });

  return Response.json(
    {
      tenant_id: id,
      database,
      membership_dueno: membershipDueno
        ? { membership_id: membershipDueno.id, tenant_id: id, rol: membershipDueno.rol }
        : null,
    },
    { status: 201 },
  );
};

function dbDe(tenantId: string): string | undefined {
  return control.databases.get(tenantId)?.database;
}
