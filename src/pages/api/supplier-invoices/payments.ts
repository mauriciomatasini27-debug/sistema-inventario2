import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { supplierPaymentSchema, type Medio } from "../../../lib/validation.js";
import {
  registrarPago,
  type EgresoCajaDescriptor,
  type Factura,
  type PagoProveedor,
  type RegistrarPagoInput,
} from "../../../modules/purchases/facturas.js";
import { normalizarCuit } from "../../../modules/purchases/proveedores.js";
import { store } from "../../../lib/store.js";
import {
  dbViva,
  leerFacturaPorId,
  leerPagoPorKey,
  leerPagosPorCuit,
  type TenantDb,
} from "../../../lib/compras-db.js";
import { supplierInvoices, supplierPayments } from "../../../db/schema-proveedores.js";

export const prerender = false;

function espejo(pago: PagoProveedor, egreso: EgresoCajaDescriptor): void {
  store.pagosProv.set(pago.idempotencyKey, pago);
  store.movements.push({
    id: crypto.randomUUID(),
    tipo: egreso.tipo,
    metodo: egreso.metodo,
    monto_centavos: egreso.montoCentavos.toString(),
    origen: "retiro",
    idempotency_key: pago.idempotencyKey,
  });
}

// POST /api/supplier-invoices/payments — pago a proveedor + egreso caja (FP5).
// Pago que excede el saldo se rechaza 422 en el núcleo.
// PERS-S4: DB-first. Pre-check por idempotency-key → 409 real aunque la memoria
// esté fría (el cuerpo se compara con el dominio para distinguir repetida de
// distinto cuerpo); espejo memoria tras el insert. El egreso en caja sigue en
// memoria hasta el slice de caja, que lo hará durable. Sin DB o ante error,
// la vía memoria histórica resuelve igual que antes.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = supplierPaymentSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const ahoraIso = new Date().toISOString();
  const cuit = normalizarCuit(b.supplier_cuit);

  const db = dbViva();
  if (!db) {
    return viaMemoria(b.factura_id, key, cuit, b, ahoraIso, [...store.pagosProv.values()]);
  }

  try {
    const factura =
      b.factura_id !== undefined
        ? ((store.facturasProv.get(b.factura_id) ??
            (await leerFacturaPorId(db, b.factura_id))?.factura) ??
          null)
        : null;
    if (b.factura_id !== undefined && !factura) {
      return Response.json({ error: "factura inexistente" }, { status: 404 });
    }
    const pagosPrevios = [...store.pagosProv.values()];
    const vistosP = new Set(pagosPrevios.map((p) => p.id));
    for (const p of await leerPagosPorCuit(db, cuit)) {
      if (!vistosP.has(p.id)) pagosPrevios.push(p);
    }
    const input: RegistrarPagoInput = {
      idempotencyKey: key,
      ...(factura ? { factura } : {}),
      supplierCuit: cuit,
      montoCentavos: BigInt(b.monto_centavos),
      metodo: b.metodo,
      fechaIso: b.fecha_iso,
      creadoPor: b.creado_por,
      ahoraIso,
      vistos: store.pagosProv,
      pagosPrevios,
    };
    const r = registrarPago(input);
    if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });

    // Pre-check: replay en frío responde 409 con el mensaje exacto del dominio
    // (re-evalúa contra la fila durable como vistos).
    const previo = await leerPagoPorKey(db, key);
    if (previo) {
      const r2 = registrarPago({
        ...input,
        vistos: new Map([[key, previo.pago]]),
      });
      return Response.json({ error: r2.status !== 201 ? r2.error : "idempotency-key repetida" }, { status: 409 });
    }

    const filas = await db
      .insert(supplierPayments)
      .values({
        idempotencyKey: key,
        facturaId: factura ? await facturaUuid(db, factura) : null,
        supplierCuit: r.pago.supplierCuit,
        montoCentavos: r.pago.montoCentavos,
        metodo: r.pago.metodo,
        categoriaId: "pago_proveedor",
        creadoPor: r.pago.creadoPor,
        createdAt: new Date(r.pago.creadoEn),
      })
      .onConflictDoNothing({ target: supplierPayments.idempotencyKey })
      .returning({ id: supplierPayments.id });
    if (!filas[0]) {
      // Carrera entre pre-check e insert: 409 con el mensaje del dominio.
      const rival = await leerPagoPorKey(db, key);
      const r2 = registrarPago({
        ...input,
        vistos: new Map(rival ? [[key, rival.pago]] : []),
      });
      return Response.json({ error: r2.status !== 201 ? r2.error : "idempotency-key repetida" }, { status: 409 });
    }
    espejo(r.pago, r.egresoCaja);
    return Response.json(
      { pago_id: r.pago.id, monto_centavos: r.pago.montoCentavos.toString(), fuente: "db" },
      { status: 201 },
    );
  } catch {
    return viaMemoria(b.factura_id, key, cuit, b, ahoraIso, [...store.pagosProv.values()]);
  }
};

async function facturaUuid(db: TenantDb, factura: Factura): Promise<string | null> {
  const filas = await db
    .select({ id: supplierInvoices.id })
    .from(supplierInvoices)
    .where(eq(supplierInvoices.idempotencyKey, factura.idempotencyKey))
    .limit(1);
  return filas[0]?.id ?? null;
}

function viaMemoria(
  facturaId: string | undefined,
  key: string,
  cuit: string,
  b: { monto_centavos: number; metodo: Medio; fecha_iso: string; creado_por: string },
  ahoraIso: string,
  pagosPrevios: PagoProveedor[],
): Response {
  const factura = facturaId !== undefined ? (store.facturasProv.get(facturaId) ?? null) : null;
  if (facturaId !== undefined && !factura) {
    return Response.json({ error: "factura inexistente" }, { status: 404 });
  }
  const r = registrarPago({
    idempotencyKey: key,
    ...(factura ? { factura } : {}),
    supplierCuit: cuit,
    montoCentavos: BigInt(b.monto_centavos),
    metodo: b.metodo,
    fechaIso: b.fecha_iso,
    creadoPor: b.creado_por,
    ahoraIso,
    vistos: store.pagosProv,
    pagosPrevios,
  });
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
  espejo(r.pago, r.egresoCaja);
  return Response.json({ pago_id: r.pago.id, monto_centavos: r.pago.montoCentavos.toString() }, { status: 201 });
}
