import type { APIRoute } from "astro";
import { postNdSchema } from "../../../lib/validation.js";
import { idempotency_key_for_nd } from "../../../modules/fiscal/fiscal.js";
import { decidir_nd } from "../../../modules/fiscal/nd.js";
import { desagregar_iva_21 } from "../../../modules/fiscal/iva.js";
import { tenantDeRequest } from "../../../lib/tenant-context.js";
import {
  asegurarDoc,
  buscarFacturaParaNd,
  buscarNdPrevio,
  hayCobroParaVenta,
} from "../../../lib/repos/fiscal.js";

export const prerender = false;

// Vinculada a factura 11/6/1 autorizada con CbtesAsoc + caja asociada si hubo cobro.
// PERS2-S8: el repo fiscal resuelve DB-first. El header Idempotency-Key es la
// idempotencia real: la clave repetida responde 409 aunque la memoria esté
// fría. La factura y el cobro se leen en unión (memoria caliente + DB fría).
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
  const tenantResuelto = tenantDeRequest(request);
  const tenantId = tenantResuelto.ok ? tenantResuelto.tenantId : undefined;

  // factura haya cambiado de estado (frío) entre el POST y el replay.
  const memPrevio = await buscarNdPrevio(key);
  if (memPrevio) {
    return Response.json(
      { error: "idempotency-key repetida", original: { nd_id: memPrevio.id, fiscal_estado: memPrevio.estado, nd_tipo: Number(memPrevio.cbte_tipo) } },
      { status: 409 },
    );
  }

  const factura = await buscarFacturaParaNd(b.factura_sale_id, tenantId);
  const huboCobro = await hayCobroParaVenta(b.factura_sale_id);
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
    const r = await asegurarDoc(doc, tenantId);
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
  const r = await asegurarDoc(doc, tenantId);
  if (r.fuente === "existe") {
    return Response.json(
      { error: "idempotency-key repetida", original: { nd_id: r.doc.id, fiscal_estado: r.doc.estado, nd_tipo: Number(r.doc.cbte_tipo) } },
      { status: 409 },
    );
  }
  return Response.json({ nd_id: ndId, fiscal_estado: "pendiente", nd_tipo: ndTipo }, { status: 201 });
};
