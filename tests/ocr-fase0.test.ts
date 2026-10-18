import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore, store } from "../src/lib/store.js";
import {
  confianza_global,
  crear_paddle_cliente,
  extraer_campos,
  resolver_extraccion,
} from "../src/modules/ocr/motor.js";
import { ejecutarVencimientoOcr } from "../src/jobs/vencer-ocr.js";
import { POST as postJobs } from "../src/pages/api/ocr/jobs.js";
import { GET as getJob } from "../src/pages/api/ocr/jobs/[id].js";
import { POST as postConfirmar } from "../src/pages/api/ocr/jobs/[id]/confirmar.js";
import { POST as postEditar } from "../src/pages/api/ocr/jobs/[id]/editar.js";
import { POST as postDescartar } from "../src/pages/api/ocr/jobs/[id]/descartar.js";
import { POST as postVencer } from "../src/pages/api/jobs/vencer-ocr.js";

const PDF = "FACTURA C 00003-000001\nCUIT: 20-93333172-6\nFecha: 10/10/2026\nTotal: $ 164.800,00\n";
const OCR = "FACTURA\nCUIT 20-93333172-6\nFecha 10/10/2026\nTotal $ 164.800,00\n";

function reqJob(key: string, body: unknown) {
  return ctx("http://x/api/ocr/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: body as Record<string, unknown>,
  });
}

async function crear(key: string, body: unknown) {
  const res = (await postJobs(reqJob(key, body))) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function baseBody(over: Record<string, unknown> = {}) {
  return { origen: "wa", bytes_ref: "wa-bytes-1", emisor: "carrefour", es_comprobante: true, ...over };
}

beforeEach(() => {
  resetStore();
  process.env.JOBS_SECRET = "job-secret";
});

describe("ocr motor determinista", () => {
  it("pdf da alta, ocr media, email baja; pdf gana por orden", () => {
    const pdf = extraer_campos({ pdfTexto: PDF });
    expect(pdf.confianza).toMatchObject({ cuit: "alta", fecha: "alta", total: "alta" });
    expect(pdf.campos.totalTexto).toBe("164.800,00");
    const ocr = extraer_campos({ ocrTexto: OCR });
    expect(ocr.confianza).toMatchObject({ fecha: "media", total: "media" });
    const email = extraer_campos({ cuerpoEmail: "te adjunto factura total $ 1.000,00" });
    expect(email.confianza.total).toBe("baja");
    const mixto = extraer_campos({ pdfTexto: "Fecha: 11/10/2026", ocrTexto: OCR });
    expect(mixto.campos.fechaTexto).toBe("11/10/2026");
    expect(mixto.fuentes).toMatchObject({ fecha: "pdf", total: "ocr" });
    expect(confianza_global(mixto.confianza)).toBe("media");
  });

  it("paddle con confianza <0.6 degrada a baja; caído usa local (E6)", async () => {
    const bajo = crear_paddle_cliente({
      endpoint: "http://ocr.local",
      fetchFn: async (): Promise<Response> => new Response(JSON.stringify({ texto: OCR, confianza: 0.4 })),
    });
    const r = await resolver_extraccion({ imagen: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }, motor: bajo });
    expect(r.confianza.fecha).toBe("baja");
    const caido = crear_paddle_cliente({
      endpoint: "http://ocr.local",
      fetchFn: async (): Promise<Response> => { throw new Error("down"); },
    });
    const f = await resolver_extraccion({ imagen: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }, motor: caido, cuerpoEmail: "total $ 500,00" });
    expect(f.usoFallbackLocal).toBe(true);
  });
});

describe("ocr jobs API (ADR-0005)", () => {
  it("E3 no comprobante 415 sin job; E2 duplicado 200 sin reprocesar", async () => {
    const no = await crear("w-no", baseBody({ es_comprobante: false }));
    expect(no.status).toBe(415);
    expect(store.ocrJobs.size).toBe(0);
    const r1 = await crear("w-dup", baseBody({ texto_pdf: PDF }));
    expect(r1.status).toBe(201);
    const r2 = await crear("w-dup", baseBody({ texto_pdf: PDF }));
    expect(r2.status).toBe(200);
    expect(r2.json["job_id"]).toBe(r1.json["job_id"]);
    expect(store.ocrJobs.size).toBe(1);
  });

  it("pdf 201 listo alta + evento + GET confirmable + confirma 201 factura", async () => {
    const r = await crear("w-ok", baseBody({ texto_pdf: PDF }));
    expect(r.status).toBe(201);
    expect(r.json["confianza_global"]).toBe("alta");
    expect(r.json["revisa"]).toBe(false);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_borrador_listo")).toBe(true);
    const jobId = r.json["job_id"] as string;

    const g = (await getJob(ctx(`http://x/api/ocr/jobs/${jobId}`, { params: { id: jobId } }))) as Response;
    const gj = (await g.json()) as Record<string, unknown>;
    expect(gj["estado"]).toBe("confirmable");
    expect((gj["borrador"] as Record<string, unknown>)["total_centavos"]).toBe("16480000");

    const c = (await postConfirmar(
      ctx(`http://x/api/ocr/jobs/${jobId}/confirmar`, {
        method: "POST",
        body: { quien: "dueno-1" },
        params: { id: jobId },
      }),
    )) as Response;
    expect(c.status).toBe(201);
    const cj = (await c.json()) as Record<string, unknown>;
    expect(store.facturasProv.get(cj["factura_id"] as string)?.supplierCuit).toBe("20933331726");

    const c2 = (await postConfirmar(
      ctx(`http://x/api/ocr/jobs/${jobId}/confirmar`, {
        method: "POST",
        body: { quien: "dueno-1" },
        params: { id: jobId },
      }),
    )) as Response;
    expect(c2.status).toBe(409);
  });

  it("E1 bloquea confirmar en baja; editar por texto habilita", async () => {
    const r = await crear("w-baja", baseBody({ cuerpo_email: "hola, te paso la factura del mes" }));
    expect(r.json["confianza_global"]).toBe("baja");
    const jobId = r.json["job_id"] as string;
    const post = (route: typeof postConfirmar, body: unknown) =>
      route(
        ctx(`http://x/api/ocr/jobs/${jobId}/x`, {
          method: "POST",
          body: body as Record<string, unknown>,
          params: { id: jobId },
        }),
      ) as Promise<Response>;
    expect((await post(postConfirmar, { quien: "d" })).status).toBe(422);
    const ed = await post(postEditar, { quien: "d", cuit_texto: "20-93333172-6", fecha_texto: "10/10/2026", total_texto: "164.800,00" });
    expect(ed.status).toBe(200);
    expect(((await ed.json()) as Record<string, unknown>)["confianza"]).toMatchObject({ fecha: "alta", total: "alta" });
    expect((await post(postConfirmar, { quien: "d" })).status).toBe(201);
  });

  it("descartar cierra sin registrar; redescartar 409", async () => {
    const r = await crear("w-desc", baseBody({ texto_pdf: PDF }));
    const jobId = r.json["job_id"] as string;
    const d = (await postDescartar(
      ctx(`http://x/api/ocr/jobs/${jobId}/descartar`, {
        method: "POST",
        body: { motivo: "duplicada" },
        params: { id: jobId },
      }),
    )) as Response;
    expect(d.status).toBe(200);
    expect(store.facturasProv.size).toBe(0);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_descartado")).toBe(true);
    const d2 = (await postDescartar(
      ctx(`http://x/api/ocr/jobs/${jobId}/descartar`, {
        method: "POST",
        body: {},
        params: { id: jobId },
      }),
    )) as Response;
    expect(d2.status).toBe(409);
  });

  it("E5 vencido 410 + solo lectura; vencer-ocr emite evento y recuerdo 24h", async () => {
    const r = await crear("w-venc", baseBody({ texto_pdf: PDF }));
    const jobId = r.json["job_id"] as string;
    const job = store.ocrJobs.get(jobId)!;
    const borrador = store.borradores.get(job.borradorId!)!;
    store.borradores.set(borrador.id, { ...borrador, venceAt: "2020-01-01T00:00:00.000Z" });

    const g = (await getJob(ctx(`http://x/api/ocr/jobs/${jobId}`, { params: { id: jobId } }))) as Response;
    expect(((await g.json()) as Record<string, unknown>)["estado"]).toBe("vencida");
    const c = (await postConfirmar(
      ctx(`http://x/api/ocr/jobs/${jobId}/confirmar`, {
        method: "POST",
        body: { quien: "d" },
        params: { id: jobId },
      }),
    )) as Response;
    expect(c.status).toBe(410);

    const v = await ejecutarVencimientoOcr("2026-10-10T12:00:00.000Z");
    expect(v.vencidos).toContain(jobId);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_vencido")).toBe(true);

    const r2 = await crear("w-rec", baseBody({ texto_pdf: PDF }));
    const jobId2 = r2.json["job_id"] as string;
    const job2 = store.ocrJobs.get(jobId2)!;
    store.ocrJobs.set(jobId2, { ...job2, creadoEn: "2026-10-08T12:00:00.000Z" });
    const v2 = await ejecutarVencimientoOcr("2026-10-10T12:00:00.000Z");
    expect(v2.recuerdos).toContain(jobId2);

    const sinSecret = (await postVencer(reqJob("x", {}))) as Response;
    expect(sinSecret.status).toBe(403);
  });
});
