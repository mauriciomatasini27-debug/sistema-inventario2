import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { clasificarLotes, listarLotes } from "../../../lib/repos/lotes.js";
import { leerModulosBot } from "../../../lib/repos/bot-modulos.js";
import { listarCatalogoVivo, marcarWaEnviado, obtenerComercioBot, waEnviadosVivos } from "../../../lib/repos/whatsapp.js";
import { listar_dormidos } from "../../../modules/analytics/selectores.js";
import { DEFAULT_SETTINGS, type SkuRot } from "../../../modules/analytics/tipos.js";
import { filas_rotacion } from "../../../jobs/resumen-rotacion.js";
import { ejecutar_bot_quiosco, type DormidoQuiosco, type ProductoQuiosco } from "../../../jobs/bot-quiosco.js";
import { fechaAR } from "../../../lib/fecha-ar.js";
import { cred_wa, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";

export const prerender = false;

// POST /api/jobs/bot-quiosco — BOT-S3: rubro quiosco con los módulos
// `vencimientos` (CAT-S4 15/7/3d) y `rotacion` (RT6 dormidos) según
// tenant_bot_modules. Un mensaje WA por comercio y día, idempotente por
// tenant+fecha. El tenant sale de gateJob (nunca de otro) y los módulos de
// `leerModulosBot(tenantId)`. Sin credenciales Cloud API el envío se registra
// como fallo y no se marca enviado; el job nunca lanza.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const ahoraMs = Date.now();
    const fecha = fechaAR(new Date(ahoraMs));
    const modulos = await leerModulosBot(tenantId);
    const lotes = clasificarLotes(await listarLotes(), ahoraMs);
    const productos = new Map<string, ProductoQuiosco>(
      (await listarCatalogoVivo()).map((p) => [p.sku, { nombre: p.nombre, precioCentavos: p.precioCentavos }]),
    );
    const dormidos: DormidoQuiosco[] = modulos.includes("rotacion")
      ? listar_dormidos(filas_rotacion(new Date(ahoraMs)), new Set<SkuRot>(), DEFAULT_SETTINGS).map((d) => ({
          sku: d.sku,
          diasSinVenta: d.diasSinVenta,
          inmovilizadoCentavos: d.inmovilizadoCentavos,
        }))
      : [];
    // Lotes, catálogo y módulos son del tenant del contexto: solo su número
    // recibe el mensaje (también en single, aunque haya otros vínculos).
    const uno = obtenerComercioBot(tenantId);
    const comercios = uno ? [uno] : [];
    const porTenant = new Map(comercios.map((c) => [c.tenantId, c]));
    const hayCred = cred_wa() !== null;
    const { resultados } = ejecutar_bot_quiosco({
      comercios: comercios.map((c) => ({
        tenantId: c.tenantId,
        nombreComercio: c.nombreComercio,
        modulos,
        lotes,
        productos,
        dormidos,
        prefs: c.prefs,
      })),
      fecha,
      ahoraMs,
      yaEnviados: waEnviadosVivos(),
      enviar: (id, payload) => {
        const dest = porTenant.get(id);
        if (!dest || !hayCred) return { ok: false, error: dest ? "sin_credenciales" : "sin_destino" };
        void enviar_texto_wa(dest.numero, payload.texto);
        return { ok: true };
      },
    });
    // Solo lo enviado bloquea el día; omitidos y fallos se recalculan.
    for (const r of resultados) if (r.estado === "enviado") marcarWaEnviado(r.clave);
    return Response.json(
      {
        fecha,
        resultados: resultados.map((r) => ({
          tenant_id: r.tenantId,
          estado: r.estado,
          secciones: r.secciones,
          promos: r.promos.map((p) => ({ sku: p.sku, motivo: p.motivo, promo: p.promo })),
        })),
      },
      { status: 200 },
    );
  });
};
