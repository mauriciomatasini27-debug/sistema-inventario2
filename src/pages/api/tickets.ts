import type { APIRoute } from "astro";
import { eq, or } from "drizzle-orm";
import { store } from "../../lib/store.js";
import { intentarLeer } from "../../lib/server-db.js";
import { sales, tickets } from "../../db/schema.js";

export const prerender = false;

function forma(t: {
  sale_id: string;
  ticket_definitivo: string | null;
  ticket_provisorio: string;
  total_centavos: string;
  medio: string;
  sobreventa: boolean;
  fuente: "db" | "memoria";
}) {
  return Response.json(
    {
      sale_id: t.sale_id,
      ticket_definitivo: t.ticket_definitivo,
      ticket_provisorio: t.ticket_provisorio,
      total_centavos: t.total_centavos,
      medio: t.medio,
      sobreventa: t.sobreventa,
      leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA",
      fuente: t.fuente,
    },
    { status: 200 },
  );
}

// GET /api/tickets?numero= — historial por definitivo, provisorio o alias (TV8).
// El provisorio offline sigue buscable tras promover a definitivo (E6).
// PERS-S4: con DB viva lee sales+tickets; sin DB cae a memoria.
export const GET: APIRoute = async ({ request }) => {
  const numero = new URL(request.url).searchParams.get("numero")?.trim() ?? "";
  if (!numero) return Response.json({ error: "falta numero" }, { status: 422 });
  const filas = await intentarLeer((db) =>
    db
      .select({
        saleId: sales.id,
        definitivo: tickets.definitivo,
        provisorio: tickets.provisorio,
        total: sales.totalCentavos,
        medio: sales.medio,
        sobreventa: sales.sobreventa,
      })
      .from(tickets)
      .innerJoin(sales, eq(tickets.saleId, sales.id))
      .where(or(eq(tickets.definitivo, numero), eq(tickets.provisorio, numero)))
      .limit(1),
  );
  if (filas && filas.length > 0) {
    const f = filas[0]!;
    return forma({
      sale_id: f.saleId,
      ticket_definitivo: f.definitivo,
      ticket_provisorio: f.provisorio,
      total_centavos: BigInt(f.total).toString(),
      medio: f.medio,
      sobreventa: f.sobreventa,
      fuente: "db",
    });
  }
  if (filas) return Response.json({ error: "no encontrado" }, { status: 404 });
  for (const t of store.idempotency.values()) {
    if (t.ticket_definitivo === numero || t.ticket_provisorio === numero) {
      return forma({
        sale_id: t.sale_id,
        ticket_definitivo: t.ticket_definitivo,
        ticket_provisorio: t.ticket_provisorio,
        total_centavos: t.total_centavos,
        medio: t.medio,
        sobreventa: t.sobreventa,
        fuente: "memoria",
      });
    }
  }
  return Response.json({ error: "no encontrado" }, { status: 404 });
};
