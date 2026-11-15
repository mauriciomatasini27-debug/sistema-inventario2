import type { APIRoute } from "astro";
import { control } from "../../../../lib/store.js";
import { adminStore } from "../../../../lib/admin-store.js";
import { auditar, exigirAdminListo, leerJson } from "../_guard.js";
import { jsonError } from "../../../../lib/control.js";
import { evaluar_mora } from "../../../../modules/admin/mora.js";

export const prerender = false;

// POST /api/admin/mora/evaluar — dry-run PA7 (no emite eventos, no muta).
// Cobranza automática (cargos/MP webhook) vive en fase 2; hoy el panel opera
// en manual MVP: el operador informa días de atraso y saldo deudor.
export const POST: APIRoute = async ({ request }) => {
  const admin = await exigirAdminListo(request);
  if (admin instanceof Response) return admin;

  const parsed = await leerJson(request);
  if (parsed instanceof Response) return parsed;
  const lista = Array.isArray(parsed["evaluaciones"])
    ? (parsed["evaluaciones"] as Array<Record<string, unknown>>)
    : [parsed];
  if (lista.length === 0 || lista.length > 100) return jsonError("Entre 1 y 100 evaluaciones.", 422);

  const decisiones = [];
  for (const e of lista) {
    const tenantId = typeof e["tenant_id"] === "string" ? e["tenant_id"] : "";
    const tenant = control.tenants.get(tenantId);
    if (!tenant) return jsonError("No tenés permiso para ver el panel.", 403);
    const dias = Number(e["dias_atraso"] ?? 0);
    const saldoRaw = e["saldo_deudor_centavos"];
    if (!Number.isInteger(dias) || dias < 0) return jsonError("dias_atraso inválido.", 422);
    let saldo: bigint;
    try {
      saldo = BigInt(typeof saldoRaw === "string" ? saldoRaw : String(saldoRaw ?? "0"));
    } catch {
      return jsonError("saldo_deudor_centavos inválido.", 422);
    }
    if (saldo < 0n) return jsonError("saldo_deudor_centavos inválido.", 422);
    const policy = adminStore.policies.get(tenant.plan) ?? {
      plan: tenant.plan,
      diasGracia: 14,
      diasASuspension: 15,
      diasABaja: 45,
      activa: true,
    };
    const r = evaluar_mora(
      { tenantId, diasAtraso: dias, saldoDeudorCentavos: saldo, ultimaEvaluacionEn: null },
      policy,
      tenant.estado === "suspendido",
    );
    decisiones.push({ tenant_id: tenantId, estado_actual: tenant.estado, ...r });
  }

  auditar(
    { kind: "mora_evaluada", tenantId: decisiones[0]?.tenant_id ?? "", resultado: `${decisiones.length} evaluadas` },
    admin.googleSub,
    "panel",
  );
  return Response.json({ decisiones }, { status: 200 });
};
