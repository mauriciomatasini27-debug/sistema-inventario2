import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { store } from "../../../lib/store.js";
import { BaseNoDisponible, intentarLeer } from "../../../lib/server-db.js";
import { customerMovements } from "../../../db/schema-credito.js";
import { UMBRAL_MORA_DIAS, derivar_saldo, dias_atraso } from "../../../modules/credit/saldos.js";

export const prerender = false;

function respuesta(customerId: string, saldo: bigint, diasMax: number, fuente: "db" | "memoria") {
  const enMora = diasMax >= UMBRAL_MORA_DIAS && saldo > 0n;
  return Response.json({
    customer_id: customerId,
    saldo_centavos: saldo.toString(),
    en_mora: enMora,
    dias_max: diasMax,
    umbral_mora_dias: UMBRAL_MORA_DIAS,
    estado: enMora ? "en_mora" : "al_dia",
    fuente,
  });
}

// GET /api/credit/balance?customer_id= — saldo derivado (SUM, no persistido)
// + mora día 15 (Nivel 1): en_mora si alguna deuda tiene 15+ días.
// PERS-S4: con DB viva deriva de customer_movements; sin DB cae a memoria.
export const GET: APIRoute = async ({ url }) => {
  const customerId = url.searchParams.get("customer_id") ?? "";
  if (!customerId) return Response.json({ error: "falta customer_id" }, { status: 422 });
  const hoyMs = Number(url.searchParams.get("hoy_ms") ?? Date.now());
  // PERS2-S2: en multi sin base del tenant no se cae a memoria; 503 central.
  let filas;
  try {
    filas = await intentarLeer((db) =>
      db
        .select({
          debe: customerMovements.debeCentavos,
          haber: customerMovements.haberCentavos,
          ocurridoEn: customerMovements.clientOccurredAt,
        })
        .from(customerMovements)
        .where(eq(customerMovements.customerId, customerId)),
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      return Response.json({ error: "base_no_disponible" }, { status: 503 });
    }
    throw e;
  }
  if (filas) {
    const saldo = derivar_saldo(filas.map((f) => ({ debeCentavos: BigInt(f.debe), haberCentavos: BigInt(f.haber) })));
    let diasMax = 0;
    for (const f of filas) {
      if (BigInt(f.debe) <= 0n) continue;
      const d = dias_atraso(new Date(f.ocurridoEn).getTime(), hoyMs);
      if (d > diasMax) diasMax = d;
    }
    return respuesta(customerId, saldo, diasMax, "db");
  }
  const movs = store.creditMovs.filter((m) => m.customer_id === customerId);
  const saldo = derivar_saldo(movs.map((m) => ({ debeCentavos: BigInt(m.debe), haberCentavos: BigInt(m.haber) })));
  let diasMax = 0;
  for (const m of movs) {
    if (BigInt(m.debe) <= 0n) continue;
    if (typeof m.fecha_ms !== "number") continue;
    const d = dias_atraso(m.fecha_ms, hoyMs);
    if (d > diasMax) diasMax = d;
  }
  return respuesta(customerId, saldo, diasMax, "memoria");
};
