import type { APIRoute } from "astro";
import { z } from "zod";
import { guardarWizardEstado, leerWizard } from "../../../../lib/repos/fiscal.js";
import { leerCadenaFiscal } from "../../../../modules/fiscal/version-settings.js";
import { crear_arca_provider, crear_arca_provider_desde_env } from "../../../../modules/fiscal/arca-provider.js";
import { crear_homo_fake } from "../../../../modules/fiscal/homo-fake.js";
import {
  completar_tarea_proveedor_y_probar,
  enriquecer_vista_wizard,
  reanudar_cola_fiscal,
  wizard_inicial,
} from "../../../../modules/fiscal/wizard.js";
import { probar_delegacion } from "../../../../modules/fiscal/wsfe.js";
import { esModoMulti, tenantActual } from "../../../../lib/tenant-mode.js";

export const prerender = false;

const E5 = "No tenés permiso para ver este comercio.";

const schema = z.object({
  tenant_id: z.string().min(1).max(128).optional(),
  cuit: z.string().min(11).max(14),
  pto_vta: z.number().int().min(1).max(99999).optional(),
  cbte_tipo: z.number().int().min(1).max(99).optional(),
});

// POST /api/fiscal/delegacion/proveedor-completo — Control Plane marca la tarea y corre la prueba técnica (FE-S5).
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
  const cuit = parsed.data.cuit.replace(/\D/g, "");
  const cadena = leerCadenaFiscal(tenantId);
  const vigente = cadena.versiones[cadena.versiones.length - 1]?.ficha;
  const ptoVta = parsed.data.pto_vta ?? Number(vigente?.pto_vta ?? "3");
  const cbteTipo = parsed.data.cbte_tipo ?? 11;
  const cur = await leerWizard(tenantId);
  const base = { ...wizard_inicial(), ...cur };
  const cfg = crear_arca_provider_desde_env(process.env);
  const provider = cfg ? crear_arca_provider(cfg) : crear_homo_fake();
  const ta = await provider.get_ta();
  const { wizard, prueba } = await completar_tarea_proveedor_y_probar(base, probar_delegacion, {
    ambiente: "homo",
    auth: { ...ta, cuit },
    ptoVta,
    cbteTipo,
  });
  if (prueba.ok) reanudar_cola_fiscal(tenantId);
  await guardarWizardEstado(tenantId, wizard);
  const vista = enriquecer_vista_wizard(tenantId, wizard, prueba.motivo);
  return Response.json({ prueba, vista }, { status: prueba.ok ? 200 : 422 });
};
