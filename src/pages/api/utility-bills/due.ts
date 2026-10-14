import type { APIRoute } from "astro";
import { proximas_a_vencer, vencidas } from "../../../modules/utilities/facturas_servicios.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { listarFacturas } from "../../../lib/repos/servicios.js";

export const prerender = false;

// GET /api/utility-bills/due?dentro_dias=&hoy= — próximas a vencer + vencidas.
// PERS2-S16: lee via repo de servicios (DB del tenant; memoria solo en single sin base).
export const GET: APIRoute = async ({ url }) => {
  const dentroDias = Number(url.searchParams.get("dentro_dias") ?? "7");
  if (!Number.isInteger(dentroDias) || dentroDias < 0 || dentroDias > 90) {
    return Response.json({ error: "dentro_dias 0-90" }, { status: 422 });
  }
  const hoy = url.searchParams.get("hoy") ?? new Date().toISOString().slice(0, 10);
  let facturas: Awaited<ReturnType<typeof listarFacturas>>;
  try {
    facturas = await listarFacturas();
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  const prox = proximas_a_vencer(facturas, hoy, dentroDias).map((f) => ({
    bill_id: f.id,
    account_id: f.accountId,
    periodo: f.periodo,
    vencimiento: f.vencimiento,
    monto_centavos: f.montoCentavos.toString(),
  }));
  const venc = vencidas(facturas, hoy).map((f) => ({
    bill_id: f.id,
    account_id: f.accountId,
    periodo: f.periodo,
    vencimiento: f.vencimiento,
    monto_centavos: f.montoCentavos.toString(),
  }));
  return Response.json({ proximas: prox, vencidas: venc });
};
