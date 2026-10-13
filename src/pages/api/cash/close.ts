import type { APIRoute } from "astro";
import { closeSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { exigirOnlineParaSensible } from "../../../lib/offline-gate.js";
import { cerrar_jornada } from "../../../modules/cash/cierre.js";
import { derivar_balance, type Movimiento } from "../../../modules/cash/caja.js";
import { asegurar_aviso_cierre } from "../../../jobs/cierre-medianoche.js";

export const prerender = false;

function movimientos(): Movimiento[] {
  return store.movements.map((m) => ({
    tipo: m.tipo,
    metodo: m.metodo,
    monto_centavos: BigInt(m.monto_centavos),
    origen: m.origen as Movimiento["origen"],
  }));
}

// POST /api/cash/close — cierre de jornada (C12). 422 si hay turno en disputa.
// SYNC-S7: operación sensible, exige online. Con grant offline / cuarentena => 403.
export const POST: APIRoute = async ({ request }) => {
  const bloqueo = exigirOnlineParaSensible(request, "cierre");
  if (bloqueo) return bloqueo;
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const enDisputa = [...store.turnos.values()].filter((t) => t.estado === "en_disputa").length;
  const r = cerrar_jornada({
    idempotencyKey: key,
    fechaJornada: b.fecha_jornada,
    closeType: b.close_type,
    movimientos: movimientos(),
    ultimoMovimientoId: store.movements.length ? (store.movements[store.movements.length - 1]?.id ?? null) : null,
    turnosEnDisputa: enDisputa,
    cierres: store.cierres,
  });
  if (r.status !== 201) {
    // Response.json no serializa bigint: el original viaja con total en string.
    const originalJson =
      "original" in r && r.original
        ? {
            ...r.original,
            cierre: { ...r.original.cierre, totalCentavos: r.original.cierre.totalCentavos.toString() },
          }
        : undefined;
    // Reintento del cierre (409 con original): asegura el aviso WA idempotente
    // aunque la primera respuesta se haya perdido. El cierre sigue siendo 409.
    if (r.status === 409 && "original" in r && r.original) {
      const wa = asegurar_aviso_cierre(store.waEnviados, {
        tenantId: "demo",
        cierreId: key,
        fechaJornada: r.original.cierre.fechaJornada,
        totalCentavos: r.original.cierre.totalCentavos,
        porMedio: derivar_balance(movimientos()).porMedio,
        tipo: r.original.cierre.closeType,
        nombreComercio: "Mi comercio",
      });
      return Response.json({ error: r.error, original: originalJson, wa }, { status: 409 });
    }
    return Response.json({ error: r.error, original: originalJson }, { status: r.status });
  }
  // C10: notificación WA de caja una vez por jornada. No bloquea el cierre:
  // si ya se avisó, se informa duplicado. Slice-0 sin auth => rol dueno.
  const wa = asegurar_aviso_cierre(store.waEnviados, {
    tenantId: "demo",
    cierreId: key,
    fechaJornada: r.cierre.fechaJornada,
    totalCentavos: r.cierre.totalCentavos,
    porMedio: derivar_balance(movimientos()).porMedio,
    tipo: r.cierre.closeType,
    nombreComercio: "Mi comercio",
  });
  return Response.json(
    { fecha_jornada: r.cierre.fechaJornada, total_centavos: r.cierre.totalCentavos.toString(), wa },
    { status: 201 },
  );
};

// GET /api/cash/close?fecha=YYYY-MM-DD — lectura del cierre.
export const GET: APIRoute = async ({ url }) => {
  const fecha = url.searchParams.get("fecha") ?? "";
  const c = store.cierres.get(fecha);
  if (!c) return Response.json({ error: "cierre inexistente" }, { status: 404 });
  return Response.json({ fecha_jornada: c.cierre.fechaJornada, total_centavos: c.cierre.totalCentavos.toString() });
};
