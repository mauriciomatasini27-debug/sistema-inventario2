import type { APIRoute } from "astro";
import { estadoCuenta } from "../../../modules/purchases/facturas.js";
import { normalizarCuit } from "../../../modules/purchases/proveedores.js";
import { store } from "../../../lib/store.js";
import { dbVivaTenant } from "../../../lib/server-db.js";
import { leerFacturasPorCuit, leerPagosPorCuit } from "../../../lib/compras-db.js";

export const prerender = false;

function json(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));
}

// GET /api/supplier-invoices/account?cuit= — estado de cuenta (facturado/pagado/saldo).
// Solo lectura. PERS-S4: DB-first con unión memoria (altas durante cortes) + DB.
// Sin DB o ante error, memoria como antes.
export const GET: APIRoute = async ({ url }) => {
  const cuit = url.searchParams.get("cuit") ?? "";
  if (!cuit) return Response.json({ error: "falta cuit" }, { status: 422 });
  const ncuit = normalizarCuit(cuit);
  const soloMemoria = () =>
    estadoCuenta(ncuit, [...store.facturasProv.values()], [...store.pagosProv.values()]);

  const db = dbVivaTenant();
  if (!db) return Response.json(json(soloMemoria()));

  try {
    const facturas = [...store.facturasProv.values()];
    const vistosF = new Set(facturas.map((f) => f.id));
    for (const f of await leerFacturasPorCuit(db, ncuit)) {
      if (!vistosF.has(f.id)) facturas.push(f);
    }
    const pagos = [...store.pagosProv.values()];
    const vistosP = new Set(pagos.map((p) => p.id));
    for (const p of await leerPagosPorCuit(db, ncuit)) {
      if (!vistosP.has(p.id)) pagos.push(p);
    }
    return Response.json(json(estadoCuenta(ncuit, facturas, pagos)));
  } catch {
    return Response.json(json(soloMemoria()));
  }
};
