import type { APIRoute } from "astro";
import { creditSaleSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { rolParaFiado, resolverRolEfectivo } from "../../../lib/control.js";
import { ventaACuenta } from "../../../lib/repos/fiado.js";
import { formatearCentavos } from "../../../lib/panel-modulos.js";
import { UMBRAL_MORA_DIAS, texto_bloqueo_mora } from "../../../modules/credit/saldos.js";
import {
  CODIGO_CONFIRMACION_EXCESO,
  confirmacionDesdeCable,
  dialogo_confirmacion_exceso,
} from "../../../modules/credit/fiado.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  const acceso = rolParaFiado(resolverRolEfectivo(request));
  if (!acceso.ok) return Response.json({ error: acceso.error }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = creditSaleSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  let r: Awaited<ReturnType<typeof ventaACuenta>>;
  try {
    r = await ventaACuenta({
      key,
      customerId: b.customer_id,
      lineas: b.lineas.map((l) => ({ sku: l.product_id, qty: l.qty, precioCentavos: l.precio_centavos })),
      deviceCode: b.device_code,
      seqLocal: b.seq_local,
      rol: acceso.rol,
      confirmacion: confirmacionDesdeCable(b.confirmado_exceso),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok && r.codigo === "TOPE_SUPERADO" && "disponibleCentavos" in r) {
    return Response.json(
      {
        error: `Supera el tope. Disponible: ${formatearCentavos(r.disponibleCentavos)}. Cobrá con otro medio o pedile al dueño.`,
        codigo: "TOPE_SUPERADO",
        disponible_centavos: r.disponibleCentavos.toString(),
      },
      { status: 403 },
    );
  }
  if (!r.ok && r.codigo === CODIGO_CONFIRMACION_EXCESO && "superaTope" in r) {
    const dialogo = dialogo_confirmacion_exceso({
      superaTope: r.superaTope,
      superaMora: r.superaMora,
      disponibleTexto: r.disponibleCentavos === null ? null : formatearCentavos(r.disponibleCentavos),
      diasMax: r.diasMax,
    });
    return Response.json(
      {
        error: dialogo.mensaje,
        codigo: CODIGO_CONFIRMACION_EXCESO,
        confirmacion: dialogo,
        supera_tope: r.superaTope,
        supera_mora: r.superaMora,
        disponible_centavos: r.disponibleCentavos === null ? null : r.disponibleCentavos.toString(),
        dias_max: r.diasMax,
      },
      { status: r.status },
    );
  }
  if (!r.ok && r.codigo === "MORA" && "diasMax" in r) {
    return Response.json(
      {
        error: texto_bloqueo_mora(r.diasMax),
        codigo: "MORA",
        dias_max: r.diasMax,
        umbral_mora_dias: UMBRAL_MORA_DIAS,
      },
      { status: 403 },
    );
  }
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json(
    {
      ticket_definitivo: r.ticketDefinitivo,
      total_centavos: r.totalCentavos,
      fuente: "db",
      supera_mora: r.superaMora,
      supera_tope: r.superaTope,
    },
    { status: 201 },
  );
};
