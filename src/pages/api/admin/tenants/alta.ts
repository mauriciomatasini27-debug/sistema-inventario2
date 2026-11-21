import type { APIRoute } from "astro";
import { control } from "../../../../lib/store.js";
import { persistirAltaAdmin, insertarInvitacionControl } from "../../../../lib/control-db.js";
import { jsonError } from "../../../../lib/control.js";
import { nombreDatabase } from "../../../../modules/tenants/aprovisionar.js";
import { lanzarAprovisionamiento } from "../../../../modules/tenants/provision-admin.js";
import { auditar, exigirAdminMutante, leerJson } from "../_guard.js";
import {
  armarInvitacionDueno,
  linkInvitacion,
  ownerPendienteDe,
  slugUnico,
  validarAltaAdmin,
} from "../../../../modules/tenants/alta-admin.js";

export const prerender = false;

// POST /api/admin/tenants/alta — crea un comercio con dueño pendiente.
// El panel no pide el Google sub: deja el email y una invitación de dueño
// que se ata en el primer login con ese email.
export const POST: APIRoute = async ({ request }) => {
  const admin = await exigirAdminMutante(request);
  if (admin instanceof Response) return admin;
  const body = await leerJson(request);
  if (body instanceof Response) return body;

  const v = validarAltaAdmin(body);
  if (!v.ok) return jsonError(v.error, 422);

  const id = crypto.randomUUID();
  const slug = slugUnico(
    v.nombre,
    [...control.tenants.values()].map((t) => t.slug),
    v.slugPedido,
    id,
  );
  const ownerGoogleSub = ownerPendienteDe(v.email);
  control.tenants.set(id, {
    id,
    nombreComercio: v.nombre,
    slug,
    estado: "aprovisionando",
    plan: v.plan,
    moneda: v.moneda,
    ownerGoogleSub,
    esDemo: v.plan === "demo",
  });
  const database = nombreDatabase(id);
  control.databases.set(id, { tenantId: id, database, estado: "pendiente" });

  const inv = armarInvitacionDueno({ tenantId: id, email: v.email, creadaPor: admin.googleSub });
  control.invitations.set(inv.registro.tokenHash, { ...inv.registro });

  const jobId = crypto.randomUUID();
  const persistio =
    (await persistirAltaAdmin({
      id,
      nombreComercio: v.nombre,
      slug,
      plan: v.plan,
      moneda: v.moneda,
      esDemo: v.plan === "demo",
      jobId,
      database,
    })) && (await insertarInvitacionControl(inv.registro));
  if (!persistio && process.env.CONTROL_DATABASE_URL) {
    control.tenants.delete(id);
    control.invitations.delete(inv.registro.tokenHash);
    control.databases.delete(id);
    return jsonError("No se pudo guardar el comercio. Probá de nuevo.", 503);
  }

  control.jobs.set(jobId, { id: jobId, tenantId: id, estado: "pendiente", intentos: 0 });
  void lanzarAprovisionamiento(jobId);

  auditar({ kind: "tenant_creado", tenantId: id }, admin.googleSub, "panel");
  const origen = new URL(request.url).origin;
  const estado = control.tenants.get(id)?.estado ?? "aprovisionando";
  return Response.json(
    {
      tenant_id: id,
      slug,
      estado,
      job_id: jobId,
      email_dueno_pendiente: v.email,
      invitacion: {
        link: linkInvitacion(origen, inv.tokenPlano),
        expira_at: inv.registro.expiraAt,
      },
    },
    { status: 201 },
  );
};
