import { conTenant } from "./tenant-mode.js";
import { BaseNoDisponible } from "./server-db.js";
import { ocrJobSchema } from "./validation.js";
import {
  buscarJobPorClave,
  crearJobRegistro,
  marcarJobFallo,
  registrarEventoOcr,
  vincularBorradorAlJob,
} from "./repos/ocr.js";
import { ingerirBorradorOcrRepo } from "./repos/facturas-proveedor.js";
import {
  campos_en_baja,
  confianza_global,
  crear_paddle_cliente,
  resolver_extraccion,
} from "../modules/ocr/motor.js";
import { crear_job, type EstadoOcrJob, type FallbackNubeApi } from "../modules/ocr/jobs.js";
import type { Borrador, ConfianzaCampo, ConfianzaPorCampo } from "../modules/purchases/facturas.js";

// Ingesta OCR (ADR-0005, PRD-OCR-01) en una sola implementación: la usan
// `POST /api/ocr/jobs` (Gmail y callers de API) y el webhook de WhatsApp.
// Idempotente por clave (wamid o message-id): la clave repetida devuelve el
// job existente sin reprocesar. El job se procesa inline (en_cola → listo)
// para poder ofrecer el borrador en la misma respuesta; una cola que mantenga
// este contrato puede ponerse abajo sin tocar los llamadores.

export interface EntradaIngestaOcr {
  /** Idempotency-Key: wamid de WhatsApp o message-id de Gmail. */
  readonly idempotencyKey: string;
  /** Cuerpo sin validar: se parsea con `ocrJobSchema` (frontera). */
  readonly body: unknown;
  /** Tenant destino; con contexto explícito el job y el borrador quedan en su base. */
  readonly tenantId?: string | undefined;
}

export type ResultadoIngestaOcr =
  | {
      readonly status: 201;
      readonly jobId: string;
      readonly estado: EstadoOcrJob;
      readonly borrador: Borrador;
      readonly confianza: ConfianzaPorCampo;
      readonly confianzaGlobal: ConfianzaCampo;
      readonly camposBaja: ReadonlyArray<string>;
      readonly fallbackNube: FallbackNubeApi;
      readonly revisa: boolean;
    }
  | { readonly status: 200; readonly jobId: string; readonly estado: EstadoOcrJob; readonly borradorId: string | null; readonly duplicado: true }
  | { readonly status: 415 | 422 | 503; readonly error: string | Record<string, unknown> };

export async function ingerirOcr(entrada: EntradaIngestaOcr): Promise<ResultadoIngestaOcr> {
  if (entrada.tenantId) return conTenant(entrada.tenantId, () => ingerir(entrada));
  return ingerir(entrada);
}

async function ingerir(entrada: EntradaIngestaOcr): Promise<ResultadoIngestaOcr> {
  const key = entrada.idempotencyKey;
  if (!key) return { status: 422, error: "falta Idempotency-Key" };
  const parsed = ocrJobSchema.safeParse(entrada.body);
  if (!parsed.success) return { status: 422, error: parsed.error.flatten() };
  const b = parsed.data;

  try {
    const previo = await buscarJobPorClave(key);
    if (previo) {
      return { status: 200, jobId: previo.id, estado: previo.estado, borradorId: previo.borradorId, duplicado: true };
    }
  } catch (e) {
    if (e instanceof BaseNoDisponible) return { status: 503, error: "base_no_disponible" };
    throw e;
  }
  if (!b.es_comprobante) return { status: 415, error: "adjunto no es comprobante" };

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
      return { status: ing.status, error: ing.error };
    }
    if (ing.status === 200) {
      const vinculado = await vincularBorradorAlJob(job, ing.borrador.id, ahoraIso);
      return { status: 200, jobId, estado: vinculado.estado, borradorId: ing.borrador.id, duplicado: true };
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
    return {
      status: 201,
      jobId,
      estado: vinculado.estado,
      borrador,
      confianza: borrador.confianza,
      confianzaGlobal: global,
      camposBaja: campos_en_baja(ext.confianza),
      fallbackNube,
      revisa,
    };
  } catch (e) {
    if (e instanceof BaseNoDisponible) return { status: 503, error: "base_no_disponible" };
    throw e;
  }
}

// Contrato HTTP de la ingesta: el cuerpo 201 lleva el borrador creado y la
// confianza global; el 200 el job existente (duplicado) sin reprocesar.
export function respuestaIngesta(r: ResultadoIngestaOcr): { status: number; body: Record<string, unknown> } {
  if (r.status === 201) {
    return {
      status: 201,
      body: {
        job_id: r.jobId,
        estado: r.estado,
        borrador_id: r.borrador.id,
        confianza_global: r.confianzaGlobal,
        fallback_nube: r.fallbackNube,
        revisa: r.revisa,
      },
    };
  }
  if (r.status === 200) return { status: 200, body: { job_id: r.jobId, estado: r.estado, duplicado: true } };
  return { status: r.status, body: { error: r.error } };
}