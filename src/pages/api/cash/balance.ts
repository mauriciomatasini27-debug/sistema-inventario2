import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { derivar_balance, type OrigenMov } from "../../../modules/cash/caja.js";
import { cashMovements } from "../../../db/schema.js";
import { store } from "../../../lib/store.js";
import { intentarLeer } from "../../../lib/server-db.js";
import type { Medio } from "../../../lib/validation.js";

export const prerender = false;

const MEDIOS: Medio[] = ["Efectivo", "Debito", "Mercado Pago", "QR", "Transferencia"];

// GET /api/cash/balance — saldos derivados, sin persistir (C6 ADR-0004).
// PERS-S3: con DB viva cuadra con SUM por medio desde cash_movements;
// sin DB cae a memoria. Nunca caché manual: siempre derivado.
export const GET: APIRoute = async () => {
  const filas = await intentarLeer((db) =>
    db
      .select({
        metodo: cashMovements.metodo,
        suma: sql<string | null>`sum(case when ${cashMovements.tipo} = 'ingreso' then ${cashMovements.montoCentavos} else -${cashMovements.montoCentavos} end)`,
      })
      .from(cashMovements)
      .groupBy(cashMovements.metodo),
  );
  if (filas) {
    const porMedio = Object.fromEntries(MEDIOS.map((m) => [m, 0n])) as Record<Medio, bigint>;
    let total = 0n;
    for (const f of filas) {
      const v = BigInt(f.suma ?? 0);
      if ((MEDIOS as string[]).includes(f.metodo)) porMedio[f.metodo as Medio] += v;
      total += v;
    }
    return Response.json({
      por_medio: Object.fromEntries(Object.entries(porMedio).map(([k, v]) => [k, v.toString()])),
      total: total.toString(),
      fuente: "db",
    });
  }
  const movs = store.movements.map((m) => ({
    tipo: m.tipo,
    metodo: m.metodo,
    monto_centavos: BigInt(m.monto_centavos),
    origen: m.origen as OrigenMov,
  }));
  const b = derivar_balance(movs);
  return Response.json({
    por_medio: Object.fromEntries(Object.entries(b.porMedio).map(([k, v]) => [k, v.toString()])),
    total: b.total.toString(),
    fuente: "memoria",
  });
};
