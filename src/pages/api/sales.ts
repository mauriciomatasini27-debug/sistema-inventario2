import type { APIRoute } from "astro";
import { postSalesSchema } from "../../lib/validation.js";
import { determinar_clase, idempotency_key_for_sale_tipo, resolver_receptor } from "../../modules/fiscal/fiscal.js";
import { desagregar_iva_21 } from "../../modules/fiscal/iva.js";
// store queda solo por fiscalDocs hasta el cutover fiscal (sección 2 roadmap).
import { store } from "../../lib/store.js";
import { asegurarFiscalDoc } from "../../lib/fiscal-db.js";
import { registrar_venta } from "../../modules/sales/registro_venta.js";
import type { TicketEmitido } from "../../modules/sales/vender_mostrador.js";

export const prerender = false;

// POST /api/sales — borde fino: valida, lee snapshots, delega al núcleo
// vender_mostrador (único dueño del orden idempotencia→FEFO→número→egreso),
// aplica el efecto en un solo bloque o no escribe nada (TV1).
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = postSalesSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;

  // PERS-S1 DB-first: el repo es dueño de snapshot → núcleo → puerta
  // fiscal → 1 tx → espejo memoria. Sin DB (tests/build) resuelve por
  // memoria como antes. La puerta fiscal corre pre-apply para que un 422
  // fiscal no escriba nada (mismo orden histórico).
  const emisor = b.fiscal_emisor_condicion ?? "monotributo";
  const etapa = b.fiscal_emisor_etapa ?? 1;
  const reg = await registrar_venta({
    key,
    lineas: b.lineas,
    medio: b.medio,
    deviceCode: b.device_code,
    seqLocal: b.seq_local,
    offline: b.offline,
    pagos: b.pagos,
    clientOccurredAt: b.client_occurred_at,
    gateFiscal: (total) => {
      const receptor = resolver_receptor({
        totalCentavos: total,
        offline: b.offline,
        cuit: b.fiscal_receptor_cuit,
        condIvaReceptor: b.fiscal_cond_iva_receptor,
      });
      if (!receptor.ok && receptor.codigo !== "en_espera_de_datos") {
        const msg =
          receptor.codigo === "pide_dni"
            ? "venta sobre umbral $10M exige DNI/CUIT del receptor"
            : receptor.codigo === "cuit_invalido"
              ? "CUIT receptor inválido"
              : "condición IVA receptor inválida";
        return { ok: false as const, error: msg };
      }
      const receptorKind =
        b.fiscal_receptor_cuit === undefined
          ? "consumidor_final"
          : b.fiscal_cond_iva_receptor === 1
            ? "responsable_inscripto"
            : "monotributo";
      const clase = determinar_clase(emisor, receptorKind, etapa as 1 | 2 | 3);
      if (receptor.ok && clase === null && !b.offline) {
        return { ok: false as const, error: "clase fiscal no soportada en el slice" };
      }
      return { ok: true as const };
    },
  });
  if (!reg.ok) {
    if (reg.codigo === "YA_VISTA") {
      return Response.json({ error: "idempotency-key repetida", original: aJson(reg.original) }, { status: 409 });
    }
    if (reg.codigo === "YA_VISTA_DB") {
      return Response.json({ error: "idempotency-key repetida", original: reg.original, fuente: "db" }, { status: 409 });
    }
    if (reg.codigo === "PAGOS_NO_SUMAN") {
      return Response.json({ error: "pagos no suman total" }, { status: 422 });
    }
    if (reg.codigo === "FISCAL_RECHAZO") {
      return Response.json({ error: reg.error }, { status: 422 });
    }
    const msg = reg.codigo === "SIN_STOCK" ? "stock insuficiente" : "linea invalida";
    return Response.json({ error: msg }, { status: 422 });
  }
  const { saleId, efecto: e, pagosConId, fuente } = reg.venta;

  // FE-S8: receptor se resuelve ANTES de persistir. pide_dni / CUIT
  // inválido / condición inválida rechazan sin escribir nada. en_espera
  // (offline sobre umbral) se vende igual y queda para FE-E6.
  // La puerta fiscal ya decidió pre-apply con estos mismos inputs; acá no se
  // rechaza porque la venta quedó persistida en registrar_venta.
  const receptor = resolver_receptor({
    totalCentavos: e.ticket.totalCentavos,
    offline: b.offline,
    cuit: b.fiscal_receptor_cuit,
    condIvaReceptor: b.fiscal_cond_iva_receptor,
  });
  // FE-S7: emisor y etapa ya resueltos arriba para la puerta fiscal;
  // acá se recomputan receptor y clase para el doc fiscal (mismas funciones).
  const receptorKind =
    b.fiscal_receptor_cuit === undefined
      ? "consumidor_final"
      : b.fiscal_cond_iva_receptor === 1
        ? "responsable_inscripto"
        : "monotributo";
  const clase = determinar_clase(emisor, receptorKind, etapa as 1 | 2 | 3);
  // A exige CUIT: online sin clase rechaza; offline sin clase se vende igual
  // y queda en_espera_de_datos para completar datos (FE-S23).
  const claseNullOffline = receptor.ok && clase === null && b.offline;

  // Apply y persistencia viven en registrar_venta (PERS-S1).
  // Fiscal (ADR-0019 + FE-S7/S8/S12/S22): pendiente creado en el mismo apply
  // que venta+ticket, con clase y receptor ya resueltos.
  // - en_espera_de_datos (offline sobre umbral): se vende igual y queda en
  //   bandeja Dueño (FE-S23). Se guarda el doc para no perder la venta.
  // - offline con receptor ok: pendiente_de_sync, factura al sync en orden
  //   cronológico con hora servidor (FE-S22). No se numera todavía.
  // - online: pendiente para el worker.
  // Idempotente por sale:{sale_id}:{tipo}: el retry YA_VISTA retorna antes.
  let fiscal_estado: string | null = null;
  const now = new Date();
  const fch = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  function ivaCampos(total: bigint): { imp_iva_centavos: string | null; alic_iva_id: string | null } {
    if (clase !== 6 && clase !== 1) return { imp_iva_centavos: null, alic_iva_id: null };
    const alicId = b.fiscal_alicuota_id ?? 5;
    if (alicId !== 5) return { imp_iva_centavos: null, alic_iva_id: String(alicId) };
    const d = desagregar_iva_21(total);
    if (!d) return { imp_iva_centavos: null, alic_iva_id: String(alicId) };
    return { imp_iva_centavos: d.impIvaCentavos.toString(), alic_iva_id: String(d.alicId) };
  }
  // PERS-S4 G1: fiscal doc DB-first idempotente por idempotency_key
  // (pre-check + onConflictDoNothing, carrera → existente). Espejo memoria
  // tras el insert; sin DB o ante error queda en memoria como antes.
  if (!receptor.ok || claseNullOffline) {
    const fkey = `sale:${saleId}:espera`;
    if (!store.fiscalDocs.has(fkey)) {
      const r = await asegurarFiscalDoc({
        id: crypto.randomUUID(),
        idempotency_key: fkey,
        sale_id: saleId,
        cbte_tipo: String(clase ?? 11),
        pto_vta: "3",
        cbte_nro: null,
        cbte_fch: fch,
        doc_tipo: "99",
        doc_nro: "0",
        cond_iva_receptor: "5",
        estado: "en_espera_de_datos",
        cae: null,
        cae_vto: null,
        qr_payload: null,
        imp_iva_centavos: null,
        alic_iva_id: null,
        client_ocurred_at: b.client_occurred_at,
        venta_leyenda: null,
        imp_total_centavos: e.ticket.totalCentavos.toString(),
      });
      store.fiscalDocs.set(fkey, r.doc);
    }
    fiscal_estado = "en_espera_de_datos";
  } else if (e.ticket.definitivo === null) {
    const fkey = idempotency_key_for_sale_tipo(saleId, clase ?? 11);
    if (!store.fiscalDocs.has(fkey) && e.ticket.totalCentavos > 0n && clase !== null) {
      const iva = ivaCampos(e.ticket.totalCentavos);
      const r = await asegurarFiscalDoc({
        id: crypto.randomUUID(),
        idempotency_key: fkey,
        sale_id: saleId,
        cbte_tipo: String(clase),
        pto_vta: "3",
        cbte_nro: null,
        cbte_fch: fch,
        doc_tipo: String(receptor.docTipo),
        doc_nro: receptor.docNro,
        cond_iva_receptor: String(receptor.condIvaReceptor),
        estado: "pendiente_de_sync",
        cae: null,
        cae_vto: null,
        qr_payload: null,
        imp_iva_centavos: iva.imp_iva_centavos,
        alic_iva_id: iva.alic_iva_id,
        client_ocurred_at: b.client_occurred_at,
        venta_leyenda: null,
        imp_total_centavos: e.ticket.totalCentavos.toString(),
      });
      store.fiscalDocs.set(fkey, r.doc);
    }
    fiscal_estado = "pendiente_de_sync";
  } else if (e.ticket.definitivo && e.ticket.totalCentavos > 0n && clase !== null) {
    const fkey = idempotency_key_for_sale_tipo(saleId, clase);
    if (!store.fiscalDocs.has(fkey)) {
      const iva = ivaCampos(e.ticket.totalCentavos);
      const r = await asegurarFiscalDoc({
        id: crypto.randomUUID(),
        idempotency_key: fkey,
        sale_id: saleId,
        cbte_tipo: String(clase),
        pto_vta: "3",
        cbte_nro: null,
        cbte_fch: fch,
        doc_tipo: String(receptor.docTipo),
        doc_nro: receptor.docNro,
        cond_iva_receptor: String(receptor.condIvaReceptor),
        estado: "pendiente",
        cae: null,
        cae_vto: null,
        qr_payload: null,
        imp_iva_centavos: iva.imp_iva_centavos,
        alic_iva_id: iva.alic_iva_id,
        client_ocurred_at: b.client_occurred_at,
        venta_leyenda: null,
        imp_total_centavos: e.ticket.totalCentavos.toString(),
      });
      store.fiscalDocs.set(fkey, r.doc);
    }
    fiscal_estado = store.fiscalDocs.get(fkey)?.estado ?? "pendiente";
  }
  return Response.json(
    {
      sale_id: saleId,
      ticket_definitivo: e.ticket.definitivo,
      ticket_provisorio: e.ticket.provisorio,
      total_centavos: e.ticket.totalCentavos.toString(),
      sobreventa: e.ticket.sobreventa,
      leyenda: e.ticket.leyenda,
      fiscal_estado,
      fuente,
      pagos: pagosConId.map((p) => ({ medio: p.medio, monto_centavos: String(p.monto_centavos), cash_movement_id: p.cashMovementId })),
    },
    { status: 201 },
  );
};

function aJson(t: TicketEmitido) {
  return {
    ticket_definitivo: t.definitivo,
    ticket_provisorio: t.provisorio,
    total_centavos: t.totalCentavos.toString(),
    sobreventa: t.sobreventa,
    leyenda: t.leyenda,
  };
}
