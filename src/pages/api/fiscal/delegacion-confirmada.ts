import type { APIRoute } from "astro";
import { z } from "zod";
import { store } from "../../../lib/store.js";
import { dbViva, guardarWizard, leerWizardPorTenant } from "../../../lib/fiscal-db.js";
import { confirmar_delegacion, wizard_inicial } from "../../../modules/fiscal/wizard.js";

export const prerender = false;

const schema = z.object({ tenant_id: z.string().min(1).max(128), cuit: z.string().min(11).max(14) });

// POST /api/fiscal/delegacion/confirmada (Ya lo hice) → pendiente_proveedor + tarea fiscal.
// La tarea vive en fiscal_jobs con clave texto, nunca en la cola de
// aprovisionamiento (control.jobs es solo provision). Clave estable ante
// reintento; sin DB resuelve igual con la clave derivada.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const db = dbViva();
  const cur = store.fiscalWizard.get(b.tenant_id) ?? (db ? await leerWizardPorTenant(db, b.tenant_id) : null) ?? { ...wizard_inicial() };
  const next = { ...confirmar_delegacion({ ...wizard_inicial(), ...cur }) };
  const guardado = await guardarWizard(db, b.tenant_id, next);
  store.fiscalWizard.set(b.tenant_id, guardado ?? next);
  const clave = `delegacion:${b.tenant_id}:${b.cuit}`;
  try {
    if (process.env.CONTROL_DATABASE_URL) {
      const { getControlDb } = await import("../../../lib/db.js");
      const { fiscalJobs } = await import("../../../db/schema.js");
      await getControlDb().insert(fiscalJobs).values({ clave, tenantId: b.tenant_id }).onConflictDoNothing();
    }
  } catch {
    /* sin control viva la clave derivada manda */
  }
  return Response.json({ delegacion: "pendiente_proveedor", tarea: clave }, { status: 201 });
};
