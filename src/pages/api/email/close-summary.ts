import type { APIRoute } from "astro";
import { emailCloseSummarySchema } from "../../../lib/validation.js";
import { encolar_resumen_cierre } from "../../../modules/email/resumen-cierre.js";
import { store } from "../../../lib/store.js";
import { intentarPersistir } from "../../../lib/server-db.js";
import { emailOutbox, notificationEvents } from "../../../db/schema-email.js";

export const prerender = false;

// POST /api/email/close-summary — encola resumen de cierre (NE4/NE11).
// Snapshot inmutable: total + por medio derivados de movimientos (SUM).
// Reintento misma jornada => 409 (dedupe por tenant+fecha).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = emailCloseSummarySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const porMedio: Record<string, bigint> = {};
  let total = 0n;
  for (const m of store.movements) {
    const monto = BigInt(m.monto_centavos);
    const signo = m.tipo === "ingreso" ? 1n : -1n;
    porMedio[m.metodo] = (porMedio[m.metodo] ?? 0n) + signo * monto;
    total += signo * monto;
  }
  const r = encolar_resumen_cierre(
    { eventos: store.emailEventos, outbox: store.emailOutbox },
    {
      tenantId: b.tenant_id,
      cierreId: b.cierre_id,
      fechaJornada: b.fecha_jornada,
      totalCentavos: total,
      porMedio,
      tipo: b.tipo,
      datosPlantilla: {
        nombreComercio: b.nombre_comercio,
        fechaJornada: b.fecha_jornada,
        totalCentavos: total,
        porMedio,
        tipo: b.tipo,
      },
      destinatario: b.destinatario,
    },
  );
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
  // PERS-S4 best-effort (NE4/NE11 append-only): con DB viva deja evento +
  // outbox en 1 tx (dedupe por tenant+fecha); sin DB la memoria sigue
  // mandando. El snapshot viaja con la memoria (el cutover lo unifica con
  // closing_summaries). tenant_id no-uuid va null (columna uuid).
  const tenantUuid = esUuid(b.tenant_id) ? b.tenant_id : null;
  void intentarPersistir((db) =>
    db.transaction(async (tx) => {
      await tx
        .insert(notificationEvents)
        .values({
          tenantId: tenantUuid,
          tipo: r.evento.tipo,
          version: 1,
          payload: r.evento.payload as never,
          dedupeKey: r.evento.dedupeKey,
          estado: "pendiente",
        })
        .onConflictDoNothing({ target: notificationEvents.dedupeKey });
      await tx
        .insert(emailOutbox)
        .values({
          tenantId: tenantUuid,
          categoria: "cierre",
          plantilla: "cierre_v1",
          destinatario: r.envio.destinatario,
          asunto: r.envio.asunto,
          html: r.envio.html,
          texto: r.envio.texto,
          idempotencyKey: r.envio.idempotencyKey,
          estado: "pendiente",
        })
        .onConflictDoNothing({ target: emailOutbox.idempotencyKey });
    }),
  );
  return Response.json({ asunto: r.envio.asunto, destinatario: r.envio.destinatario }, { status: 201 });
};

function esUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
};
