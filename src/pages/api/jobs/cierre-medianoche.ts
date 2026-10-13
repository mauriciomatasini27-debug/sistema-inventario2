import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { ejecutar_cierre_medianoche } from "../../../jobs/cierre-medianoche.js";
import type { Movimiento } from "../../../modules/cash/caja.js";

export const prerender = false;

// POST /api/jobs/cierre-medianoche — cierre automático (cron 00:05
// America/Argentina/Buenos_Aires, fuera del repo). Solo con X-Job-Secret.
// Idempotente por jornada (409 el segundo disparo); 422 si hay turno en
// disputa; tras el cierre asegura el aviso WA C10 una sola vez.
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const movimientos: Movimiento[] = store.movements.map((m) => ({
    tipo: m.tipo,
    metodo: m.metodo,
    monto_centavos: BigInt(m.monto_centavos),
    origen: m.origen as Movimiento["origen"],
  }));
  const enDisputa = [...store.turnos.values()].filter((t) => t.estado === "en_disputa").length;
  const r = ejecutar_cierre_medianoche({
    ahora: new Date(),
    movimientos,
    ultimoMovimientoId: store.movements.length ? (store.movements[store.movements.length - 1]?.id ?? null) : null,
    turnosEnDisputa: enDisputa,
    cierres: store.cierres,
    waEnviados: store.waEnviados,
  });
  if (r.status === 201) {
    return Response.json(
      { fecha_jornada: r.fechaJornada, close_type: "automatica", total_centavos: r.totalCentavos, wa: r.wa },
      { status: 201 },
    );
  }
  if (r.status === 409) {
    return Response.json(
      { error: r.error, fecha_jornada: r.fechaJornada, close_type: "automatica", total_centavos: r.totalCentavos, wa: r.wa },
      { status: 409 },
    );
  }
  return Response.json({ error: r.error }, { status: 422 });
};
