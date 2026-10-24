import type { APIRoute } from "astro";
import { z } from "zod";
import { guardarWizardEstado, leerWizard } from "../../../../lib/repos/fiscal.js";
import { enriquecer_vista_wizard, revocar_delegacion_en_comercio, wizard_inicial } from "../../../../modules/fiscal/wizard.js";
import { esModoMulti, tenantActual } from "../../../../lib/tenant-mode.js";

export const prerender = false;

const E5 = "No tenés permiso para ver este comercio.";

const schema = z.object({ tenant_id: z.string().min(1).max(128).optional() });

// POST /api/fiscal/delegacion/revocada — revocación detectada en ARCA (FE-S6): pausa cola + aviso.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let tenantId: string;
  if (esModoMulti()) {
    const ctx = tenantActual();
    const pedido = parsed.data.tenant_id;
    if (!ctx || (pedido !== undefined && pedido !== ctx)) {
      return Response.json({ error: E5 }, { status: 403 });
    }
    tenantId = ctx;
  } else {
    if (!parsed.data.tenant_id) return Response.json({ error: "falta tenant_id" }, { status: 422 });
    tenantId = parsed.data.tenant_id;
  }
  const cur = await leerWizard(tenantId);
  const { wizard, aviso } = revocar_delegacion_en_comercio({ ...wizard_inicial(), ...cur }, tenantId);
  await guardarWizardEstado(tenantId, wizard);
  const vista = enriquecer_vista_wizard(tenantId, wizard);
  return Response.json({ aviso, vista, estado_enlace: vista.estado_enlace }, { status: 200 });
};
