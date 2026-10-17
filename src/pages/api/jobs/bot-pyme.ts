import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { leerModulosBot } from "../../../lib/repos/bot-modulos.js";
import { listarClientesConSaldo } from "../../../lib/repos/fiado.js";
import { listarVencimientos, obtenerBalance } from "../../../lib/repos/caja.js";
import { marcarWaEnviado, obtenerComercioBot, waEnviadosVivos } from "../../../lib/repos/whatsapp.js";
import { ejecutar_bot_pyme, type ClientePyme, type PagoPyme } from "../../../jobs/bot-pyme.js";
import { fechaAR } from "../../../lib/fecha-ar.js";
import { cred_wa, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";

export const prerender = false;

// POST /api/jobs/bot-pyme — BOT-S4: rubro pyme con los módulos `flujo_caja`
// (caja contra pagos a 7 días) y `cobranza` (deudores sobre tope o con 14+
// días de atraso, con recordatorio wa.me) según tenant_bot_modules. Un
// mensaje WA por comercio y día, idempotente por tenant+fecha. El tenant sale
// de gateJob y los datos de su base; solo su número recibe el mensaje. Sin
// credenciales Cloud API el envío queda como fallo y no se marca enviado.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const ahoraMs = Date.now();
    const fecha = fechaAR(new Date(ahoraMs));
    const modulos = await leerModulosBot(tenantId);
    const conFlujo = modulos.includes("flujo_caja");
    const clientes: ClientePyme[] =
      conFlujo || modulos.includes("cobranza") ? (await listarClientesConSaldo(ahoraMs)).clientes : [];
    const cajaCentavos = conFlujo ? BigInt((await obtenerBalance()).total) : 0n;
    const pagos: PagoPyme[] = conFlujo
      ? (await listarVencimientos())
          .filter((v) => v.estado === "pendiente")
          .map((v) => ({ id: v.id, concepto: v.concepto, venceEl: v.venceEl, montoCentavos: BigInt(v.montoCentavos) }))
      : [];
    const uno = obtenerComercioBot(tenantId);
    const comercios = uno ? [uno] : [];
    const porTenant = new Map(comercios.map((c) => [c.tenantId, c]));
    const hayCred = cred_wa() !== null;
    const { resultados } = ejecutar_bot_pyme({
      comercios: comercios.map((c) => ({
        tenantId: c.tenantId,
        nombreComercio: c.nombreComercio,
        modulos,
        clientes,
        cajaCentavos,
        pagos,
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
    // Sin teléfonos ni links en la respuesta: el recordatorio va en el mensaje.
    return Response.json(
      {
        fecha,
        resultados: resultados.map((r) => ({
          tenant_id: r.tenantId,
          estado: r.estado,
          secciones: r.secciones,
          deudores: r.deudores.map((d) => ({ customer_id: d.id, motivos: d.motivos, con_link: d.link !== null })),
        })),
      },
      { status: 200 },
    );
  });
};
