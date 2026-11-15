import type { APIRoute } from "astro";
import { control } from "../../../../lib/store.js";
import { adminStore } from "../../../../lib/admin-store.js";
import { persistirAsientoAdmin, persistirEventoVidaAdmin } from "../../../../lib/admin-db.js";
import { auditar, exigirAdminListo, exigirConfirmacion, leerJson } from "../_guard.js";
import { jsonError } from "../../../../lib/control.js";
import { asentar_cobro } from "../../../../modules/admin/ledger.js";
import { aplicar_evento_vida } from "../../../../modules/admin/mora.js";

export const prerender = false;

// POST /api/admin/mora/regularizar — asienta cobro + lifecycle a activo en
// una sola operación admin (PA6/PA7). Idempotente por idempotency_key del cobro.
export const POST: APIRoute = async ({ request }) => {
  const admin = await exigirAdminListo(request);
  if (admin instanceof Response) return admin;

  const parsed = await leerJson(request);
  if (parsed instanceof Response) return parsed;
  const tenantId = typeof parsed["tenant_id"] === "string" ? parsed["tenant_id"] : "";
  const tenant = control.tenants.get(tenantId);
  if (!tenant) return jsonError("No tenés permiso para ver el panel.", 403);
  const conf = exigirConfirmacion(parsed, tenantId);
  if (conf instanceof Response) return conf;

  const cobro = parsed["cobro"] as Record<string, unknown> | undefined;
  if (!cobro) return jsonError("Falta el cobro a asentar.", 422);
  let monto: bigint;
  try {
    const raw = cobro["monto_centavos"];
    monto = BigInt(typeof raw === "string" ? raw : String(raw ?? ""));
  } catch {
    return jsonError("monto_centavos inválido.", 422);
  }
  const r = asentar_cobro({
    input: {
      tenantId,
      montoCentavos: monto,
      medio: typeof cobro["medio"] === "string" ? cobro["medio"] : "",
      referenciaExterna: typeof cobro["referencia_externa"] === "string" ? cobro["referencia_externa"] : "",
      idempotencyKey: typeof cobro["idempotency_key"] === "string" ? cobro["idempotency_key"] : "",
    },
    creadoPor: admin.googleSub,
    vistos: new Set([...adminStore.asientos.values()].map((a) => a.idempotencyKey)),
  });
  if (!r.ok) return jsonError(r.error, r.status);
  adminStore.asientos.set(r.asiento.id, { ...r.asiento, creadoEn: r.asiento.creadoEn });
  void persistirAsientoAdmin({
    tenantId,
    montoCentavos: r.asiento.montoCentavos,
    medio: r.asiento.medio,
    referenciaExterna: r.asiento.referenciaExterna,
    idempotencyKey: r.asiento.idempotencyKey,
    creadoPor: admin.googleSub,
  });

  const idemKey = `regularizar:${tenantId}:${r.asiento.idempotencyKey}`;
  const deEstado = tenant.estado;
  const aEstado = aplicar_evento_vida(deEstado, "activo");
  tenant.estado = aEstado;
  adminStore.eventosVida.push({
    id: `evt:${idemKey}`,
    tenantId,
    deEstado,
    aEstado,
    motivo: conf.motivo,
    actor: `panel:${admin.googleSub}`,
    idempotencyKey: idemKey,
    creadoEn: new Date().toISOString(),
  });
  void persistirEventoVidaAdmin({
    tenantId,
    deEstado,
    aEstado,
    motivo: conf.motivo,
    actor: `panel:${admin.googleSub}`,
    idempotencyKey: idemKey,
  });
  auditar(
    { kind: "regularizacion_asentada", tenantId, ledgerEntryId: r.asiento.id },
    admin.googleSub,
    "panel",
  );
  return Response.json(
    {
      tenant_id: tenantId,
      estado: aEstado,
      asiento_id: r.asiento.id,
      monto_centavos: r.asiento.montoCentavos.toString(),
    },
    { status: 200 },
  );
};
