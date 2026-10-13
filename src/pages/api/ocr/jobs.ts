import type { APIRoute } from "astro";
import { ocrJobSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { ingerirBorrador } from "../../../modules/purchases/facturas.js";
import {
  campos_en_baja,
  confianza_global,
  crear_paddle_cliente,
  resolver_extraccion,
} from "../../../modules/ocr/motor.js";
import { con_borrador, crear_job } from "../../../modules/ocr/jobs.js";

export const prerender = false;

// POST /api/ocr/jobs — ingesta WA/Gmail con Idempotency-Key = wamid/message-id.
// E2: clave repetida → 200 con job existente sin reprocesar. E3: no
// comprobante → 415. C1: el job se procesa inline (en_cola → listo); C2 lo
// atiende pg-boss manteniendo este contrato.
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

  const previoId = store.ocrJobsByKey.get(key);
  if (previoId) {
    const previo = store.ocrJobs.get(previoId);
    if (previo) return Response.json({ job_id: previo.id, estado: previo.estado, duplicado: true }, { status: 200 });
  }
  if (!b.es_comprobante) return Response.json({ error: "adjunto no es comprobante" }, { status: 415 });

  const ahoraIso = new Date().toISOString();
  const jobId = crypto.randomUUID();
  let job = crear_job({
    jobId,
    idempotencyKey: key,
    origen: b.origen,
    bytesRef: b.bytes_ref ?? b.pdf_ref ?? key,
    emisor: b.emisor ?? null,
    ahoraIso,
  });
  store.ocrJobs.set(jobId, job);
  store.ocrJobsByKey.set(key, jobId);

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

  const ing = ingerirBorrador({
    idempotencyKey: `ocr-${jobId}`,
    origen: b.origen,
    bytesRef: b.bytes_ref ?? b.pdf_ref ?? key,
    esComprobante: true,
    ...(ext.campos.cuitTexto ? { cuitTexto: ext.campos.cuitTexto } : {}),
    ...(b.nombre_proveedor !== undefined ? { nombreProveedor: b.nombre_proveedor } : {}),
    ...(ext.campos.fechaTexto ? { fechaTexto: ext.campos.fechaTexto } : {}),
    ...(ext.campos.totalTexto ? { totalTexto: ext.campos.totalTexto } : {}),
    confianza: ext.confianza,
    fotoPendiente: b.foto_pendiente,
    ahoraIso,
    vistos: store.borradorVistos,
  });
  if (ing.status === 415 || ing.status === 422) {
    job = con_borrador(job, "", ahoraIso);
    store.ocrJobs.set(jobId, { ...job, estado: "fallo", error: ing.error });
    return Response.json({ error: ing.error }, { status: ing.status });
  }
  const borrador = ing.borrador;
  store.borradorVistos.set(`ocr-${jobId}`, borrador);
  store.borradores.set(borrador.id, borrador);
  job = con_borrador(job, borrador.id, ahoraIso);
  store.ocrJobs.set(jobId, job);

  const global = confianza_global(ext.confianza);
  store.ocrEventos.push({
    tipo: "ocr_borrador_listo",
    payload: {
      job_id: jobId,
      origen: b.origen,
      confianza_global: global,
      campos_baja: campos_en_baja(ext.confianza),
      vence_at: borrador.venceAt,
      revisa: global !== "alta" || ext.usoFallbackLocal,
    },
  });
  return Response.json(
    { job_id: jobId, estado: job.estado, borrador_id: borrador.id, confianza_global: global, revisa: global !== "alta" || ext.usoFallbackLocal },
    { status: 201 },
  );
};
