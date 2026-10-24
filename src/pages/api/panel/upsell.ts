import type { APIRoute } from "astro";
import { jsonError, resolverSesion } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { esSuperficieUpsell } from "../../../lib/panel-upsell.js";
import { accesoUpsellDeRequest } from "../../../lib/upsell-ruta.js";

export const prerender = false;

// PLAN-S9: bot y alertas de WhatsApp preguntan acá. 200 con la pantalla de
// upsell cuando el plan no incluye el módulo. Nunca 404.

export const GET: APIRoute = async ({ request }) => {
  if (!resolverSesion(request)) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const superficie = new URL(request.url).searchParams.get("superficie");
  if (!esSuperficieUpsell(superficie)) {
    return Response.json({ error: "Superficie desconocida." }, { status: 400 });
  }
  try {
    const acceso = await accesoUpsellDeRequest(request, superficie);
    if (!acceso) return jsonError("No tenés permiso en este comercio.", 403);
    if (acceso.tipo === "incluido") return Response.json({ acceso: "incluido" });
    return Response.json({ acceso: "upsell", pantalla: acceso.pantalla });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
