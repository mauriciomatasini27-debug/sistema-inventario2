import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { leerModulosBot } from "../../../lib/repos/bot-modulos.js";
import { listarClientesConSaldo } from "../../../lib/repos/fiado.js";
import { listarMovimientosConFecha, listarVencimientos } from "../../../lib/repos/caja.js";
import { listarCatalogoVivo, marcarWaEnviado, obtenerComercioBot, waEnviadosVivos } from "../../../lib/repos/whatsapp.js";
import { encolarEnvio } from "../../../lib/repos/email.js";
import { control } from "../../../lib/store.js";
import { ZONA_DEFECTO, ejecutar_resumen_mensual, en_ventana_mensual, mes_cerrado } from "../../../jobs/resumen-mensual.js";
import type { PagoPyme } from "../../../jobs/bot-pyme.js";
import { acciones_a_botones } from "../../../modules/bot/acciones-propuestas.js";
import { construir_botones, construir_texto } from "../../../modules/whatsapp/envio.js";
import { cred_wa, enviar_payload_wa } from "../../../jobs/whatsapp-adaptador.js";

export const prerender = false;

const MAX_CUERPO_INTERACTIVO = 1024;

// POST /api/jobs/resumen-mensual — BOT-S7: el día 1 a las 09:00 de la zona
// del tenant, WhatsApp + email con el MISMO snapshot del mes cerrado. El
// tenant sale de gateJob y los datos de su base; la clave de idempotencia es
// tenant+mes+canal (WA en memoria, email durable por el outbox). Fuera de
// ventana responde 200 sin leer datos. Sin credenciales Cloud API el WA queda
// como fallo y no se marca.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const ahoraMs = Date.now();
    const zona = ZONA_DEFECTO;
    const mes = mes_cerrado(ahoraMs, zona);
    if (!en_ventana_mensual(ahoraMs, zona)) {
      return Response.json(
        {
          mes,
          resultados: [
            {
              tenant_id: tenantId,
              canales: [
                { canal: "wa", estado: "omitido_fuera_de_ventana" },
                { canal: "email", estado: "omitido_fuera_de_ventana" },
              ],
            },
          ],
        },
        { status: 200 },
      );
    }
    const modulos = await leerModulosBot(tenantId);
    const movimientos = await listarMovimientosConFecha();
    const catalogo = modulos.includes("rotacion") ? await listarCatalogoVivo(tenantId) : [];
    const productos = catalogo.map((p) => ({
      sku: p.sku,
      nombre: p.nombre,
      stock: p.stock,
      umbral: p.umbral,
      ...(p.reorderQty != null ? { reorderQty: p.reorderQty } : {}),
      proveedor: p.proveedor ?? null,
    }));
    const clientes = modulos.includes("cobranza") ? (await listarClientesConSaldo(ahoraMs)).clientes : [];
    const pagos: PagoPyme[] = modulos.includes("flujo_caja")
      ? (await listarVencimientos())
          .filter((v) => v.estado === "pendiente")
          .map((v) => ({ id: v.id, concepto: v.concepto, venceEl: v.venceEl, montoCentavos: BigInt(v.montoCentavos) }))
      : [];
    const comercio = obtenerComercioBot(tenantId);
    if (!comercio) return Response.json({ mes, resultados: [] }, { status: 200 });
    const destinoEmail = control.users.get(comercio.googleSub)?.email ?? "";
    const prefsEmail = { resumenCierre: true, pausadoHastaMs: comercio.prefs.pausadoHastaMs };
    const hayCred = cred_wa() !== null;
    const { resultados } = await ejecutar_resumen_mensual({
      comercios: [
        {
          tenantId: comercio.tenantId,
          nombreComercio: comercio.nombreComercio,
          modulos,
          movimientos,
          productos,
          clientes,
          pagos,
          prefsWa: comercio.prefs,
          prefsEmail,
          destinoEmail,
        },
      ],
      ahoraMs,
      zona,
      yaEnviadosWa: waEnviadosVivos(),
      enviarWa: async (_id, payload) => {
        if (!hayCred) return { ok: false, error: "sin_credenciales" };
        // Por qué el tope: Meta acepta hasta 1.024 caracteres en el cuerpo de
        // un interactivo; un resumen más largo sale como texto, sin botones.
        const acciones = payload.acciones ?? [];
        const salida =
          acciones.length > 0 && payload.texto.length <= MAX_CUERPO_INTERACTIVO
            ? construir_botones(payload.texto, acciones_a_botones(acciones))
            : construir_texto(payload.texto);
        const ok = await enviar_payload_wa(comercio.numero, salida);
        return ok ? { ok: true } : { ok: false, error: "fallo_envio" };
      },
      encolarEmail: async (_id, payload) => {
        const r = await encolarEnvio({
          key: payload.clave,
          stream: "resumen_mensual",
          to: payload.destino,
          plantilla: "resumen_mensual",
          vars: { mes, texto: payload.texto },
          tenantId,
        });
        if (r.ok) return { ok: true };
        return { ok: false, codigo: "DUPLICADO" };
      },
    });
    // Solo lo enviado bloquea el mes; fallos y omitidos se recalculan.
    for (const r of resultados) {
      for (const c of r.canales) if (c.canal === "wa" && c.estado === "enviado") marcarWaEnviado(c.clave);
    }
    // Sin teléfonos ni emails en la respuesta.
    return Response.json(
      {
        mes,
        resultados: resultados.map((r) => ({
          tenant_id: r.tenantId,
          canales: r.canales.map((c) => ({ canal: c.canal, estado: c.estado })),
        })),
      },
      { status: 200 },
    );
  });
};
