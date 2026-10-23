import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { esSingle } from "../../../lib/tenant-context.js";
import {
  catalogoAvisoVivo,
  listarComerciosBot,
  obtenerComercioBot,
} from "../../../lib/repos/whatsapp.js";
import { ejecutar_alertas_stock } from "../../../jobs/alertas-stock.js";
import { en_ventana_quiebre, resolver_destinatarios } from "../../../modules/alertas/stock-bajo.js";
import { cargarPersonasAlerta } from "../../../lib/repos/alerta-prefs.js";
import { fechaAR } from "../../../lib/fecha-ar.js";
import { cred_wa, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";

export const prerender = false;

// POST /api/jobs/alertas-stock — alertas de stock bajo ALR-S2 (ADR-0043).
// Solo con X-Job-Secret vía correrJob. ?modo=matutino|quiebre (defecto
// matutino), ?fecha=AAAA-MM-DD (defecto hoy AR), ?hora=HH:MM para quiebre.
// Matutino avisa bajo mínimo a quien tiene esa hora; quiebre solo saldo 0 de 10:00 a 20:00.
// El envío no se repite por persona, producto y día. Solo lee stock (AT1).
// El Dueño entra si no está pausado y la hora del tick coincide. WhatsApp exige opt-in.
// Canales por interfaz inyectable: sin credenciales WA el envío queda como
// fallo sin red real; el email queda registrado sin proveedor externo.
// pg_cron no se configura acá: el cron vive fuera y pega a este endpoint.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const url = new URL(request.url);
    const modo = url.searchParams.get("modo") === "quiebre" ? "quiebre" : "matutino";
    const ahoraMs = Date.now();
    const fecha = url.searchParams.get("fecha") ?? fechaAR(new Date(ahoraMs));
    const hora = url.searchParams.get("hora") ?? "08:00";
    if (modo === "quiebre" && hora !== "" && !en_ventana_quiebre(hora)) {
      return Response.json({ fecha, modo, omitido: "fuera_ventana", alertas: [] }, { status: 200 });
    }
    const vivos = await catalogoAvisoVivo();
    const uno = obtenerComercioBot(tenantId);
    const comercios = esSingle() ? listarComerciosBot() : uno ? [uno] : [];
    const comercio = comercios.find((c) => c.tenantId === tenantId) ?? comercios[0];
    if (!comercio) return Response.json({ fecha, modo, alertas: [], enviadas: 0 }, { status: 200 });
    const hayCred = cred_wa() !== null;
    const personas = await cargarPersonasAlerta(comercio.tenantId);
    const destinatarios = resolver_destinatarios({
      duenos: personas.duenos,
      encargados: personas.encargados,
      ahoraMs,
      modo,
      horaTick: hora,
    });
    const r = ejecutar_alertas_stock({
      tenantId: comercio.tenantId,
      fecha,
      modo,
      catalogo: vivos.map((v) => ({
        sku: v.sku,
        nombre: v.nombre,
        stock: v.stock,
        minimo: v.umbral,
        ventas7d: 0,
        proveedor: v.proveedor,
        ...(v.reorderQty != null ? { reorderQty: v.reorderQty } : {}),
      })),
      destinatarios,
      enviarWa: () => {
        if (!hayCred) return { ok: false, error: "sin_credenciales" };
        void enviar_texto_wa(comercio.numero, `Stock bajo (${fecha})`);
        return { ok: true };
      },
      enviarEmail: () => ({ ok: true }),
    });
    return Response.json(
      {
        fecha,
        modo,
        alertas: r.alertas.map((a) => ({
          sku: a.sku,
          stock: a.stock,
          umbral: a.umbral,
          clave: a.clave,
          reorder_qty: a.reorderQty ?? null,
        })),
        enviadas: r.enviadas,
        omitidas_ya: r.omitidasYa,
      },
      { status: 200 },
    );
  });
};
