import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { ocrEventos, ocrJobs } from "../src/db/schema.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";
import { supplierDrafts, supplierInvoices } from "../src/db/schema-proveedores.js";
import { buscarFallbackNubeJob } from "../src/lib/repos/ocr.js";
import {
  UMBRAL_FALLBACK_NUBE,
  confianza_global,
  crear_paddle_cliente,
  resolver_extraccion,
} from "../src/modules/ocr/motor.js";
import { POST as postJobs } from "../src/pages/api/ocr/jobs.js";
import { GET as getJob } from "../src/pages/api/ocr/jobs/[id].js";
import { ingerirOcr, respuestaIngesta } from "../src/lib/ocr-ingesta.js";

const OCR_BORROSO = "FACTURA\nCUIT 20-93333172-6\nFecha 10/10/2026\nTotal $ 164.800,00\n";
const PDF = "FACTURA C 00003-000001\nCUIT: 20-93333172-6\nFecha: 10/10/2026\nTotal: $ 164.800,00\n";
const ENDPOINT = "http://paddle.interno-privado:8080";

function motorPaddle(confianza: number) {
  return crear_paddle_cliente({
    endpoint: ENDPOINT,
    fetchFn: async (): Promise<Response> => new Response(JSON.stringify({ texto: OCR_BORROSO, confianza })),
  });
}

function baseBody(over: Record<string, unknown> = {}) {
  return { origen: "wa", bytes_ref: "wa-bytes-1", emisor: "carrefour", es_comprobante: true, ...over };
}

async function crear(key: string, body: Record<string, unknown>) {
  const r = respuestaIngesta(
    await ingerirOcr({ idempotencyKey: key, body, imagen: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" } }),
  );
  return { status: r.status, json: r.body };
}

async function crearRuta(key: string, body: Record<string, unknown>) {
  const res = (await postJobs(
    ctx("http://x/api/ocr/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body,
    }),
  )) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function leerEstado(jobId: string) {
  const res = (await getJob(ctx(`http://x/api/ocr/jobs/${jobId}`, { params: { id: jobId } }))) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function eventoListo(jobId: string): Record<string, unknown> {
  const e = store.ocrEventos.filter((x) => x.tipo === "ocr_borrador_listo").at(-1);
  expect((e?.payload as Record<string, unknown>)["job_id"]).toBe(jobId);
  return e?.payload as Record<string, unknown>;
}

// El motor Paddle entra por HTTP: la ruta arma el cliente con
// OCR_PADDLE_ENDPOINT y el fetch global.
function paddleQueResponde(confianza: number) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada: unknown) => {
    const url = String((entrada as { url?: unknown }).url ?? entrada);
    if (!url.startsWith(ENDPOINT)) throw new Error(`fetch inesperado: ${url}`);
    return new Response(JSON.stringify({ texto: OCR_BORROSO, confianza }));
  });
}

let paddle: ReturnType<typeof vi.spyOn> | null = null;

function conPaddle(confianza: number) {
  paddle = paddleQueResponde(confianza);
  process.env.OCR_PADDLE_ENDPOINT = ENDPOINT;
}

function paddleCaido() {
  paddle = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("ECONNREFUSED paddle");
  });
  process.env.OCR_PADDLE_ENDPOINT = ENDPOINT;
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  paddle?.mockRestore();
  paddle = null;
  vi.restoreAllMocks();
  delete process.env.OCR_PADDLE_ENDPOINT;
});

describe("resolver_extraccion marca la nube solo si el motor respondió bajo el umbral", () => {
  it("el umbral de ADR-0089 es 0.6", () => {
    expect(UMBRAL_FALLBACK_NUBE).toBe(0.6);
  });

  it("confianza 0.4: cae a baja y ofrece la nube", async () => {
    const e = await resolver_extraccion({ imagen: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }, motor: motorPaddle(0.4) });
    expect(e.nubeOfrecida).toBe(true);
    expect(e.confianza).toEqual({ cuit: "baja", fecha: "baja", total: "baja" });
    expect(e.usoFallbackLocal).toBe(false);
    expect(confianza_global(e.confianza)).toBe("baja");
  });

  it("confianza 0.9: no ofrece la nube", async () => {
    const e = await resolver_extraccion({ imagen: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }, motor: motorPaddle(0.9) });
    expect(e.nubeOfrecida).toBe(false);
    expect(confianza_global(e.confianza)).toBe("media");
  });

  it("confianza 0.6 exacto: el umbral es 'bajo 0.6', no ofrece la nube", async () => {
    const e = await resolver_extraccion({ imagen: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }, motor: motorPaddle(0.6) });
    expect(e.nubeOfrecida).toBe(false);
    expect(confianza_global(e.confianza)).toBe("media");
  });

  it("motor caído: respaldo local (E6), no ofrece la nube", async () => {
    const caido = crear_paddle_cliente({
      endpoint: ENDPOINT,
      fetchFn: async (): Promise<Response> => { throw new Error("down"); },
    });
    const e = await resolver_extraccion({ imagen: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }, motor: caido, cuerpoEmail: "total $ 500,00" });
    expect(e.nubeOfrecida).toBe(false);
    expect(e.usoFallbackLocal).toBe(true);
  });

  it("pdf digital: no ofrece la nube aunque el motor esté disponible", async () => {
    const e = await resolver_extraccion({ pdfTexto: PDF, imagen: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }, motor: motorPaddle(0.4) });
    expect(e.nubeOfrecida).toBe(false);
    expect(e.fuentes).toEqual({ cuit: "pdf", fecha: "pdf", total: "pdf" });
  });

  it("texto directo de OCR: no ofrece la nube", async () => {
    const e = await resolver_extraccion({ ocrTextoDirecto: OCR_BORROSO, imagen: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" } });
    expect(e.nubeOfrecida).toBe(false);
    expect(e.usoFallbackLocal).toBe(true);
  });
});

describe("POST /api/ocr/jobs con fallback de nube (OCR1-S4)", () => {
  it("foto borrosa (0.4): 201 fallback_nube ofrecido, revisa, borrador pendiente", async () => {
    conPaddle(0.4);
    const r = await crear("w-borroso", baseBody());
    expect(r.status).toBe(201);
    expect(r.json["fallback_nube"]).toBe("ofrecido");
    expect(r.json["revisa"]).toBe(true);
    expect(r.json["confianza_global"]).toBe("baja");

    const jobId = r.json["job_id"] as string;
    const ev = eventoListo(jobId);
    expect(ev["fallback_nube"]).toBe("ofrecido");
    expect(ev["confianza_global"]).toBe("baja");
    expect(ev["revisa"]).toBe(true);
    expect(ev["campos_baja"]).toEqual(["cuit", "fecha", "total"]);

    const g = await leerEstado(jobId);
    expect(g.status).toBe(200);
    expect(g.json["estado"]).toBe("pendiente");
    expect(g.json["fallback_nube"]).toBe("ofrecido");
  });

  it("foto nítida (0.9): 201 sin fallback de nube", async () => {
    conPaddle(0.9);
    const r = await crear("w-nítido", baseBody());
    expect(r.status).toBe(201);
    expect(r.json["fallback_nube"]).toBeNull();
    expect(r.json["confianza_global"]).toBe("media");
    expect(r.json["revisa"]).toBe(true);
    expect(eventoListo(r.json["job_id"] as string)["fallback_nube"]).toBeNull();
    expect((await leerEstado(r.json["job_id"] as string)).json["fallback_nube"]).toBeNull();
  });

  it("confianza 0.6 exacto: la respuesta y el GET no ofrecen la nube", async () => {
    conPaddle(0.6);
    const r = await crear("w-umbral", baseBody());
    expect(r.json["fallback_nube"]).toBeNull();
    expect((await leerEstado(r.json["job_id"] as string)).json["fallback_nube"]).toBeNull();
  });

  it("motor caído: 201 sin fallback de nube (E6, no es confianza baja)", async () => {
    paddleCaido();
    const r = await crear("w-caido", baseBody({ cuerpo_email: "adjunto la factura de este mes" }));
    expect(r.status).toBe(201);
    expect(r.json["fallback_nube"]).toBeNull();
    expect(r.json["revisa"]).toBe(true);
    expect(eventoListo(r.json["job_id"] as string)["fallback_nube"]).toBeNull();
    expect((await leerEstado(r.json["job_id"] as string)).json["fallback_nube"]).toBeNull();
  });

  it("pdf digital: 201 sin fallback de nube", async () => {
    delete process.env.OCR_PADDLE_ENDPOINT;
    const r = await crear("w-pdf", baseBody({ texto_pdf: PDF }));
    expect(r.status).toBe(201);
    expect(r.json["confianza_global"]).toBe("alta");
    expect(r.json["revisa"]).toBe(false);
    expect(r.json["fallback_nube"]).toBeNull();
    expect((await leerEstado(r.json["job_id"] as string)).json["fallback_nube"]).toBeNull();
  });
});

describe("AT2 ninguna salida expone la clave ni el endpoint del proveedor", () => {
  it("respuesta, evento y GET del job offered no traen key, secret ni endpoint", async () => {
    conPaddle(0.4);
    const r = await crear("w-at2", baseBody());
    const jobId = r.json["job_id"] as string;
    const salidas = [JSON.stringify(r.json), JSON.stringify(eventoListo(jobId)), JSON.stringify((await leerEstado(jobId)).json)];
    for (const salida of salidas) {
      expect(salida).not.toContain("key");
      expect(salida).not.toContain("secret");
      expect(salida).not.toContain("paddle");
      expect(salida).not.toContain("OCR_PADDLE_ENDPOINT");
    }
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

describe.skipIf(!hayPG)("OCR1-S4 con PG local: el GET deriva el fallback del evento persistido", () => {
  const jobIds: string[] = [];
  const draftKeys: string[] = [];
  const sueltos: string[] = [];

  beforeEach(() => fijarMulti());

  afterEach(async () => {
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      for (const id of [...jobIds, ...sueltos]) {
        await db.delete(ocrEventos).where(sql`payload->>'job_id' = ${id}`);
      }
      for (const id of jobIds) {
        await db.delete(ocrJobs).where(eq(ocrJobs.id, id));
      }
      for (const key of draftKeys) {
        await db.delete(supplierInvoices).where(eq(supplierInvoices.idempotencyKey, key));
        await db.delete(supplierDrafts).where(eq(supplierDrafts.idempotencyKey, key));
      }
    });
    jobIds.length = 0;
    draftKeys.length = 0;
    sueltos.length = 0;
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("job con pdf sale null en A y B; el evento guardado en A devuelve 'ofrecido' solo en A", async () => {
    const r = await conTenant("tenant-a", () => crearRuta(`ocr1-s4-${sufijoPG}`, baseBody({ texto_pdf: PDF })));
    expect(r.status).toBe(201);
    const jobId = r.json["job_id"] as string;
    expect(r.json["fallback_nube"]).toBeNull();
    jobIds.push(jobId);
    draftKeys.push(`ocr-${jobId}`);

    expect(await conTenant("tenant-a", () => buscarFallbackNubeJob(jobId))).toBeNull();
    expect(await conTenant("tenant-b", () => buscarFallbackNubeJob(jobId))).toBeNull();

    const g = await conTenant("tenant-a", () => leerEstado(jobId));
    expect(g.json["estado"]).toBe("confirmable");
    expect(g.json["fallback_nube"]).toBeNull();

    const soloEnDb = `ocr1-s4-suelto-${sufijoPG}`;
    sueltos.push(soloEnDb);
    expect(
      await conTenant("tenant-a", async () => {
        await getTenantDb()
          .insert(ocrEventos)
          .values(filaPg({ tipo: "ocr_borrador_listo", payload: { job_id: soloEnDb, confianza_global: "baja", fallback_nube: "ofrecido", revisa: true } }));
        return store.ocrEventos.some((e) => (e.payload as Record<string, unknown>)["job_id"] === soloEnDb);
      }),
    ).toBe(false);
    expect(await conTenant("tenant-a", () => buscarFallbackNubeJob(soloEnDb))).toBe("ofrecido");
    expect(await conTenant("tenant-b", () => buscarFallbackNubeJob(soloEnDb))).toBeNull();
  });
});
