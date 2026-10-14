import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { ocrEventos, ocrJobs } from "../src/db/schema.js";
import { supplierDrafts, supplierInvoices } from "../src/db/schema-proveedores.js";
import { buscarJobPorClave, crearJobRegistro, obtenerJob } from "../src/lib/repos/ocr.js";
import { crear_job } from "../src/modules/ocr/jobs.js";
import { ejecutarVencimientoOcr } from "../src/jobs/vencer-ocr.js";
import { POST as postJobs } from "../src/pages/api/ocr/jobs.js";
import { GET as getJob } from "../src/pages/api/ocr/jobs/[id].js";
import { POST as postDescartar } from "../src/pages/api/ocr/jobs/[id]/descartar.js";
import { ctx } from "./helpers/ctx.js";

const PDF = "FACTURA C 00003-000001\nCUIT: 20-93333172-6\nFecha: 10/10/2026\nTotal: $ 164.800,00\n";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function baseBody(over: Record<string, unknown> = {}) {
  return { origen: "wa", bytes_ref: "wa-bytes-1", emisor: "carrefour", es_comprobante: true, ...over };
}

async function crear(key: string, body: Record<string, unknown>) {
  const res = await postJobs(ctx("http://x/api/ocr/jobs", { headers: { "Idempotency-Key": key }, body }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function descartar(jobId: string, body: Record<string, unknown>) {
  return postDescartar(ctx(`http://x/api/ocr/jobs/${jobId}/descartar`, { body, params: { id: jobId } }));
}

describe("PERS4-S2/S3 single sin DB: jobs y eventos OCR como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("job 201 + duplicado 200 por clave + evento ocr_borrador_listo", async () => {
    const r1 = await crear("p4-dup", baseBody({ texto_pdf: PDF }));
    expect(r1.status).toBe(201);
    const r2 = await crear("p4-dup", baseBody({ texto_pdf: PDF }));
    expect(r2.status).toBe(200);
    expect(r2.json["job_id"]).toBe(r1.json["job_id"]);
    expect(r2.json["duplicado"]).toBe(true);
    expect(store.ocrJobs.size).toBe(1);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_borrador_listo")).toBe(true);
  });

  it("descartar emite ocr_descartado sin registrar factura", async () => {
    const r = await crear("p4-desc", baseBody({ texto_pdf: PDF }));
    const jobId = r.json["job_id"] as string;
    const d = await descartar(jobId, { motivo: "duplicada" });
    expect(d.status).toBe(200);
    expect(store.facturasProv.size).toBe(0);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_descartado")).toBe(true);
  });

  it("ejecutarVencimientoOcr async marca vencido y recuerdo como hoy", async () => {
    const rV = await crear("p4-venc", baseBody({ texto_pdf: PDF }));
    const jobV = rV.json["job_id"] as string;
    const jV = await obtenerJob(jobV);
    const bV = store.borradores.get(jV?.borradorId ?? "");
    expect(bV).toBeDefined();
    store.borradores.set(bV!.id, { ...bV!, venceAt: "2020-01-01T00:00:00.000Z" });

    const rR = await crear("p4-rec", baseBody({ texto_pdf: PDF }));
    const jobR = rR.json["job_id"] as string;
    const jR = store.ocrJobs.get(jobR)!;
    store.ocrJobs.set(jobR, { ...jR, creadoEn: "2026-10-08T12:00:00.000Z" });

    const v = await ejecutarVencimientoOcr("2026-10-10T12:00:00.000Z");
    expect(v.vencidos).toContain(jobV);
    expect(v.recuerdos).toContain(jobR);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_vencido")).toBe(true);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_recuerdo")).toBe(true);

    const g = await getJob(ctx(`http://x/api/ocr/jobs/${jobV}`, { params: { id: jobV } }));
    expect(((await g.json()) as Record<string, unknown>)["estado"]).toBe("vencida");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function borrarRastroPG(jobIds: string[], draftKeys: string[]) {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      for (const id of jobIds) {
        await db.delete(ocrEventos).where(sql`payload->>'job_id' = ${id}`);
        await db.delete(ocrJobs).where(eq(ocrJobs.id, id));
      }
      for (const key of draftKeys) {
        await db.delete(supplierInvoices).where(eq(supplierInvoices.idempotencyKey, key));
        await db.delete(supplierDrafts).where(eq(supplierDrafts.idempotencyKey, key));
      }
    });
  }
}

function tiposDe(jobId: string, filas: Array<{ payload: Record<string, unknown>; tipo: string }>) {
  return filas.filter((e) => e.payload["job_id"] === jobId).map((e) => e.tipo);
}

describe.skipIf(!hayPG)("PERS4 multi con PG local: jobs y eventos OCR aislados por tenant", () => {
  const creados: string[] = [];
  const drafts: string[] = [];

  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG(creados, drafts);
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("job creado en A queda en ocr_jobs de A; B no lo ve; misma clave en A da 200 con una sola fila", async () => {
    fijarMulti();
    const key = `pers4-job-${sufijoPG}`;
    const r = await conTenant("tenant-a", () => crear(key, baseBody({ texto_pdf: PDF })));
    expect(r.status).toBe(201);
    const jobId = r.json["job_id"] as string;
    creados.push(jobId);
    drafts.push(`ocr-${jobId}`);

    const filasA = await conTenant("tenant-a", () =>
      getTenantDb().select().from(ocrJobs).where(eq(ocrJobs.id, jobId)),
    );
    expect(filasA.length).toBe(1);
    expect(filasA[0]?.idempotencyKey).toBe(key);
    const filasB = await conTenant("tenant-b", () =>
      getTenantDb().select().from(ocrJobs).where(eq(ocrJobs.id, jobId)),
    );
    expect(filasB.length).toBe(0);

    const dup = await conTenant("tenant-a", () => crear(key, baseBody({ texto_pdf: PDF })));
    expect(dup.status).toBe(200);
    expect(dup.json["job_id"]).toBe(jobId);
    const unasA = await conTenant("tenant-a", () =>
      getTenantDb().select().from(ocrJobs).where(eq(ocrJobs.idempotencyKey, key)),
    );
    expect(unasA.length).toBe(1);

    const reintento = crear_job({
      jobId: crypto.randomUUID(),
      idempotencyKey: key,
      origen: "wa",
      bytesRef: "otro-ref",
      ahoraIso: new Date().toISOString(),
    });
    const resuelto = await conTenant("tenant-a", () => crearJobRegistro(reintento));
    expect(resuelto.id).toBe(jobId);
    const trasRepo = await conTenant("tenant-a", () =>
      getTenantDb().select().from(ocrJobs).where(eq(ocrJobs.idempotencyKey, key)),
    );
    expect(trasRepo.length).toBe(1);

    expect(await conTenant("tenant-b", () => buscarJobPorClave(key))).toBeNull();
    expect(await conTenant("tenant-b", () => obtenerJob(jobId))).toBeUndefined();
  });

  it("eventos del job en A quedan en ocr_eventos de A; B no los ve", async () => {
    fijarMulti();
    const r = await conTenant("tenant-a", () => crear(`pers4-ev-${sufijoPG}`, baseBody({ texto_pdf: PDF })));
    expect(r.status).toBe(201);
    const jobId = r.json["job_id"] as string;
    creados.push(jobId);
    drafts.push(`ocr-${jobId}`);

    const d = await conTenant("tenant-a", () => descartar(jobId, { motivo: "duplicada" }));
    expect(d.status).toBe(200);

    const evsA = await conTenant("tenant-a", () => getTenantDb().select().from(ocrEventos));
    const miosA = tiposDe(jobId, evsA);
    expect(miosA).toContain("ocr_borrador_listo");
    expect(miosA).toContain("ocr_descartado");
    const evsB = await conTenant("tenant-b", () => getTenantDb().select().from(ocrEventos));
    expect(tiposDe(jobId, evsB)).toEqual([]);
  });

  it("vencimiento en A actualiza el job e inserta ocr_vencido/ocr_recuerdo en A; B no ve esos eventos", async () => {
    fijarMulti();
    const rV = await conTenant("tenant-a", () => crear(`pers4-venc-${sufijoPG}`, baseBody({ texto_pdf: PDF })));
    const jobV = rV.json["job_id"] as string;
    creados.push(jobV);
    drafts.push(`ocr-${jobV}`);
    const rR = await conTenant("tenant-a", () => crear(`pers4-rec-${sufijoPG}`, baseBody({ texto_pdf: PDF })));
    const jobR = rR.json["job_id"] as string;
    creados.push(jobR);
    drafts.push(`ocr-${jobR}`);

    await conTenant("tenant-a", async () => {
      const jV = await obtenerJob(jobV);
      const bV = store.borradores.get(jV?.borradorId ?? "");
      expect(bV).toBeDefined();
      store.borradores.set(bV!.id, { ...bV!, venceAt: "2020-01-01T00:00:00.000Z" });
      const jR = store.ocrJobs.get(jobR)!;
      store.ocrJobs.set(jobR, { ...jR, creadoEn: "2026-10-08T12:00:00.000Z" });
    });

    const v = await conTenant("tenant-a", () => ejecutarVencimientoOcr("2026-10-10T12:00:00.000Z"));
    expect(v.vencidos).toContain(jobV);
    expect(v.recuerdos).toContain(jobR);

    const evsA = await conTenant("tenant-a", () => getTenantDb().select().from(ocrEventos));
    expect(tiposDe(jobV, evsA)).toContain("ocr_vencido");
    expect(tiposDe(jobR, evsA)).toContain("ocr_recuerdo");
    const filaR = await conTenant("tenant-a", () =>
      getTenantDb().select().from(ocrJobs).where(eq(ocrJobs.id, jobR)),
    );
    expect(filaR[0]?.recordadoEn).not.toBeNull();

    const evsB = await conTenant("tenant-b", () => getTenantDb().select().from(ocrEventos));
    expect(tiposDe(jobV, evsB)).toEqual([]);
    expect(tiposDe(jobR, evsB)).toEqual([]);
  });
});
