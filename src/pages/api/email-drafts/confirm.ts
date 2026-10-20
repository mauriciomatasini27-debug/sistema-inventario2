import type { APIRoute } from "astro";
import { z } from "zod";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { confirmarBorradorGmail } from "../../../lib/repos/gmail-borradores.js";
import { parsear_fecha_ar, parsear_monto_ar } from "../../../modules/utilities/facturas_servicios.js";

export const prerender = false;

const SIN_CACHE = { "Cache-Control": "no-store" };

const confirmarSchema = z.object({
  draft_id: z.string().min(1).max(128),
  account_id: z.string().min(1).max(128).optional(),
  monto: z.string().trim().min(1).max(30).optional(),
  vencimiento: z.string().trim().min(1).max(10).optional(),
  periodo: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422, headers: SIN_CACHE });
  }
  const parsed = confirmarSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422, headers: SIN_CACHE });
  }
  const b = parsed.data;
  let montoCentavos: bigint | undefined;
  if (b.monto !== undefined) {
    try {
      montoCentavos = parsear_monto_ar(b.monto);
    } catch {
      return Response.json(
        { error: { fieldErrors: { monto: ["Monto inválido."] } } },
        { status: 422, headers: SIN_CACHE },
      );
    }
  }
  let vencimiento: string | undefined;
  if (b.vencimiento !== undefined) {
    try {
      vencimiento = parsear_fecha_ar(b.vencimiento);
    } catch {
      return Response.json(
        { error: { fieldErrors: { vencimiento: ["Vencimiento inválido."] } } },
        { status: 422, headers: SIN_CACHE },
      );
    }
  }
  let r: Awaited<ReturnType<typeof confirmarBorradorGmail>>;
  try {
    r = await confirmarBorradorGmail({
      tenantId: dueno.tenantId,
      draftId: b.draft_id,
      ...(b.account_id !== undefined ? { accountId: b.account_id } : {}),
      ...(montoCentavos !== undefined ? { montoCentavos } : {}),
      ...(vencimiento !== undefined ? { vencimiento } : {}),
      ...(b.periodo !== undefined ? { periodo: b.periodo } : {}),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      return Response.json({ error: "base_no_disponible" }, { status: 503, headers: SIN_CACHE });
    }
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "SIN_CUENTA" || r.codigo === "CUENTA_INVALIDA") {
      return Response.json(
        { error: { fieldErrors: { account_id: [r.error] } }, codigo: r.codigo },
        { status: r.status, headers: SIN_CACHE },
      );
    }
    if (r.codigo === "FALTA_MONTO") {
      return Response.json(
        { error: { fieldErrors: { monto: [r.error] } }, codigo: r.codigo },
        { status: r.status, headers: SIN_CACHE },
      );
    }
    if (r.codigo === "FALTA_VENCIMIENTO") {
      return Response.json(
        { error: { fieldErrors: { vencimiento: [r.error] } }, codigo: r.codigo },
        { status: r.status, headers: SIN_CACHE },
      );
    }
    if (r.codigo === "NO_VALIDO") {
      return Response.json(
        { error: { formErrors: [r.error] }, codigo: r.codigo },
        { status: r.status, headers: SIN_CACHE },
      );
    }
    return Response.json({ error: r.error, codigo: r.codigo }, { status: r.status, headers: SIN_CACHE });
  }
  return Response.json(
    {
      ok: true,
      draft_id: b.draft_id,
      bill_id: r.billId,
      estado: "confirmado",
      creado: r.creado,
    },
    { status: r.creado ? 201 : 200, headers: SIN_CACHE },
  );
};
