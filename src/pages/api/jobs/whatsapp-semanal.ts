import type { APIRoute } from "astro";
import { control, store } from "../../../lib/store.js";
import { catalogo_vivo } from "../../../modules/whatsapp/catalogo.js";
import { calcular_semanal, type CalculoSemanal } from "../../../modules/email/resumen-semanal.js";
import { ejecutar_job_viernes, type Enviador } from "../../../jobs/whatsapp-resumen.js";
import { comercios_con_bot, encolar_email_simple, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";

export const prerender = false;

// Idempotencia por canal en proceso (prod: notification_deliveries por
// idempotencyKey en Drizzle).
const enviadasWa = new Map<string, string>();
const enviadasEmail = new Map<string, string>();

// Semana ISO (lunes-domingo) para la clave del resumen: `2026-W41`.
export function semana_iso(fecha: Date): string {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const ano = d.getUTCFullYear();
  const semana = 1 + Math.round((d.getTime() - Date.UTC(ano, 0, 4)) / (7 * 86400000));
  return `${ano}-W${String(semana).padStart(2, "0")}`;
}

// Mismo cálculo para WA+email (NE3.1/B9.1): top por egreso de venta,
// faltantes vivos y pedido sugerido por proveedor.
export function calculo_vivo(): CalculoSemanal {
  const catalogo = catalogo_vivo(store.stock, store.prices);
  const porSku = new Map(catalogo.map((c) => [c.sku, c]));
  const ventas = new Map<string, { unidades: number; importe: bigint }>();
  for (const m of store.stockMoves) {
    if (m.tipo !== "VENTA" || m.delta >= 0) continue;
    const u = -m.delta;
    const precio = BigInt(store.prices.get(m.sku) ?? 0);
    const e = ventas.get(m.sku) ?? { unidades: 0, importe: 0n };
    ventas.set(m.sku, { unidades: e.unidades + u, importe: e.importe + BigInt(u) * precio });
  }
  return calcular_semanal({
    ventas: [...ventas.entries()].map(([sku, v]) => ({
      sku,
      nombre: porSku.get(sku)?.nombre ?? sku,
      unidades: v.unidades,
      importeCentavos: v.importe,
    })),
    faltantes: catalogo
      .filter((c) => c.umbral > 0 && c.stock <= c.umbral)
      .map((c) => ({ sku: c.sku, nombre: c.nombre, stock: c.stock, umbral: c.umbral, proveedor: c.proveedor ?? null })),
  });
}

// POST /api/jobs/whatsapp-semanal — resumen del viernes B9 por comercio.
// Solo con X-Job-Secret. WA + email en paralelo con el mismo cálculo;
// cada canal tiene su clave y su gate (B2). Sin ventas sale igual con la
// aclaración (B9).
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const ahoraMs = Date.now();
  const semanaISO = semana_iso(new Date(ahoraMs));
  const calculo = calculo_vivo();
  const baseWeb = process.env.PUBLIC_APP_URL ?? "https://app.local";
  const sender: Enviador = async ({ canal, destino, texto, idempotencyKey }) => {
    if (canal === "wa") return enviar_texto_wa(destino, texto);
    return encolar_email_simple(idempotencyKey, destino, `Resumen semanal ${semanaISO}`, texto);
  };
  const resultados = [];
  for (const c of comercios_con_bot()) {
    const email = control.users.get(c.googleSub)?.email ?? "";
    const r = await ejecutar_job_viernes({ wa: enviadasWa, email: enviadasEmail }, sender, {
      comercio: {
        tenantId: c.tenantId,
        nombreComercio: c.nombreComercio,
        zona: "America/Argentina/Buenos_Aires",
        prefsWa: c.prefs,
        prefsEmail: { resumenCierre: true, pausadoHastaMs: null },
        destinoWa: c.numero,
        destinoEmail: email,
      },
      semanaISO,
      calculo,
      // B15: sin motor de promos en slice-0 (llega con rotación RT9); el
      // resumen sale sin bloque de promos.
      promos: [],
      baseWeb,
      ahoraMs,
    });
    resultados.push({ tenant_id: c.tenantId, canales: r });
  }
  return Response.json({ semana: semanaISO, resultados }, { status: 200 });
};
