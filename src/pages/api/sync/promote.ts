import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { syncPromoteSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { intentarLeer, intentarPersistir } from "../../../lib/server-db.js";
import { idMappings, outbox } from "../../../db/schema.js";

export const prerender = false;

// POST /api/sync/promote — asigna el ticket definitivo T-* a un op offline
// ya pusheado (cierra "sync reasigna definitivo" del Slice-0, ADR-0017).
// Idempotente por op_id: el replay devuelve el mapeo original (200).
// Numeración monoproceso en C1 (store.nextTicket, compartido con /api/sales);
// C2 lo lleva a Postgres con lock de secuencia.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = syncPromoteSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  if (key !== b.op_id) return Response.json({ error: "Idempotency-Key debe igualar op_id" }, { status: 422 });

  const previoDb = await intentarLeer((db) =>
    db.select().from(idMappings).where(eq(idMappings.opId, b.op_id)),
  );
  const previoDbRow = previoDb?.[0];
  if (previoDbRow) {
    store.promociones.set(b.op_id, { provisorio: previoDbRow.idProvisorio, definitivo: previoDbRow.idDefinitivo });
    return Response.json(
      {
        op_id: b.op_id,
        ticket_definitivo: previoDbRow.idDefinitivo,
        ticket_provisorio: previoDbRow.idProvisorio,
        id_mapeado: previoDbRow.idDefinitivo,
      },
      { status: 200 },
    );
  }
  const previo = store.promociones.get(b.op_id);
  if (previo) {
    return Response.json(
      {
        op_id: b.op_id,
        ticket_definitivo: previo.definitivo,
        ticket_provisorio: previo.provisorio,
        id_mapeado: previo.definitivo,
      },
      { status: 200 },
    );
  }

  const opsDb = await intentarLeer((db) =>
    db.select({ opId: outbox.opId }).from(outbox).where(eq(outbox.opId, b.op_id)),
  );
  const hayOp = (opsDb?.length ?? 0) > 0 || store.outbox.has(b.op_id);
  if (!hayOp) return Response.json({ error: "op desconocido" }, { status: 404 });

  const provisorio = `${b.device_code}-${b.device_seq}`;
  const definitivo = `T-${String(store.nextTicket).padStart(6, "0")}`;
  store.nextTicket += 1;
  store.promociones.set(b.op_id, { provisorio, definitivo });

  void intentarPersistir(async (db) => {
    await db
      .insert(idMappings)
      .values({ opId: b.op_id, idProvisorio: provisorio, idDefinitivo: definitivo })
      .onConflictDoNothing({ target: idMappings.opId });
    await db.update(outbox).set({ estado: "confirmado" }).where(eq(outbox.opId, b.op_id));
  });

  return Response.json(
    { op_id: b.op_id, ticket_definitivo: definitivo, ticket_provisorio: provisorio, id_mapeado: definitivo },
    { status: 201 },
  );
};
