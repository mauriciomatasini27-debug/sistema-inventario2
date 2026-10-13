import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { ejecutar_job_lunes, type Enviador } from "../../../jobs/whatsapp-resumen.js";
import { fechaBA } from "../../../jobs/whatsapp-aviso-matutino.js";
import { comercios_con_bot, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";
import type { SnapshotLunes, TiendaLunes } from "../../../modules/whatsapp/resumen-semanal.js";

export const prerender = false;

// Pedidos programados para el lunes (B9.4): los deja el flujo "Programar p/
// lunes" vía programar_lunes; el job solo los recuerda. En proceso (prod:
// tabla de programados en la base del comercio).
export const tiendaLunes: TiendaLunes = new Map<string, SnapshotLunes>();
const recordados = new Map<string, string>();

// POST /api/jobs/whatsapp-lunes — recordatorio lunes 10h B9.5.
// Solo con X-Job-Secret. Recuerda los programados cuya fecha es hoy (BA);
// sin programados no sale nada.
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const ahoraMs = Date.now();
  const hoy = fechaBA(new Date(ahoraMs));
  const sender: Enviador = async ({ destino, texto }) => enviar_texto_wa(destino, texto);
  const porTenant = new Map(comercios_con_bot().map((c) => [c.tenantId, c]));
  const resultados = [];
  for (const snapshot of tiendaLunes.values()) {
    if (snapshot.lunesFecha !== hoy) continue;
    const c = porTenant.get(snapshot.tenantId);
    if (!c) continue;
    const r = await ejecutar_job_lunes(recordados, sender, {
      comercio: {
        tenantId: c.tenantId,
        nombreComercio: c.nombreComercio,
        zona: "America/Argentina/Buenos_Aires",
        prefsWa: c.prefs,
        prefsEmail: { resumenCierre: true, pausadoHastaMs: null },
        destinoWa: c.numero,
        destinoEmail: control.users.get(c.googleSub)?.email ?? "",
      },
      snapshot,
      lunesFecha: hoy,
      ahoraMs,
    });
    resultados.push({ tenant_id: c.tenantId, canal: r.canal, estado: r.estado });
  }
  return Response.json({ fecha: hoy, resultados }, { status: 200 });
};
