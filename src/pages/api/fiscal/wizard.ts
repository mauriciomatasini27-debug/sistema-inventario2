import type { APIRoute } from "astro";
import { z } from "zod";
import { guardarWizardEstado, leerWizard } from "../../../lib/repos/fiscal.js";
import { esModoMulti, tenantActual, tenantPorDefecto } from "../../../lib/tenant-mode.js";
import {
  elegir_modo_primera_factura,
  enriquecer_vista_wizard,
  wizard_avanzar,
  wizard_inicial,
  wizard_pausar,
  wizard_resumir,
  type ModoPrimeraFactura,
} from "../../../modules/fiscal/wizard.js";

const E5 = "No tenés permiso para ver este comercio.";

const wizardBodySchema = z.object({
  tenant_id: z.string().min(1).max(128).optional(),
  accion: z.enum(["avanzar", "pausar", "resumir", "primera_factura"]),
  paso: z.number().int().min(0).max(6).optional(),
  modo_primera_factura: z.enum(["cae", "prueba_nc"]).optional(),
});

// En multi el tenant lo fija el servidor por request; el pedido distinto se corta.
function tenantFiscal(pedido?: string): { ok: true; tenantId: string } | { ok: false; respuesta: Response } {
  const ctx = tenantActual();
  if (!ctx || (pedido !== undefined && pedido !== ctx)) {
    return { ok: false, respuesta: Response.json({ error: E5 }, { status: 403 }) };
  }
  return { ok: true, tenantId: ctx };
}

export const prerender = false;

// Wizard fiscal pasos 0-6 con pausa (FE-S4). Tenant en body (slice homo).
// PERS2-S9: el repo fiscal lee y guarda fiscal_wizard del tenant.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = wizardBodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let tenantId: string;
  if (esModoMulti()) {
    const t = tenantFiscal(parsed.data.tenant_id);
    if (!t.ok) return t.respuesta;
    tenantId = t.tenantId;
  } else {
    tenantId = parsed.data.tenant_id ?? tenantActual() ?? tenantPorDefecto();
  }
  const b = parsed.data;
  const cur = await leerWizard(tenantId);
  let next = cur;
  if (b.accion === "avanzar" && b.paso !== undefined) next = { ...wizard_avanzar({ ...wizard_inicial(), ...cur }, b.paso) };
  else if (b.accion === "pausar") next = { ...wizard_pausar({ ...wizard_inicial(), ...cur }) };
  else if (b.accion === "resumir") next = { ...wizard_resumir({ ...wizard_inicial(), ...cur }) };
  else if (b.accion === "primera_factura") {
    const modo = (b as { modo_primera_factura?: ModoPrimeraFactura }).modo_primera_factura;
    if (!modo) return Response.json({ error: "falta modo_primera_factura" }, { status: 422 });
    if (next.delegacion !== "activa") {
      return Response.json({ error: "delegacion_no_activa" }, { status: 422 });
    }
    elegir_modo_primera_factura(tenantId, modo);
    next = { ...next, modoPrimeraFactura: modo };
  }
  const final = await guardarWizardEstado(tenantId, next);
  return Response.json(enriquecer_vista_wizard(tenantId, final), { status: 200 });
};

export const GET: APIRoute = async ({ url }) => {
  const pedido = url.searchParams.get("tenant_id");
  if (!esModoMulti()) {
    const tenantId = pedido ?? tenantActual() ?? tenantPorDefecto();
    const w = await leerWizard(tenantId);
    return Response.json(enriquecer_vista_wizard(tenantId, w), { status: 200 });
  }
  const t = tenantFiscal(pedido ?? undefined);
  if (!t.ok) return t.respuesta;
  const w = await leerWizard(t.tenantId);
  return Response.json(enriquecer_vista_wizard(t.tenantId, w), { status: 200 });
};
