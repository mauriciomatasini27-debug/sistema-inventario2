import type { APIRoute } from "astro";
import { envioCentralYaVisto, registrarEnvioCentral } from "../../../lib/repos/tickets.js";
import {
  construir_payload_texto_central,
  construir_resumen_ticket,
  construir_wa_me_url,
  decidir_envio_central,
} from "../../../modules/sales/ticket_share.js";
import { buscarVentaPorId } from "../../../modules/sales/buscar_venta.js";

export const prerender = false;

// Body: { sale_id, toE164?, dentroVentana24h?, optIn?, comercio? }.
// Header Idempotency-Key requerido (no duplica envío central).
// Siempre devuelve wa_me_url (gratis); central solo si hay opt-in y no duplicado.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const b = body as {
    sale_id?: string;
    toE164?: string;
    dentroVentana24h?: boolean;
    optIn?: boolean;
    comercio?: string;
  };
  if (!b.sale_id) return Response.json({ error: "falta sale_id" }, { status: 422 });
  // pre-cutover. Los envíos centrales los guarda el repo de tickets.
  const vendido = await buscarVentaPorId(b.sale_id);
  if (!vendido) return Response.json({ error: "venta inexistente" }, { status: 404 });

  const resumen = construir_resumen_ticket({
    definitivo: vendido.ticket_definitivo,
    provisorio: vendido.ticket_provisorio,
    totalCentavos: BigInt(vendido.total_centavos),
    medio: vendido.medio,
    comercio: b.comercio ?? "Comercio",
  });

  let wa_me_url: string | null = null;
  if (b.toE164) {
    const w = construir_wa_me_url({ toE164: b.toE164, resumen });
    if (!w.ok) return Response.json({ error: "telefono invalido" }, { status: 422 });
    wa_me_url = w.url;
  }

  const decision = decidir_envio_central({
    dentroVentana24h: b.dentroVentana24h ?? true,
    optIn: b.optIn ?? false,
    ahoraMs: Date.now(),
  });
  let central: { modo: string; costo_plantilla_centavos: string | null; enviado: boolean } = {
    modo: decision.modo,
    costo_plantilla_centavos: decision.costoPlantillaCentavos?.toString() ?? null,
    enviado: false,
  };
  if (decision.modo !== "bloqueado_optin" && !envioCentralYaVisto(key)) {
    // Slice-0: se encola en el outbox en memoria; el worker real lo envía con
    // enviar_plantilla_ticket_listo (ticket_template.ts) cuando es plantilla.
    // Sin credencial Meta en el proceso, el envío HTTP lo hace el sender con
    // phoneNumberId+token del servidor (ver plantilla.md del slice D).
    if (decision.modo === "requiere_plantilla") {
      const numero = vendido.ticket_definitivo ?? vendido.ticket_provisorio;
      registrarEnvioCentral(key, {
        sale_id: b.sale_id,
        modo: decision.modo,
        plantilla: "ticket_listo",
        locale: "es_AR",
        vars: { numeroTicket: numero, totalCentavos: vendido.total_centavos, linkPublico: null },
        costo_plantilla_centavos: decision.costoPlantillaCentavos?.toString() ?? null,
        cuando: new Date().toISOString(),
      });
    } else {
      registrarEnvioCentral(key, {
        sale_id: b.sale_id,
        modo: decision.modo,
        payload: construir_payload_texto_central(resumen),
        cuando: new Date().toISOString(),
      });
    }
    central = { ...central, enviado: decision.modo === "libre" };
  }

  return Response.json({ resumen, wa_me_url, central, leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA" }, { status: 200 });
};
