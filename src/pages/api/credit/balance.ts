import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { UMBRAL_MORA_DIAS, saldoCliente } from "../../../lib/repos/fiado.js";

export const prerender = false;

function respuesta(customerId: string, saldo: Awaited<ReturnType<typeof saldoCliente>>) {
  const centavos = BigInt(saldo.saldoCentavos);
  const enMora = saldo.diasMax >= UMBRAL_MORA_DIAS && centavos > 0n;
  return Response.json({
    customer_id: customerId,
    saldo_centavos: saldo.saldoCentavos,
    en_mora: enMora,
    dias_max: saldo.diasMax,
    umbral_mora_dias: UMBRAL_MORA_DIAS,
    estado: enMora ? "en_mora" : "al_dia",
    fuente: saldo.fuente,
    existe: saldo.existe,
    sin_tope: saldo.sinTope,
    tope_centavos: saldo.topeCentavos,
    disponible_centavos: saldo.disponibleCentavos,
  });
}

// GET /api/credit/balance?customer_id= — saldo derivado (SUM, no persistido)
// + mora día 15 (Nivel 1): en_mora si alguna deuda tiene 15+ días.
// PERS2-S17: con DB viva deriva de customer_movements via repo de fiado; sin
// DB cae a memoria. En multi sin base del tenant no se cae a memoria; 503.
export const GET: APIRoute = async ({ url }) => {
  const customerId = url.searchParams.get("customer_id") ?? "";
  if (!customerId) return Response.json({ error: "falta customer_id" }, { status: 422 });
  const hoyMs = Number(url.searchParams.get("hoy_ms") ?? Date.now());
  let saldo: Awaited<ReturnType<typeof saldoCliente>>;
  try {
    saldo = await saldoCliente(customerId, hoyMs);
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      return Response.json({ error: "base_no_disponible" }, { status: 503 });
    }
    throw e;
  }
  return respuesta(customerId, saldo);
};
