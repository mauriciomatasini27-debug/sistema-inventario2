import type { APIRoute } from "astro";
import { postSalesSchema } from "../../lib/validation.js";
import { determinar_clase, idempotency_key_for_sale_tipo, resolver_receptor } from "../../modules/fiscal/fiscal.js";
import { z } from "zod";
import {
  calcular_fes12,
  desagregar_iva_21,
  debe_encolar_factura_fes12,
  serializar_meta_fes12,
  type EntradaCalculoFeS12,
} from "../../modules/fiscal/iva.js";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { asegurarDoc, buscarDocPorKey } from "../../lib/repos/fiscal.js";
import { tenantDeRequest } from "../../lib/tenant-context.js";
import { registrar_venta } from "../../modules/sales/registro_venta.js";
import type { TicketEmitido } from "../../modules/sales/vender_mostrador.js";

export const prerender = false;

// FE-S12: detalle opcional de promos/combos. No está en postSalesSchema hasta
// ampliar validation.ts; se valida acá para no perder el total cobrado.
const fiscalFeS12Schema = z.object({
  productos: z
    .array(
      z.object({
        etiqueta: z.string().min(1).max(120),
        cantidad: z.number().int().min(1).max(999),
        precio_lista_centavos: z.number().int().min(0),
        alic_iva_id: z.number().int().min(1).max(9).optional(),
      }),
    )
    .min(1)
    .max(50)
    .optional(),
  promo: z
    .object({
      etiqueta: z.string().min(1).max(120),
      ahorro_centavos: z.number().int().positive(),
    })
    .optional(),
  combo: z
    .object({
      nombre: z.string().min(1).max(120),
      total_cobrado_centavos: z.number().int().positive(),
      componentes: z
        .array(
          z.object({
            etiqueta: z.string().min(1).max(120),
            precio_lista_centavos: z.number().int().min(0),
            alic_iva_id: z.number().int().min(1).max(9).optional(),
          }),
        )
        .min(1)
        .max(20),
    })
    .optional(),
});

function leerEntradaFeS12(body: unknown, totalCentavos: bigint): EntradaCalculoFeS12 | null {
  if (!body || typeof body !== "object") return null;
  const crudo = (body as { fiscal_fes12?: unknown }).fiscal_fes12;
  const parsed = fiscalFeS12Schema.safeParse(crudo);
  if (!parsed.success) return null;
  const f = parsed.data;
  const productos =
    f.productos?.map((p) => ({
      etiqueta: p.etiqueta,
      cantidad: p.cantidad,
      precioListaCentavos: BigInt(p.precio_lista_centavos),
      alicIvaId: p.alic_iva_id ?? 5,
    })) ?? [];
  if (productos.length === 0 && !f.combo) return null;
  return {
    totalCobradoCentavos: totalCentavos,
    productos,
    ...(f.promo
      ? { promo: { etiqueta: f.promo.etiqueta, ahorroCentavos: BigInt(f.promo.ahorro_centavos) } }
      : {}),
    ...(f.combo
      ? {
          combo: {
            nombre: f.combo.nombre,
            totalCobradoCentavos: BigInt(f.combo.total_cobrado_centavos),
            componentes: f.combo.componentes.map((c) => ({
              etiqueta: c.etiqueta,
              precioListaCentavos: BigInt(c.precio_lista_centavos),
              alicIvaId: c.alic_iva_id ?? 5,
            })),
          },
        }
      : {}),
  };
}

export { debe_encolar_factura_fes12 };

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
  // ISO-S3: el doc fiscal se estampa con el tenant del contexto.
  const tenantResuelto = tenantDeRequest(request);
  const tenantId = tenantResuelto.ok ? tenantResuelto.tenantId : undefined;

  // PERS-S1 DB-first: el repo es dueño de snapshot → núcleo → puerta
  // fiscal → 1 tx → espejo memoria. Sin DB (tests/build) resuelve por
  // memoria como antes. La puerta fiscal corre pre-apply para que un 422
  // fiscal no escriba nada (mismo orden histórico).
  const emisor = b.fiscal_emisor_condicion ?? "monotributo";
  const etapa = b.fiscal_emisor_etapa ?? 1;
  let reg: Awaited<ReturnType<typeof registrar_venta>>;
  try {
    reg = await registrar_venta({
    key,
    lineas: b.lineas.map((l) => ({
      product_id: l.product_id,
      qty: l.qty,
      precio_centavos: l.precio_centavos,
      ...(l.alta !== undefined ? { alta: l.alta } : {}),
    })),
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
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
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
  function camposFiscales(total: bigint): {
    imp_iva_centavos: string | null;
    alic_iva_id: string | null;
    venta_leyenda: string | null;
  } {
    const entradaFeS12 = leerEntradaFeS12(body, total);
    if (entradaFeS12) {
      const r = calcular_fes12(entradaFeS12);
      if (r.ok) {
        const alicId = r.desglose.alicIva.length === 1 ? String(r.desglose.alicIva[0]?.id ?? 5) : "multi";
        return {
          imp_iva_centavos: r.desglose.impIvaCentavos.toString(),
          alic_iva_id: alicId,
          venta_leyenda: serializar_meta_fes12(r.desglose),
        };
      }
    }
    if (clase !== 6 && clase !== 1) return { imp_iva_centavos: null, alic_iva_id: null, venta_leyenda: null };
    const alicId = b.fiscal_alicuota_id ?? 5;
    if (alicId !== 5) return { imp_iva_centavos: null, alic_iva_id: String(alicId), venta_leyenda: null };
    const d = desagregar_iva_21(total);
    if (!d) return { imp_iva_centavos: null, alic_iva_id: String(alicId), venta_leyenda: null };
    return {
      imp_iva_centavos: d.impIvaCentavos.toString(),
      alic_iva_id: String(d.alicId),
      venta_leyenda: null,
    };
  }
  // PERS2-S26: fiscal doc idempotente por idempotency_key en el repo fiscal
  // (pre-check + onConflictDoNothing, carrera → existente). Espejo memoria
  // tras el insert; sin DB queda en memoria como antes.
  if (!receptor.ok || claseNullOffline) {
    const fkey = `sale:${saleId}:espera`;
    if (!(await buscarDocPorKey(fkey))) {
      await asegurarDoc({
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
      }, tenantId);
    }
    fiscal_estado = "en_espera_de_datos";
  } else if (e.ticket.definitivo === null) {
    const fkey = idempotency_key_for_sale_tipo(saleId, clase ?? 11);
    if (!(await buscarDocPorKey(fkey)) && e.ticket.totalCentavos > 0n && clase !== null) {
      const fiscal = camposFiscales(e.ticket.totalCentavos);
      await asegurarDoc({
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
        imp_iva_centavos: fiscal.imp_iva_centavos,
        alic_iva_id: fiscal.alic_iva_id,
        client_ocurred_at: b.client_occurred_at,
        venta_leyenda: fiscal.venta_leyenda,
        imp_total_centavos: e.ticket.totalCentavos.toString(),
      }, tenantId);
    }
    fiscal_estado = "pendiente_de_sync";
  } else if (e.ticket.definitivo && e.ticket.totalCentavos > 0n && clase !== null) {
    const fkey = idempotency_key_for_sale_tipo(saleId, clase);
    if (!(await buscarDocPorKey(fkey))) {
      const fiscal = camposFiscales(e.ticket.totalCentavos);
      await asegurarDoc({
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
        imp_iva_centavos: fiscal.imp_iva_centavos,
        alic_iva_id: fiscal.alic_iva_id,
        client_ocurred_at: b.client_occurred_at,
        venta_leyenda: fiscal.venta_leyenda,
        imp_total_centavos: e.ticket.totalCentavos.toString(),
      }, tenantId);
    }
    fiscal_estado = (await buscarDocPorKey(fkey))?.estado ?? "pendiente";
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
