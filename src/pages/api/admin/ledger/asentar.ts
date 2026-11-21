import type { APIRoute } from "astro";
import { control } from "../../../../lib/store.js";
import { adminStore } from "../../../../lib/admin-store.js";
import { persistirAsientoAdmin } from "../../../../lib/admin-db.js";
import { exigirAdminMutante, auditar, leerJson } from "../_guard.js";
import { jsonError } from "../../../../lib/control.js";
import { asentar_cobro } from "../../../../modules/admin/ledger.js";

export const prerender = false;

// POST /api/admin/ledger/asentar — cobro manual append-only (PA6).
// 409 si idempotency_key existe. Sin UPDATE/DELETE jamás.
export const POST: APIRoute = async ({ request }) => {
  const admin = await exigirAdminMutante(request);
  if (admin instanceof Response) return admin;

  const parsed = await leerJson(request);
  if (parsed instanceof Response) return parsed;
  const tenantId = typeof parsed["tenant_id"] === "string" ? parsed["tenant_id"] : "";
  if (!control.tenants.get(tenantId)) return jsonError("No tenés permiso para ver el panel.", 403);

  let monto: bigint;
  try {
    const raw = parsed["monto_centavos"];
    monto = BigInt(typeof raw === "string" ? raw : String(raw ?? ""));
  } catch {
    return jsonError("monto_centavos inválido.", 422);
  }
  const r = asentar_cobro({
    input: {
      tenantId,
      montoCentavos: monto,
      medio: typeof parsed["medio"] === "string" ? parsed["medio"] : "",
      referenciaExterna: typeof parsed["referencia_externa"] === "string" ? parsed["referencia_externa"] : "",
      idempotencyKey: typeof parsed["idempotency_key"] === "string" ? parsed["idempotency_key"] : "",
    },
    creadoPor: admin.googleSub,
    vistos: new Set([...adminStore.asientos.values()].map((a) => a.idempotencyKey)),
  });
  if (!r.ok) return jsonError(r.error, r.status);
  adminStore.asientos.set(r.asiento.id, { ...r.asiento });
  void persistirAsientoAdmin({
    tenantId,
    montoCentavos: r.asiento.montoCentavos,
    medio: r.asiento.medio,
    referenciaExterna: r.asiento.referenciaExterna,
    idempotencyKey: r.asiento.idempotencyKey,
    creadoPor: admin.googleSub,
  });
  auditar({ kind: "cobro_asentado", tenantId, ledgerEntryId: r.asiento.id }, admin.googleSub, "panel");
  return Response.json(
    { asiento_id: r.asiento.id, monto_centavos: r.asiento.montoCentavos.toString() },
    { status: 201 },
  );
};
