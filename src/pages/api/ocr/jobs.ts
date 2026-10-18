import type { APIRoute } from "astro";
import { ocrJobSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import {
  buscarJobPorClave,
  crearJobRegistro,
  marcarJobFallo,
  registrarEventoOcr,
  vincularBorradorAlJob,
} from "../../../lib/repos/ocr.js";
import { ingerirBorradorOcrRepo } from "../../../lib/repos/facturas-proveedor.js";
import {
  campos_en_baja,
  confianza_global,
  crear_paddle_cliente,
  resolver_extraccion,
} from "../../../modules/ocr/motor.js";
import { crear_job, type FallbackNubeApi } from "../../../modules/ocr/jobs.js";

export const prerender = false;

// POST /api/ocr/jobs — ingesta WA/Gmail con Idempotency-Key = wamid/message-id.
// E2: clave repetida → 200 con job existente sin reprocesar. E3: no
// comprobante → 415. C1: el job se procesa inline (en_cola → listo); C2 lo
// atiende pg-boss manteniendo este contrato.
// PERS2-S20: jobs y eventos por el repo de OCR; el borrador por facturas-proveedor.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = ocrJobSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;

  try {
    const previo = await buscarJobPorClave(key);
    if (previo) {
      return Response.json({ job_id: previo.id, estado: previo.estado, duplicado: true }, { status: 200 });
    }
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!b.es_comprobante) return Response.json({ error: "adjunto no es comprobante" }, { status: 415 });

  const ahoraIso = new Date().toISOString();
  const jobId = crypto.randomUUID();
  const job = crear_job({
    jobId,
    idempotencyKey: key,
    origen: b.origen,
    bytesRef: b.bytes_ref ?? b.pdf_ref ?? key,
    emisor: b.emisor ?? null,
    ahoraIso,
  });
  // Extracción en orden pdf → OCR → email (ADR-0005). Motor Paddle solo si hay
  // endpoint configurado y no vino texto directo; si falla, E6 local.
  const endpoint = process.env.OCR_PADDLE_ENDPOINT ?? "";
  const motor = endpoint && !b.texto_ocr ? crear_paddle_cliente({ endpoint }) : null;
  const ext = await resolver_extraccion({
    pdfTexto: b.texto_pdf ?? null,
    ocrTextoDirecto: b.texto_ocr ?? null,
    cuerpoEmail: b.cuerpo_email ?? null,
    bytesRef: b.bytes_ref ?? b.pdf_ref ?? key,
    motor,
  });

  try {
    await crearJobRegistro(job);
    const ing = await ingerirBorradorOcrRepo({
      key: `ocr-${jobId}`,
      origen: b.origen,
      bytesRef: b.bytes_ref ?? b.pdf_ref ?? key,
      ...(ext.campos.cuitTexto ? { cuitTexto: ext.campos.cuitTexto } : {}),
      ...(b.nombre_proveedor !== undefined ? { nombreProveedor: b.nombre_proveedor } : {}),
      ...(ext.campos.fechaTexto ? { fechaTexto: ext.campos.fechaTexto } : {}),
      ...(ext.campos.totalTexto ? { totalTexto: ext.campos.totalTexto } : {}),
      confianza: { ...ext.confianza },
      fotoPendiente: b.foto_pendiente,
      ahoraIso,
    });
    if (ing.status === 415 || ing.status === 422) {
      await marcarJobFallo(job, ing.error);
      return Response.json({ error: ing.error }, { status: ing.status });
    }
    if (ing.status === 200) {
      const vinculado = await vincularBorradorAlJob(job, ing.borrador.id, ahoraIso);
      return Response.json({ job_id: jobId, estado: vinculado.estado, duplicado: true }, { status: 200 });
    }
    const borrador = ing.borrador;
    const vinculado = await vincularBorradorAlJob(job, borrador.id, ahoraIso);

    const global = confianza_global(ext.confianza);
    const revisa = global !== "alta" || ext.usoFallbackLocal;
    const fallbackNube: FallbackNubeApi = ext.nubeOfrecida ? "ofrecido" : null;
    await registrarEventoOcr("ocr_borrador_listo", {
      job_id: jobId,
      origen: b.origen,
      confianza_global: global,
      campos_baja: campos_en_baja(ext.confianza),
      fallback_nube: fallbackNube,
      vence_at: borrador.venceAt,
      revisa,
    });
    return Response.json(
      { job_id: jobId, estado: vinculado.estado, borrador_id: borrador.id, confianza_global: global, fallback_nube: fallbackNube, revisa },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
