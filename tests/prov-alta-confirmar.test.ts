import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore, store } from "../src/lib/store.js";
import { POST as postConfirmar } from "../src/pages/api/ocr/jobs/[id]/confirmar.js";
import type { OcrJob } from "../src/modules/ocr/jobs.js";
import type { Borrador } from "../src/modules/purchases/facturas.js";

const CUIT = "20933331726";
const AHORA = "2026-10-19T12:00:00.000Z";

function sembrarJob(n: number): string {
  const jobId = `job-prov-alta-${n}`;
  const borradorId = `borr-prov-alta-${n}`;
  const idempotencyKey = `prov-alta-${n}`;
  const borrador: Borrador = {
    id: borradorId,
    idempotencyKey,
    origen: "wa_proveedor",
    bytesRef: "wa-media:media-prov-alta",
    cuit: "20-93333172-6",
    nombreProveedor: null,
    fechaIso: "2026-10-10",
    totalCentavos: 16480000n,
    items: [],
    confianza: { cuit: "alta", fecha: "alta", total: "alta" },
    estado: "pendiente",
    fotoPendiente: true,
    confirmadoPor: null,
    facturaId: null,
    creadoEn: AHORA,
    venceAt: "2099-01-01T00:00:00.000Z",
  };
  const job: OcrJob = {
    id: jobId,
    idempotencyKey,
    origen: "wa_proveedor",
    bytesRef: borrador.bytesRef,
    emisor: null,
    estado: "listo",
    borradorId,
    error: null,
    creadoEn: AHORA,
    actualizadoEn: AHORA,
    recordadoEn: null,
  };
  store.borradores.set(borradorId, borrador);
  store.ocrJobs.set(jobId, job);
  return jobId;
}

async function confirmar(jobId: string) {
  const res = (await postConfirmar(
    ctx(`http://x/api/ocr/jobs/${jobId}/confirmar`, {
      method: "POST",
      body: { quien: "dueno-1" },
      params: { id: jobId },
    }),
  )) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  resetStore();
});

describe("PROV-S10 el alta del proveedor queda de la confirmación", () => {
  it("al confirmar, el CUIT de la factura entra a la lista del comercio", async () => {
    const jobId = sembrarJob(1);
    expect(store.suppliers.has(CUIT)).toBe(false);

    const c = await confirmar(jobId);

    expect(c.status).toBe(201);
    expect(c.json["proveedor_creado"]).toBe(true);
    expect(store.suppliers.get(CUIT)?.cuit).toBe(CUIT);
  });

  it("confirmar el mismo CUIT de nuevo no duplica el proveedor", async () => {
    const primero = await confirmar(sembrarJob(2));
    expect(primero.json["proveedor_creado"]).toBe(true);

    const segundo = await confirmar(sembrarJob(3));
    expect(segundo.status).toBe(201);
    expect(segundo.json["proveedor_creado"]).toBe(false);
    expect(store.suppliers.size).toBe(1);
    expect(store.suppliers.get(CUIT)?.cuit).toBe(CUIT);
  });
});
