import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { postNdSchema } from "../../../lib/validation.js";
import { idempotency_key_for_nd } from "../../../modules/fiscal/fiscal.js";
import { decidir_nd } from "../../../modules/fiscal/nd.js";
import { desagregar_iva_21 } from "../../../modules/fiscal/iva.js";
import { store } from "../../../lib/store.js";
import { tenantDeRequest } from "../../../lib/tenant-context.js";
import {
  asegurarFiscalDoc,
  dbViva,
  leerFiscalDocs,
  leerNdPorHeaderKey,
  unionFiscalDocs,
} from "../../../lib/fiscal-db.js";
import { cashMovements } from "../../../db/schema.js";

export const prerender = false;

// POST /api/fiscal/nd — ND manual solo Dueño (FE-S16, slice homo).
// Slice-0: sin sesión exige header X-Rol: dueno (empleado → 403).
// Vinculada a factura 11/6/1 autorizada con CbtesAsoc + caja asociada si hubo cobro.
// PERS-S4 G2a: DB-first. El header Idempotency-Key es la idempotencia real:
// la clave repetida responde 409 aunque la memoria esté fría. La factura y el
// cobro se leen en unión (memoria caliente + DB fría). Espejo memoria tras el
// insert; sin DB o ante caída, la vía memoria histórica resuelve igual.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  const rol = request.headers.get("X-Rol") ?? "dueno";
  if (rol !== "dueno") return Response.json({ error: "Solo el dueño puede emitir ND." }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = postNdSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  // ISO-S3: el doc fiscal se estampa con el tenant del contexto.
  const tenantResuelto = tenantDeRequest(request);
  const tenantId = tenantResuelto.ok ? tenantResuelto.tenantId : undefined;

  // Pre-check por prefijo ANTES de decidir la rama: el replay choca aunque la
  // factura haya cambiado de estado (frío) entre el POST y el replay.
  const prefijo = `nd:${key}:`;
  const memPrevio = [...store.fiscalDocs.values()].find((d) => d.idempotency_key.startsWith(prefijo));
  if (memPrevio) {
    return Response.json(
      { error: "idempotency-key repetida", original: { nd_id: memPrevio.id, fiscal_estado: memPrevio.estado, nd_tipo: Number(memPrevio.cbte_tipo) } },
      { status: 409 },
    );
  }
  const db = dbViva();
  if (db) {
    try {
      const previoDb = await leerNdPorHeaderKey(db, key);
      if (previoDb) {
        store.fiscalDocs.set(previoDb.idempotency_key, previoDb);
        return Response.json(
          { error: "idempotency-key repetida", original: { nd_id: previoDb.id, fiscal_estado: previoDb.estado, nd_tipo: Number(previoDb.cbte_tipo) } },
          { status: 409 },
        );
      }
    } catch {
      // Caída de DB en el pre-check: se sigue a la vía memoria.
    }
  }

  const memDocs = [...store.fiscalDocs.values()];
  let factura = memDocs.find(
    (d) => d.sale_id === b.factura_sale_id && (d.cbte_tipo === "11" || d.cbte_tipo === "6" || d.cbte_tipo === "1"),
  );
  let huboCobro = [...store.movements.values()].some((m) => m.sale_id === b.factura_sale_id);
  if ((!factura || !huboCobro) && db) {
    try {
      const dbDocs = await leerFiscalDocs(tenantId);
      if (dbDocs) {
        const union = unionFiscalDocs(memDocs, dbDocs);
        factura ??= union.find(
          (d) => d.sale_id === b.factura_sale_id && (d.cbte_tipo === "11" || d.cbte_tipo === "6" || d.cbte_tipo === "1"),
        );
      }
      if (!huboCobro) {
        const cobros = await db
          .select({ id: cashMovements.id })
          .from(cashMovements)
          .where(eq(cashMovements.saleId, b.factura_sale_id))
          .limit(1);
        huboCobro = cobros.length > 0;
      }
    } catch {
      // Caída de DB en lecturas: se sigue con lo que vio la memoria.
    }
  }
  const decision = decidir_nd(
    factura
      ? { cbteTipo: Number(factura.cbte_tipo), ptoVta: Number(factura.pto_vta), cbteNro: factura.cbte_nro, estado: factura.estado }
      : null,
    { tieneCajaAsociada: b.caja_movement_id !== undefined, huboCobro },
  );
  if (decision.decision === "sin-factura") return Response.json({ error: "venta sin factura fiscal" }, { status: 422 });
  if (decision.decision === "falta-caja") return Response.json({ error: decision.motivo }, { status: 422 });

  const monto = BigInt(b.monto_centavos);
  const now = new Date();
  const fch = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const ndId = crypto.randomUUID();
  // La idempotencia la da el header, no el nd_id (antes cada POST creaba un
  // doc nuevo aunque repitiera la clave).
  const fkey =
    decision.decision === "esperar-cae" ? `nd:${key}:espera` : idempotency_key_for_nd(key, decision.ndTipo);

  if (decision.decision === "esperar-cae") {
    const doc = {
      id: crypto.randomUUID(),
      idempotency_key: fkey,
      sale_id: b.factura_sale_id,
      cbte_tipo: "12",
      pto_vta: factura?.pto_vta ?? "3",
      cbte_nro: null,
      cbte_fch: fch,
      doc_tipo: factura?.doc_tipo ?? "99",
      doc_nro: factura?.doc_nro ?? "0",
      cond_iva_receptor: factura?.cond_iva_receptor ?? "5",
      estado: "espera_cae" as const,
      cae: null,
      cae_vto: null,
      qr_payload: null,
      imp_total_centavos: monto.toString(),
      client_ocurred_at: b.client_occurred_at,
    };
    const r = await asegurarFiscalDoc(doc, tenantId);
    store.fiscalDocs.set(fkey, r.doc);
    if (r.fuente === "existe") {
      return Response.json(
        { error: "idempotency-key repetida", original: { nd_id: r.doc.id, fiscal_estado: r.doc.estado, nd_tipo: Number(r.doc.cbte_tipo) } },
        { status: 409 },
      );
    }
    return Response.json({ nd_id: ndId, fiscal_estado: "espera_cae", nd_tipo: 12 }, { status: 201 });
  }

  const ndTipo = decision.ndTipo;
  const esConIva = ndTipo === 7 || ndTipo === 2;
  let impIva: string | null = null;
  let alicId: string | null = null;
  if (esConIva) {
    const d = desagregar_iva_21(monto);
    if (d) {
      impIva = d.impIvaCentavos.toString();
      alicId = String(d.alicId);
    }
  }
  const f = factura!;
  const doc = {
    id: crypto.randomUUID(),
    idempotency_key: fkey,
    sale_id: b.factura_sale_id,
    cbte_tipo: String(ndTipo),
    pto_vta: f.pto_vta,
    cbte_nro: null,
    cbte_fch: fch,
    doc_tipo: f.doc_tipo,
    doc_nro: f.doc_nro,
    cond_iva_receptor: f.cond_iva_receptor,
    estado: "pendiente" as const,
    cae: null,
    cae_vto: null,
    qr_payload: null,
    imp_iva_centavos: impIva,
    alic_iva_id: alicId,
    client_ocurred_at: b.client_occurred_at,
    imp_total_centavos: monto.toString(),
    cbtes_asoc_tipo: String(decision.cbtesAsoc.tipo),
    cbtes_asoc_pto_vta: String(decision.cbtesAsoc.ptoVta),
    cbtes_asoc_nro: decision.cbtesAsoc.nro,
  };
  const r = await asegurarFiscalDoc(doc, tenantId);
  store.fiscalDocs.set(fkey, r.doc);
  if (r.fuente === "existe") {
    return Response.json(
      { error: "idempotency-key repetida", original: { nd_id: r.doc.id, fiscal_estado: r.doc.estado, nd_tipo: Number(r.doc.cbte_tipo) } },
      { status: 409 },
    );
  }
  return Response.json({ nd_id: ndId, fiscal_estado: "pendiente", nd_tipo: ndTipo }, { status: 201 });
};
