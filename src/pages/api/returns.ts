import type { APIRoute } from "astro";
import { postReturnsSchema } from "../../lib/validation.js";
import { registrar_devolucion, siguiente_numero_devolucion } from "../../modules/sales/devoluciones.js";
import type { Sku } from "../../modules/inventario/inventario.js";
import { idempotency_key_for_return } from "../../modules/fiscal/fiscal.js";
import { decidir_nc } from "../../modules/fiscal/nc.js";
import { desagregar_iva_21 } from "../../modules/fiscal/iva.js";
import { store } from "../../lib/store.js";

export const prerender = false;

// POST /api/returns — devolución interna + NC automática (FE-S14/S15).
// Borde fino: valida, decide devolución pura (tope C14) y NC fiscal (tope
// contra facturado, CbtesAsoc) ANTES de persistir; aplica ambos en un solo
// bloque o no escribe nada. Idempotente por Idempotency-Key (409 con original).
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = postReturnsSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;

  const visto = store.returnVistos.get(key);
  if (visto) {
    return Response.json({ error: "idempotency-key repetida", original: visto }, { status: 409 });
  }

  const venta = [...store.idempotency.values()].find((t) => t.sale_id === b.sale_id);
  if (!venta) return Response.json({ error: "venta inexistente" }, { status: 404 });
  const ventaTotal = BigInt(venta.total_centavos);
  const monto = BigInt(b.monto_centavos);
  let acumuladoPrevio = 0n;
  for (const r of store.returns.values()) {
    if (r.sale_id === b.sale_id) acumuladoPrevio += BigInt(r.total_centavos);
  }

  const dev = registrar_devolucion({
    idempotencyKey: key,
    saleId: b.sale_id,
    ventaTotalCentavos: ventaTotal,
    acumuladoPrevioCentavos: acumuladoPrevio,
    montoCentavos: monto,
    items: b.items.map((it) => ({ sku: it.product_id as Sku, cantidad: it.qty })),
    medio: b.medio,
    fueAcuenta: false,
    motivo: b.motivo,
    actor: b.actor,
    ultimoDevolucion: store.nextReturn > 1 ? { n: store.nextReturn - 1 } : null,
    vistos: new Map(),
  });
  if (!dev.ok) {
    if (dev.codigo === "TOPE_EXCEDIDO") {
      return Response.json(
        { error: "devolución supera el total de la venta", acumulado_centavos: dev.acumuladoCentavos.toString() },
        { status: 422 },
      );
    }
    return Response.json({ error: "devolución inválida" }, { status: 422 });
  }

  // Fiscal: factura origen de la venta (11/6/1). Sin factura → solo interno.
  const factura = [...store.fiscalDocs.values()].find(
    (d) => d.sale_id === b.sale_id && (d.cbte_tipo === "11" || d.cbte_tipo === "6" || d.cbte_tipo === "1"),
  );
  let acumuladoNc = 0n;
  for (const d of store.fiscalDocs.values()) {
    if (d.sale_id === b.sale_id && (d.cbte_tipo === "13" || d.cbte_tipo === "8" || d.cbte_tipo === "3")) {
      acumuladoNc += BigInt(d.imp_total_centavos ?? "0");
    }
  }
  const decision = decidir_nc(
    factura
      ? {
          cbteTipo: Number(factura.cbte_tipo),
          ptoVta: Number(factura.pto_vta),
          cbteNro: factura.cbte_nro,
          estado: factura.estado,
          impTotalCentavos: ventaTotal,
          docTipo: Number(factura.doc_tipo || "99"),
          docNro: factura.doc_nro || "0",
          condIvaReceptor: Number(factura.cond_iva_receptor || "5"),
        }
      : null,
    monto,
    acumuladoNc,
  );
  if (decision.decision === "tope-excedido") {
    return Response.json(
      { error: "NC supera lo facturado", facturado_centavos: decision.facturadoCentavos.toString() },
      { status: 422 },
    );
  }

  // Apply único: devolución + stock compensatorio + caja opuesta.
  const e = dev.efecto;
  const returnId = crypto.randomUUID();
  const numero = siguiente_numero_devolucion(store.nextReturn > 1 ? { n: store.nextReturn - 1 } : null);
  store.nextReturn += 1;
  store.returns.set(returnId, {
    return_id: returnId,
    sale_id: b.sale_id,
    numero_devolucion: numero,
    total_centavos: monto.toString(),
    medio: b.medio,
  });
  store.returnVistos.set(key, { numero_devolucion: numero, sale_id: b.sale_id });
  for (const m of e.movimientosStock) {
    store.stock.set(m.sku, (store.stock.get(m.sku) ?? 0) + Math.abs(m.delta));
    store.stockMoves.push({ idemKey: key, sku: m.sku, loteId: m.loteId, delta: Math.abs(m.delta), tipo: "COMPENSATORIO" });
  }
  if (e.movimientoCaja) {
    store.movements.push({
      id: crypto.randomUUID(),
      tipo: e.movimientoCaja.tipo === "ingreso" ? "ingreso" : "egreso",
      metodo: b.medio,
      monto_centavos: monto.toString(),
      origen: "devolucion",
      sale_id: b.sale_id,
      idempotency_key: key,
    });
  }

  // NC fiscal según decisión (FE-S15: medio de reintegro distinto no cambia el
  // importe; queda auditado en el return con medio original vs elegido).
  let fiscal_estado: string;
  let nc_tipo: number | null = null;
  if (decision.decision === "solo-interno") {
    fiscal_estado = "sin_factura";
  } else if (decision.decision === "esperar-cae") {
    nc_tipo = 13;
    const fkey = `return:${returnId}:espera`;
    const now = new Date();
    const fch = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    store.fiscalDocs.set(fkey, {
      id: crypto.randomUUID(),
      idempotency_key: fkey,
      sale_id: b.sale_id,
      cbte_tipo: String(nc_tipo),
      pto_vta: factura?.pto_vta ?? "3",
      cbte_nro: null,
      cbte_fch: fch,
      doc_tipo: factura?.doc_tipo ?? "99",
      doc_nro: factura?.doc_nro ?? "0",
      cond_iva_receptor: factura?.cond_iva_receptor ?? "5",
      estado: "espera_cae",
      cae: null,
      cae_vto: null,
      qr_payload: null,
      imp_iva_centavos: null,
      alic_iva_id: null,
      client_ocurred_at: b.client_occurred_at,
      venta_leyenda: null,
      imp_total_centavos: monto.toString(),
      return_id: returnId,
      cbtes_asoc_tipo: null,
      cbtes_asoc_pto_vta: null,
      cbtes_asoc_nro: null,
    });
    fiscal_estado = "espera_cae";
  } else {
    nc_tipo = decision.ncTipo;
    const fkey = idempotency_key_for_return(returnId, nc_tipo);
    const now = new Date();
    const fch = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const esConIva = nc_tipo === 8 || nc_tipo === 3;
    let impIva: string | null = null;
    let alicId: string | null = null;
    if (esConIva) {
      const d = desagregar_iva_21(monto);
      if (d) {
        impIva = d.impIvaCentavos.toString();
        alicId = String(d.alicId);
      }
    }
    const facturaDoc = factura!;
    store.fiscalDocs.set(fkey, {
      id: crypto.randomUUID(),
      idempotency_key: fkey,
      sale_id: b.sale_id,
      cbte_tipo: String(nc_tipo),
      pto_vta: facturaDoc.pto_vta,
      cbte_nro: null,
      cbte_fch: fch,
      doc_tipo: facturaDoc.doc_tipo,
      doc_nro: facturaDoc.doc_nro,
      cond_iva_receptor: facturaDoc.cond_iva_receptor,
      estado: "pendiente",
      cae: null,
      cae_vto: null,
      qr_payload: null,
      imp_iva_centavos: impIva,
      alic_iva_id: alicId,
      client_ocurred_at: b.client_occurred_at,
      venta_leyenda: null,
      imp_total_centavos: monto.toString(),
      return_id: returnId,
      cbtes_asoc_tipo: String(decision.cbtesAsoc.tipo),
      cbtes_asoc_pto_vta: String(decision.cbtesAsoc.ptoVta),
      cbtes_asoc_nro: decision.cbtesAsoc.nro,
    });
    fiscal_estado = "pendiente";
  }

  return Response.json(
    {
      return_id: returnId,
      numero_devolucion: numero,
      sale_id: b.sale_id,
      monto_centavos: monto.toString(),
      fiscal_estado,
      nc_tipo,
    },
    { status: 201 },
  );
};
