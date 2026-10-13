import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { catalogo_vivo } from "../../../modules/whatsapp/catalogo.js";
import { ejecutar_aviso_matutino_wa, fechaBA } from "../../../jobs/whatsapp-aviso-matutino.js";
import { comercios_con_bot, cred_wa, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";
import type { ItemStock } from "../../../modules/email/stock-matutino.js";

export const prerender = false;

// POST /api/jobs/whatsapp-aviso — aviso matutino B5 por comercio.
// Solo con X-Job-Secret. Calcula con stock vivo al envío, solo si hay
// novedad y opt-in (B2/B5.1); el fallo de WA no bloquea el email (B5.6,
// el email sale por sus propios canales).
// Sin credenciales Cloud API el envío se registra como fallo (no se marca
// enviado). Con credenciales el envío se dispara y la entrega real vive en
// los webhooks de estado (B11.3).
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const ahoraMs = Date.now();
  const fecha = fechaBA(new Date(ahoraMs));
  const vivos: ItemStock[] = catalogo_vivo(store.stock, store.prices).map((c) => ({
    sku: c.sku,
    nombre: c.nombre,
    stock: c.stock,
    umbral: c.umbral,
    proveedor: c.proveedor ?? null,
  }));
  const comercios = comercios_con_bot();
  const porTenant = new Map(comercios.map((c) => [c.tenantId, c]));
  const hayCred = cred_wa() !== null;
  const { resultados } = ejecutar_aviso_matutino_wa({
    comercios: comercios.map((c) => ({
      tenantId: c.tenantId,
      nombreComercio: c.nombreComercio,
      prefs: c.prefs,
      catalogoVivo: vivos,
      // Slice-0: sin memoria de alertas previas (prod: enAlertaPrevia desde
      // la última corrida en Drizzle). Toda alerta vigente es novedad.
      enAlertaPrevia: new Set<string>(),
    })),
    fecha,
    ahoraMs,
    yaEnviados: store.waEnviados,
    enviar: (tenantId, payload) => {
      const dest = porTenant.get(tenantId);
      if (!dest || !hayCred) return { ok: false, error: dest ? "sin_credenciales" : "sin_destino" };
      void enviar_texto_wa(dest.numero, payload.texto);
      return { ok: true };
    },
    // Solo lo enviado bloquea la corrida del día: omitidos y fallos se
    // recalculan en el próximo intento (puede haber novedades o credenciales).
    registrar: (clave, r) => {
      if (r.estado === "enviado") store.waEnviados.add(clave);
    },
  });
  return Response.json(
    {
      fecha,
      resultados: resultados.map((r) => ({ tenant_id: r.tenantId, estado: r.estado })),
    },
    { status: 200 },
  );
};
