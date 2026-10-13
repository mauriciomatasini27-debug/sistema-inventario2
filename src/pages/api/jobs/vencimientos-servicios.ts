import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { ejecutar_vencimientos_servicios } from "../../../jobs/vencimientos-servicios.js";
import { comercios_con_bot, cred_wa, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";
import { fechaBA } from "../../../jobs/whatsapp-aviso-matutino.js";

export const prerender = false;

// POST /api/jobs/vencimientos-servicios — recordatorios CS12/OP11.
// Cron diario 03:00 America/Argentina/Buenos_Aires, fuera del repo.
// Solo con X-Job-Secret. Por comercio con bot: marca órdenes vencidas,
// recuerda servicios (3d + vencidas) y órdenes (7d + vencidas) por WA
// una vez por día, con opt-in/pausa. Sin credenciales WA los envíos se
// informan como fallo sin quemar idempotencia (reintentan mañana).
// Nada se paga ni prepara solo: las sugerencias viajan en la respuesta.
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const ahoraMs = Date.now();
  const hoyIso = fechaBA(new Date(ahoraMs));
  const hayCred = cred_wa() !== null;
  const cuentas = new Map(
    [...store.serviceAccounts.values()].map((c) => [c.id, { proveedor: c.proveedor, servicio: c.servicio }]),
  );
  const facturas = [...store.utilityBills.values()];
  const resultados = [];
  for (const comercio of comercios_con_bot()) {
    const r = ejecutar_vencimientos_servicios({
      comercio: { tenantId: comercio.tenantId, nombreComercio: comercio.nombreComercio, prefs: comercio.prefs },
      facturas,
      ordenes: [...store.paymentOrders.values()],
      cuentas,
      hoyIso,
      hoyMs: ahoraMs,
      yaEnviados: store.waEnviados,
      enviar: (texto: string): boolean => {
        if (!hayCred) return false;
        void enviar_texto_wa(comercio.numero, texto);
        return true;
      },
    });
    for (const o of r.ordenes) store.paymentOrders.set(o.id, o);
    resultados.push({
      tenant_id: comercio.tenantId,
      vencidas_marcadas: r.vencidasMarcadas,
      recordatorios: r.recordatorios.map((x) => ({ tipo: x.tipo, estado: x.estado })),
      sugerencias: r.sugerencias,
    });
  }
  return Response.json({ fecha: hoyIso, resultados }, { status: 200 });
};
