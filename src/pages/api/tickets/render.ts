import type { APIRoute } from "astro";
import { buildTicketRender } from "../../../modules/sales/ticket_render.js";

export const prerender = false;

// Body: { comercio, ticket, lineas, linkPublico, fechaIso }.
// 200 { html, text, qrPayload }; 422 si invariantes no cuadran.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const b = body as {
    comercio?: string;
    ticket?: {
      kind?: string;
      definitivo?: string | null;
      provisorio?: string;
      totalCentavos?: string | number;
      medio?: string;
      leyenda?: string;
      pago?: string;
    };
    lineas?: Array<{
      sku?: string;
      cantidad?: number;
      brutoCentavos?: string | number;
      descLineaCentavos?: string | number;
      descTicketCentavos?: string | number;
      netoCentavos?: string | number;
    }>;
    linkPublico?: string;
    fechaIso?: string;
  };
  try {
    if (!b.comercio || !b.ticket || !b.linkPublico || !b.fechaIso || !Array.isArray(b.lineas)) {
      return Response.json({ error: "faltan campos" }, { status: 422 });
    }
    const t = b.ticket;
    if (t.kind !== "online" && t.kind !== "offline") {
      return Response.json({ error: "ticket.kind invalido" }, { status: 422 });
    }
    const ticket =
      t.kind === "online"
        ? {
            kind: "online" as const,
            definitivo: String(t.definitivo ?? ""),
            provisorio: String(t.provisorio ?? ""),
            totalCentavos: BigInt(t.totalCentavos as string),
            medio: t.medio as "Efectivo" | "Debito" | "Mercado Pago" | "QR" | "Transferencia",
            leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA" as const,
            ...(t.pago !== undefined ? { pago: t.pago as "Pago: A cuenta" } : {}),
          }
        : {
            kind: "offline" as const,
            definitivo: null,
            provisorio: String(t.provisorio ?? ""),
            totalCentavos: BigInt(t.totalCentavos as string),
            medio: t.medio as "Efectivo" | "Debito" | "Mercado Pago" | "QR" | "Transferencia",
            leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA" as const,
            ...(t.pago !== undefined ? { pago: t.pago as "Pago: A cuenta" } : {}),
          };
    const input = {
      comercio: b.comercio,
      ticket,
      lineas: b.lineas.map((l) => ({
        sku: String(l.sku ?? ""),
        cantidad: Number(l.cantidad),
        brutoCentavos: BigInt(l.brutoCentavos as string),
        descLineaCentavos: BigInt(l.descLineaCentavos as string),
        descTicketCentavos: BigInt(l.descTicketCentavos as string),
        netoCentavos: BigInt(l.netoCentavos as string),
      })),
      linkPublico: b.linkPublico,
      fechaIso: b.fechaIso,
    };
    // TV10 P1: ?formato=pdf genera PDF offline (qrcode+pdfkit locales).
    // Sin deps instaladas => 501, html/texto siguen funcionando.
    if (new URL(request.url).searchParams.get("formato") === "pdf") {
      try {
        const { generar_ticket_pdf } = await import("../../../modules/sales/qr_pdf_offline.js");
        const pdf = await generar_ticket_pdf(input);
        const numero = ticket.kind === "online" ? ticket.definitivo : ticket.provisorio;
        return new Response(pdf as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="ticket-${numero}.pdf"`,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "pdf invalido";
        if (/Cannot find|ERR_MODULE_NOT_FOUND|Failed to resolve/i.test(msg)) {
          return Response.json({ error: "pdf no disponible: instalar qrcode pdfkit" }, { status: 501 });
        }
        return Response.json({ error: msg }, { status: 422 });
      }
    }
    return Response.json(buildTicketRender(input), { status: 200 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "render invalido" }, { status: 422 });
  }
};
