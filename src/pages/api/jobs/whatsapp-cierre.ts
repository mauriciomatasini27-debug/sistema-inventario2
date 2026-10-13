import type { APIRoute } from "astro";
import { z } from "zod";
import { control, store } from "../../../lib/store.js";
import { derivar_balance, type Movimiento } from "../../../modules/cash/caja.js";
import {
  clave_cierre_wa,
  decidir_envio_cierre,
  type TiendaCierreWa,
} from "../../../modules/whatsapp/resumen-cierre.js";
import { cred_wa, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";

export const prerender = false;

// Jornadas ya avisadas por WA en proceso (prod: notification_deliveries por
// idempotencyKey en Drizzle, una por jornada B14.1).
const avisadas: TiendaCierreWa = new Map<string, string>();

const cierreSchema = z.object({
  tenant_id: z.string().min(1),
  fecha_jornada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// POST /api/jobs/whatsapp-cierre — resumen de cierre B14 por WA.
// Solo con X-Job-Secret. Números exactos del snapshot (no recalcula),
// una vez por jornada, solo al Dueño (B14.1/B14.4/B14.5). El email sale por
// POST /api/email/close-summary con el mismo snapshot.
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = cierreSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const { tenant_id: tenantId, fecha_jornada: fechaJornada } = parsed.data;

  const tenant = control.tenants.get(tenantId);
  if (!tenant) return Response.json({ error: "comercio inexistente" }, { status: 404 });
  const cierre = store.cierres.get(fechaJornada);
  if (!cierre) return Response.json({ error: "cierre inexistente" }, { status: 404 });

  // Destinatario: dueño activo con número verificado (B14.4).
  const dueno = [...control.memberships.values()].find(
    (m) => m.tenantId === tenantId && m.rol === "dueno" && m.estado === "activo",
  );
  const link = dueno
    ? [...control.botLinks.entries()].find(([, l]) => l.tenantId === tenantId && l.googleSub === dueno.googleSub && l.estado === "verificado")
    : undefined;
  if (!dueno || !link) return Response.json({ error: "dueno sin numero verificado" }, { status: 422 });

  if (!cred_wa()) return Response.json({ error: "sin_credenciales" }, { status: 502 });

  const movimientos: Movimiento[] = store.movements.map((m) => ({
    tipo: m.tipo,
    metodo: m.metodo,
    monto_centavos: BigInt(m.monto_centavos),
    origen: m.origen as Movimiento["origen"],
  }));
  const d = decidir_envio_cierre(avisadas, {
    snapshot: {
      tenantId,
      cierreId: `cierre:${tenantId}:${fechaJornada}`,
      fechaJornada,
      totalCentavos: cierre.cierre.totalCentavos,
      porMedio: derivar_balance(movimientos).porMedio,
      tipo: cierre.cierre.closeType,
      nombreComercio: tenant.nombreComercio,
    },
    rol: "dueno",
  });
  if (!d.ok) return Response.json({ error: d.motivo }, { status: 409 });
  const enviado = await enviar_texto_wa(link[0], d.resumen.texto);
  if (!enviado) {
    // No se marca: se puede reintentar (la clave se libera).
    avisadas.delete(clave_cierre_wa(tenantId, fechaJornada));
    return Response.json({ error: "fallo_envio" }, { status: 502 });
  }
  return Response.json(
    { fecha_jornada: fechaJornada, estado: "enviado", idempotencyKey: d.resumen.idempotencyKey },
    { status: 200 },
  );
};
