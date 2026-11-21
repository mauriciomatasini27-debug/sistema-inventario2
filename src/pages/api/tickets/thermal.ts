import type { APIRoute } from "astro";
import { render_ticket_thermal } from "../../../modules/sales/ticket_thermal.js";

export const prerender = false;

// medio, pagoACuenta?, offline?, sobreventa?, lineas:[{sku,cantidad,
// precioCentavos,netoCentavos?,descuentoCentavos?}], totalBrutoCentavos,
// totalDescuentoCentavos, totalNetoCentavos, qrUrl? } (centavos como string).
// 200 { cols32, cols48, html58, html80 }; 422 si inválido.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const b = body as {
    comercio?: string;
    comercioExtra?: string;
    ticketDefinitivo?: string | null;
    provisorio?: string;
    fechaIso?: string;
    medio?: string;
    pagoACuenta?: boolean;
    offline?: boolean;
    sobreventa?: boolean;
    lineas?: Array<{
      sku?: string;
      cantidad?: number;
      precioCentavos?: string | number;
      netoCentavos?: string | number;
      descuentoCentavos?: string | number;
    }>;
    totalBrutoCentavos?: string | number;
    totalDescuentoCentavos?: string | number;
    totalNetoCentavos?: string | number;
    qrUrl?: string;
  };
  try {
    if (!b.comercio || !b.provisorio || !b.fechaIso || !b.medio || !Array.isArray(b.lineas)) {
      return Response.json({ error: "faltan campos" }, { status: 422 });
    }
    const r = render_ticket_thermal({
      comercio: b.comercio,
      ...(b.comercioExtra !== undefined ? { comercioExtra: b.comercioExtra } : {}),
      ticketDefinitivo: b.ticketDefinitivo ?? null,
      provisorio: b.provisorio,
      fechaIso: b.fechaIso,
      medio: b.medio,
      ...(b.pagoACuenta !== undefined ? { pagoACuenta: b.pagoACuenta } : {}),
      ...(b.offline !== undefined ? { offline: b.offline } : {}),
      ...(b.sobreventa !== undefined ? { sobreventa: b.sobreventa } : {}),
      lineas: b.lineas.map((l) => ({
        sku: String(l.sku ?? ""),
        cantidad: Number(l.cantidad),
        precioCentavos: BigInt(l.precioCentavos as string),
        ...(l.netoCentavos != null ? { netoCentavos: BigInt(l.netoCentavos as string) } : {}),
        ...(l.descuentoCentavos != null ? { descuentoCentavos: BigInt(l.descuentoCentavos as string) } : {}),
      })),
      totalBrutoCentavos: BigInt(b.totalBrutoCentavos as string),
      totalDescuentoCentavos: BigInt(b.totalDescuentoCentavos as string),
      totalNetoCentavos: BigInt(b.totalNetoCentavos as string),
      ...(b.qrUrl !== undefined ? { qrUrl: b.qrUrl } : {}),
    });
    if (!r.ok) return Response.json({ error: r.codigo === "TOTAL_CERO" ? "total cero" : "linea invalida" }, { status: 422 });
    return Response.json(r, { status: 200 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "thermal invalido" }, { status: 422 });
  }
};
