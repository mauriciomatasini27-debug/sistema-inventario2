import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { leerCierre, listarMovimientos } from "../../../lib/repos/caja.js";
import { reclamadorDb } from "../../../lib/repos/notification-deliveries.js";
import { derivar_balance, type Movimiento } from "../../../modules/cash/caja.js";
import {
  clave_cierre_wa,
  decidir_envio_cierre,
  PLANTILLA_CIERRE_CAJA,
} from "../../../modules/whatsapp/resumen-cierre.js";
import { cred_wa, enviar_texto_wa } from "../../../jobs/whatsapp-adaptador.js";

export const prerender = false;

const cierreSchema = z.object({
  tenant_id: z.string().min(1),
  fecha_jornada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// POST /api/jobs/whatsapp-cierre — resumen de cierre B14 por WA.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(
    request,
    async () => {
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
      const cierre = await leerCierre(fechaJornada);
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

      const movs = await listarMovimientos();
      const movimientos: Movimiento[] = movs.map((m) => ({
        tipo: m.tipo,
        metodo: m.metodo,
        monto_centavos: BigInt(m.monto_centavos),
        origen: m.origen as Movimiento["origen"],
      }));
      const tienda = reclamadorDb(tenantId, dueno.googleSub, "whatsapp");
      const d = await decidir_envio_cierre(tienda, {
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
      const enviado = await enviar_texto_wa(link[0], d.resumen.texto, { nombrePlantilla: PLANTILLA_CIERRE_CAJA });
      if (!enviado) {
        // No se marca: se puede reintentar (la clave se libera).
        await tienda.liberar(clave_cierre_wa(tenantId, fechaJornada));
        return Response.json({ error: "fallo_envio" }, { status: 502 });
      }
      return Response.json(
        { fecha_jornada: fechaJornada, estado: "enviado", idempotencyKey: d.resumen.idempotencyKey },
        { status: 200 },
      );
    },
    { fanOut: false },
  );
};
