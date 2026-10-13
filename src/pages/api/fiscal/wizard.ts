import type { APIRoute } from "astro";
import { fiscalWizardSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { dbViva, guardarWizard, leerWizardPorTenant } from "../../../lib/fiscal-db.js";
import { wizard_avanzar, wizard_inicial, wizard_pausar, wizard_resumir, type DelegacionEstado } from "../../../modules/fiscal/wizard.js";

export const prerender = false;

// Wizard fiscal pasos 0-6 con pausa (FE-S4). Tenant en body (slice homo).
// PERS-S4 G2b: DB-first con espejo memoria. Sin DB el camino memoria resuelve igual.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = fiscalWizardSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const db = dbViva();
  const cur = store.fiscalWizard.get(b.tenant_id) ?? (db ? await leerWizardPorTenant(db, b.tenant_id) : null) ?? { paso: 0, delegacion: "pendiente" as DelegacionEstado, pausaEn: null };
  let next = cur;
  if (b.accion === "avanzar" && b.paso !== undefined) next = { ...wizard_avanzar({ ...wizard_inicial(), ...cur }, b.paso) };
  else if (b.accion === "pausar") next = { ...wizard_pausar({ ...wizard_inicial(), ...cur }) };
  else if (b.accion === "resumir") next = { ...wizard_resumir({ ...wizard_inicial(), ...cur }) };
  const guardado = await guardarWizard(db, b.tenant_id, next);
  const final = guardado ?? next;
  store.fiscalWizard.set(b.tenant_id, final);
  return Response.json(final, { status: 200 });
};

export const GET: APIRoute = async ({ url }) => {
  const tenant = url.searchParams.get("tenant_id") ?? "";
  if (!tenant) return Response.json({ error: "falta tenant_id" }, { status: 422 });
  const mem = store.fiscalWizard.get(tenant);
  if (mem) return Response.json(mem, { status: 200 });
  const db = dbViva();
  const frio = db ? await leerWizardPorTenant(db, tenant) : null;
  return Response.json(frio ?? { paso: 0, delegacion: "pendiente" as DelegacionEstado, pausaEn: null }, { status: 200 });
};
