import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";

export const prerender = false;

// POST /api/jobs/vencimientos-lotes — CAT-S4 alertas 15/7/3d + expone a bot promos.
// Recorre lotes en memoria, clasifica por días restantes.
export const POST: APIRoute = async () => {
  const ahora = Date.now();
  const alertas15: unknown[] = [];
  const alertas7: unknown[] = [];
  const alertas3: unknown[] = [];
  const vencidos: unknown[] = [];
  for (const l of store.lotes.values()) {
    if (!l.venceEl) continue;
    const dias = Math.ceil((new Date(l.venceEl).getTime() - ahora) / 86400_000);
    const item = { lote_id: l.id, sku: l.sku, vence_el: l.venceEl, dias, cantidad_restante: l.cantidadRestante };
    if (dias < 0) vencidos.push({ ...item, accion: "baja_merma" });
    else if (dias <= 3) alertas3.push(item);
    else if (dias <= 7) alertas7.push(item);
    else if (dias <= 15) alertas15.push(item);
  }
  return Response.json({ alertas_15d: alertas15, alertas_7d: alertas7, alertas_3d: alertas3, vencidos, promo_bot: alertas3.length > 0 });
};
