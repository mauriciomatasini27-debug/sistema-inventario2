import type { APIRoute } from "astro";
import { buscarTicketPorNumero, leerLineasTicket } from "../../lib/repos/tickets.js";

export const prerender = false;

function forma(t: {
  sale_id: string;
  ticket_definitivo: string | null;
  ticket_provisorio: string;
  total_centavos: string;
  medio: string;
  sobreventa: boolean;
  fuente: "db" | "memoria";
}, lineas: Awaited<ReturnType<typeof leerLineasTicket>>) {
  return Response.json(
    {
      sale_id: t.sale_id,
      ticket_definitivo: t.ticket_definitivo,
      ticket_provisorio: t.ticket_provisorio,
      total_centavos: t.total_centavos,
      medio: t.medio,
      sobreventa: t.sobreventa,
      lineas,
      leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA",
      fuente: t.fuente,
    },
    { status: 200 },
  );
}

// GET /api/tickets?numero= — historial por definitivo, provisorio o alias (TV8).
// El provisorio offline sigue buscable tras promover a definitivo (E6).
// PERS2-S5: el repo de tickets lee DB-first; sin DB cae a memoria.
export const GET: APIRoute = async ({ request }) => {
  const numero = new URL(request.url).searchParams.get("numero")?.trim() ?? "";
  if (!numero) return Response.json({ error: "falta numero" }, { status: 422 });
  const hallado = await buscarTicketPorNumero(numero);
  if (!hallado) return Response.json({ error: "no encontrado" }, { status: 404 });
  return forma(
    {
      sale_id: hallado.ticket.sale_id,
      ticket_definitivo: hallado.ticket.ticket_definitivo,
      ticket_provisorio: hallado.ticket.ticket_provisorio,
      total_centavos: hallado.ticket.total_centavos,
      medio: hallado.ticket.medio,
      sobreventa: hallado.ticket.sobreventa,
      fuente: hallado.fuente,
    },
    await leerLineasTicket(hallado.ticket.sale_id),
  );
};
