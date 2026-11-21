import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { limpiarVistosNotif, sugerirDesdeNotifRepo } from "../../../lib/repos/ordenes-pago.js";

export const prerender = false;

export function limpiar_vistos_notif(): void {
  limpiarVistosNotif();
}

// sugiere órdenes en preparada|vencida con monto exacto y vencimiento
// ±2 días. SOLO sugiere: jamás confirma ni paga (el toque explícito
// `Ya pagué` sigue siendo el único camino a "pagada", OP9.1).
// PERS2-S15: el repo une memoria + DB y guarda los vistos en memoria.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const b = body as { texto?: unknown; notif_id?: unknown; hoy_iso?: unknown; ventana_dias?: unknown };
  try {
    const r = await sugerirDesdeNotifRepo({
      texto: b.texto,
      notifId: b.notif_id,
      hoyIso: b.hoy_iso,
      ventanaDias: b.ventana_dias,
    });
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
