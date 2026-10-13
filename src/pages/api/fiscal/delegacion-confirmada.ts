import type { APIRoute } from "astro";
import { z } from "zod";
import { store } from "../../../lib/store.js";
import { dbViva, guardarWizard, leerWizardPorTenant } from "../../../lib/fiscal-db.js";
import { esModoMulti, tenantActual } from "../../../lib/tenant-mode.js";
import { confirmar_delegacion, wizard_inicial } from "../../../modules/fiscal/wizard.js";

export const prerender = false;

const E5 = "No tenés permiso para ver este comercio.";

const schema = z.object({ tenant_id: z.string().min(1).max(128), cuit: z.string().min(11).max(14) });

const flexible = z.object({ tenant_id: z.string().min(1).max(128).optional(), cuit: z.string().min(11).max(14) });

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
  const parsed = (esModoMulti() ? flexible.safeParse(body) : schema.safeParse(body));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let tenantId: string;
  if (esModoMulti()) {
    const pedido = (parsed.data as { tenant_id?: string }).tenant_id;
    const ctx = tenantActual();
    if (!ctx || (pedido !== undefined && pedido !== ctx)) {
      return Response.json({ error: E5 }, { status: 403 });
    }
    tenantId = ctx;
  } else {
    tenantId = (parsed.data as { tenant_id: string }).tenant_id;
  }
  const b = parsed.data;
  const db = dbViva(tenantId);
  const cur = store.fiscalWizard.get(tenantId) ?? (db ? await leerWizardPorTenant(db, tenantId) : null) ?? { ...wizard_inicial() };
  const next = { ...confirmar_delegacion({ ...wizard_inicial(), ...cur }) };
  const guardado = await guardarWizard(db, tenantId, next);
  store.fiscalWizard.set(tenantId, guardado ?? next);
  const clave = `delegacion:${tenantId}:${b.cuit}`;
  try {
    if (process.env.CONTROL_DATABASE_URL) {
      const { getControlDb } = await import("../../../lib/db.js");
      const { fiscalJobs } = await import("../../../db/schema.js");
      await getControlDb().insert(fiscalJobs).values({ clave, tenantId }).onConflictDoNothing();
    }
  } catch {
    /* sin control viva la clave derivada manda */
  }
  return Response.json({ delegacion: "pendiente_proveedor", tarea: clave }, { status: 201 });
};
