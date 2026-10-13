import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { matchear_notif, parsear_notif_bancaria } from "../../../modules/payments/notifs-bancarias.js";
import { fechaBA } from "../../../jobs/whatsapp-aviso-matutino.js";

export const prerender = false;

// Registro de notif_id ya sugeridos en este proceso (idempotencia en
// memoria; prod: UNIQUE en la tabla de ingesta). Reintento con la misma
// clave devuelve 409 con la respuesta original, sin reevaluar.
const vistos = new Map<string, unknown>();

export function limpiar_vistos_notif(): void {
  vistos.clear();
}

// POST /api/payment-orders/sugerir-desde-notif — OP10 P2.
// Dado el texto de una notificación bancaria (pegado por el comerciante),
// sugiere órdenes en preparada|vencida con monto exacto y vencimiento
// ±2 días. SOLO sugiere: jamás confirma ni paga (el toque explícito
// `Ya pagué` sigue siendo el único camino a "pagada", OP9.1).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const b = body as { texto?: unknown; notif_id?: unknown; hoy_iso?: unknown; ventana_dias?: unknown };
  if (typeof b.texto !== "string" || b.texto.trim().length === 0 || b.texto.length > 2000) {
    return Response.json({ error: "texto requerido (1-2000)" }, { status: 422 });
  }
  if (typeof b.notif_id !== "string" || b.notif_id.length === 0 || b.notif_id.length > 128) {
    return Response.json({ error: "notif_id requerido (1-128)" }, { status: 422 });
  }
  const hoyIso = typeof b.hoy_iso === "string" ? b.hoy_iso : fechaBA(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoyIso)) {
    return Response.json({ error: "hoy_iso YYYY-MM-DD" }, { status: 422 });
  }
  const ventana = b.ventana_dias === undefined ? 2 : b.ventana_dias;
  if (typeof ventana !== "number" || !Number.isInteger(ventana) || ventana < 0 || ventana > 30) {
    return Response.json({ error: "ventana_dias 0-30" }, { status: 422 });
  }
  const previo = vistos.get(b.notif_id);
  if (previo !== undefined) {
    return Response.json({ error: "notif_id repetida", original: previo }, { status: 409 });
  }
  const p = parsear_notif_bancaria(b.texto, hoyIso);
  if (!p.ok) return Response.json({ error: p.error }, { status: 422 });
  const m = matchear_notif(p.notif, [...store.paymentOrders.values()], ventana);
  const respuesta = {
    notif: {
      banco: p.notif.banco,
      monto_centavos: p.notif.montoCentavos.toString(),
      fecha_iso: p.notif.fechaIso,
      referencia: p.notif.referencia,
    },
    candidatos: m.candidatos,
    evaluadas: m.evaluadas,
  };
  vistos.set(b.notif_id, respuesta);
  return Response.json(respuesta, { status: 200 });
};
