import type { APIRoute } from "astro";
import { syncPushBatchSchema, syncPushSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { empujarOperacion } from "../../../lib/repos/sync.js";
import {
  CODIGO_NECESITA_CONEXION,
  MENSAJE_NECESITA_CONEXION,
  esOperacionSoloOnline,
} from "../../../offline/sensibles.js";

export const prerender = false;

// POST /api/sync/push — Idempotency-Key debe igualar op_id (ADR-0001/0003).
// PERS-S2 (PRD-PERS-01): DB-first. op_id repetido con mismo payload responde
// 200 replay sin duplicar; con distinto payload 409. Sin DB o ante error, la
// vía memoria histórica resuelve igual que antes y la venta no se pierde.
// PERS2-S21: outbox y secuencia por el repo de sync (ADR-0061); en multi sin
// base propaga BaseNoDisponible y responde 503.
// SYNC-S7 (OF4.9 lote ≤50): acepta { ops: [...] }; cada op responde por
// separado y la sensible (payload.tipo en OPERACIONES_SOLO_ONLINE) responde
// necesita_conexion sin persistir ni frenar al resto del lote.

function cuerpoNecesitaConexion(opId: string): Record<string, unknown> {
  return {
    op_id: opId,
    resultado: "necesita_conexion",
    codigo: CODIGO_NECESITA_CONEXION,
    error: MENSAJE_NECESITA_CONEXION,
  };
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }

  const lote = syncPushBatchSchema.safeParse(body);
  if (lote.success) {
    const resultados: Array<Record<string, unknown>> = [];
    for (const op of lote.data.ops) {
      if (esOperacionSoloOnline(op.payload["tipo"])) {
        resultados.push(cuerpoNecesitaConexion(op.op_id));
        continue;
      }
      try {
        const r = await empujarOperacion({
          opId: op.op_id,
          deviceCode: op.device_code,
          deviceSeq: op.device_seq,
          hlc: op.hlc,
          modulo: op.modulo,
          payload: op.payload,
        });
        // P10-6: un 503 "venta_no_aplicada" (o cualquier 4xx/5xx) no puede
        // leerse como aplicado: el cliente sacaría de la cola una venta sin aplicar.
        const resultado = r.status >= 400 ? "error" : "aplicado";
        resultados.push({ ...r.cuerpo, ...(r.cuerpo["resultado"] === undefined ? { resultado, status: r.status } : {}) });
      } catch (e) {
        if (e instanceof BaseNoDisponible) {
          resultados.push({ op_id: op.op_id, resultado: "error", error: "base_no_disponible" });
          continue;
        }
        throw e;
      }
    }
    return Response.json({ resultados }, { status: 200 });
  }

  const parsed = syncPushSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (key !== b.op_id) return Response.json({ error: "Idempotency-Key debe igualar op_id" }, { status: 422 });

  if (esOperacionSoloOnline(b.payload["tipo"])) {
    return Response.json(cuerpoNecesitaConexion(b.op_id), { status: 200 });
  }

  try {
    const r = await empujarOperacion({
      opId: b.op_id,
      deviceCode: b.device_code,
      deviceSeq: b.device_seq,
      hlc: b.hlc,
      modulo: b.modulo,
      payload: b.payload,
    });
    return Response.json(r.cuerpo, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
