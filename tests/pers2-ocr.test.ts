import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { supplierDrafts, supplierInvoices } from "../src/db/schema-proveedores.js";
import { POST as postJobs } from "../src/pages/api/ocr/jobs.js";
import { GET as getJob } from "../src/pages/api/ocr/jobs/[id].js";
import { POST as postConfirmar } from "../src/pages/api/ocr/jobs/[id]/confirmar.js";
import { POST as postEditar } from "../src/pages/api/ocr/jobs/[id]/editar.js";
import { POST as postDescartar } from "../src/pages/api/ocr/jobs/[id]/descartar.js";

const RUTAS_SIN_STORE = [
  "src/pages/api/ocr/jobs/[id]/descartar.ts",
  "src/pages/api/ocr/jobs/[id]/confirmar.ts",
  "src/pages/api/ocr/jobs/[id]/editar.ts",
  "src/pages/api/ocr/jobs/[id].ts",
  "src/pages/api/ocr/jobs.ts",
];

function importaStoreValores(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s+type\b/.test(linea)) return false;
    if (/^\s*import\s*\{\s*control\s*\}\s*from/.test(linea)) return false;
    return true;
  });
}

describe("PERS2-S20 AT14: rutas ocr sin valores de lib/store (ADR-0060)", () => {
  it("ninguna de las 5 rutas importa valores de lib/store (import type y control permitidos)", () => {
    const mal = RUTAS_SIN_STORE.filter(importaStoreValores);
    expect(mal).toEqual([]);
  });
});

const PDF = "FACTURA C 00003-000001\nCUIT: 20-93333172-6\nFecha: 10/10/2026\nTotal: $ 164.800,00\n";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function reqJob(key: string, body: unknown): Request {
  return new Request("http://x/api/ocr/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

async function crear(key: string, body: unknown) {
  const res = (await postJobs({ request: reqJob(key, body) } as never)) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function baseBody(over: Record<string, unknown> = {}) {
  return { origen: "wa", bytes_ref: "wa-bytes-1", emisor: "carrefour", es_comprobante: true, ...over };
}

function postConId(
  route: typeof postConfirmar,
  jobId: string,
  sufijo: string,
  body: unknown,
): Promise<Response> {
  return route({
    request: new Request(`http://x/api/ocr/jobs/${jobId}/${sufijo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: { id: jobId },
  } as never) as Promise<Response>;
}

describe("PERS2-S20 single sin DB: OCR como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("E3 no comprobante 415 sin job; E2 duplicado 200 sin reprocesar", async () => {
    const no = await crear("w-per2-no", baseBody({ es_comprobante: false }));
    expect(no.status).toBe(415);
    expect(store.ocrJobs.size).toBe(0);
    const r1 = await crear("w-per2-dup", baseBody({ texto_pdf: PDF }));
    expect(r1.status).toBe(201);
    const r2 = await crear("w-per2-dup", baseBody({ texto_pdf: PDF }));
    expect(r2.status).toBe(200);
    expect(r2.json["job_id"]).toBe(r1.json["job_id"]);
    expect(r2.json["duplicado"]).toBe(true);
    expect(store.ocrJobs.size).toBe(1);
  });

  it("pdf 201 listo alta + evento + GET confirmable + confirma 201 factura", async () => {
    const r = await crear("w-per2-ok", baseBody({ texto_pdf: PDF }));
    expect(r.status).toBe(201);
    expect(r.json["confianza_global"]).toBe("alta");
    expect(r.json["revisa"]).toBe(false);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_borrador_listo")).toBe(true);
    const jobId = r.json["job_id"] as string;

    const g = (await getJob({ params: { id: jobId } } as never)) as Response;
    const gj = (await g.json()) as Record<string, unknown>;
    expect(gj["estado"]).toBe("confirmable");
    expect((gj["borrador"] as Record<string, unknown>)["total_centavos"]).toBe("16480000");

    const c = await postConId(postConfirmar, jobId, "confirmar", { quien: "dueno-1" });
    expect(c.status).toBe(201);
    const cj = (await c.json()) as Record<string, unknown>;
    expect(store.facturasProv.get(cj["factura_id"] as string)?.supplierCuit).toBe("20933331726");

    const c2 = await postConId(postConfirmar, jobId, "confirmar", { quien: "dueno-1" });
    expect(c2.status).toBe(409);
  });

  it("E1 bloquea confirmar en baja; editar por texto habilita", async () => {
    const r = await crear("w-per2-baja", baseBody({ cuerpo_email: "hola, te paso la factura del mes" }));
    expect(r.json["confianza_global"]).toBe("baja");
    const jobId = r.json["job_id"] as string;
    expect((await postConId(postConfirmar, jobId, "confirmar", { quien: "d" })).status).toBe(422);
    const ed = await postConId(postEditar, jobId, "editar", {
      quien: "d",
      cuit_texto: "20-93333172-6",
      fecha_texto: "10/10/2026",
      total_texto: "164.800,00",
    });
    expect(ed.status).toBe(200);
    expect(((await ed.json()) as Record<string, unknown>)["confianza"]).toMatchObject({ fecha: "alta", total: "alta" });
    expect((await postConId(postConfirmar, jobId, "confirmar", { quien: "d" })).status).toBe(201);
  });

  it("descartar cierra sin registrar; redescartar 409", async () => {
    const r = await crear("w-per2-desc", baseBody({ texto_pdf: PDF }));
    const jobId = r.json["job_id"] as string;
    const d = await postConId(postDescartar, jobId, "descartar", { motivo: "duplicada" });
    expect(d.status).toBe(200);
    expect(store.facturasProv.size).toBe(0);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_descartado")).toBe(true);
    const d2 = await postConId(postDescartar, jobId, "descartar", {});
    expect(d2.status).toBe(409);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function borrarRastroPG(keys: string[]) {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      for (const key of keys) {
        await db.delete(supplierInvoices).where(eq(supplierInvoices.idempotencyKey, key));
        await db.delete(supplierDrafts).where(eq(supplierDrafts.idempotencyKey, key));
      }
    });
  }
}

describe.skipIf(!hayPG)("PERS2-S20 multi con PG local: OCR aislado por tenant", () => {
  const keyA = `pers2-ocr-${sufijoPG}`;
  const creadas: string[] = [];

  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG(creadas);
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("job creado y confirmado en A deja su factura en la base de A y no en B", async () => {
    fijarMulti();
    const r = await conTenant("tenant-a", () =>
      crear(keyA, baseBody({ texto_pdf: PDF })),
    );
    expect(r.status).toBe(201);
    const jobId = r.json["job_id"] as string;
    creadas.push(`ocr-${jobId}`);

    const c = (await conTenant("tenant-a", () =>
      postConId(postConfirmar, jobId, "confirmar", { quien: "dueno-a" }),
    )) as Response;
    expect(c.status).toBe(201);
    const cj = (await c.json()) as Record<string, unknown>;
    expect(typeof cj["factura_id"]).toBe("string");

    const draftKey = `ocr-${jobId}`;
    const facturasA = await conTenant("tenant-a", async () =>
      getTenantDb().select().from(supplierInvoices).where(eq(supplierInvoices.idempotencyKey, draftKey)),
    );
    expect(facturasA.length).toBe(1);
    const facturasB = await conTenant("tenant-b", async () =>
      getTenantDb().select().from(supplierInvoices).where(eq(supplierInvoices.idempotencyKey, draftKey)),
    );
    expect(facturasB.length).toBe(0);

    const getB = (await conTenant("tenant-b", () => getJob({ params: { id: jobId } } as never))) as Response;
    expect(getB.status).toBe(404);
  });

  it("la misma Idempotency-Key en B crea su propio job", async () => {
    fijarMulti();
    const rB = await conTenant("tenant-b", () =>
      crear(keyA, baseBody({ texto_pdf: PDF })),
    );
    expect(rB.status).toBe(201);
    expect(rB.json["duplicado"]).toBeUndefined();
    const jobIdB = rB.json["job_id"] as string;
    creadas.push(`ocr-${jobIdB}`);

    const jobA = await conTenant("tenant-a", () =>
      crear(`pers2-ocr-otro-${sufijoPG}`, baseBody({ texto_pdf: PDF })),
    );
    expect((jobA.json["job_id"] as string)).not.toBe(jobIdB);
    if (jobA.json["job_id"]) creadas.push(`ocr-${jobA.json["job_id"] as string}`);
  });
});
