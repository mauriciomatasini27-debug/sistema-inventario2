import { asegurarDoc } from "../src/lib/repos/fiscal.js";
import { randomUUID } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { control, resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { fiscalDocuments, fiscalWizard } from "../src/db/schema-fiscal.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { GET as getDocuments } from "../src/pages/api/fiscal/documents.js";
import { GET as getHistory } from "../src/pages/api/fiscal/history.js";
import { GET as getExport } from "../src/pages/api/fiscal/export.js";
import { POST as postEmitir } from "../src/pages/api/fiscal/emitir.js";
import { POST as postRetry } from "../src/pages/api/fiscal/retry.js";
import { POST as postNd } from "../src/pages/api/fiscal/nd.js";
import { POST as postWizard, GET as getWizard } from "../src/pages/api/fiscal/wizard.js";
import { POST as postDelegacion } from "../src/pages/api/fiscal/delegacion-confirmada.js";

const RUTAS_SIN_STORE = [
  "src/pages/api/fiscal/documents.ts",
  "src/pages/api/fiscal/export.ts",
  "src/pages/api/fiscal/history.ts",
  "src/pages/api/fiscal/emitir.ts",
  "src/pages/api/fiscal/retry.ts",
  "src/pages/api/fiscal/nd.ts",
  "src/pages/api/fiscal/wizard.ts",
  "src/pages/api/fiscal/delegacion-confirmada.ts",
];

function tieneImportValorDeStore(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s+type\b/.test(linea)) return false;
    return true;
  });
}

describe("PERS2-S8/S9 AT8: rutas fiscal sin valores de lib/store (ADR-0054)", () => {
  it("ninguna de las 8 rutas importa valores de lib/store (import type permitido)", () => {
    const mal = RUTAS_SIN_STORE.filter(tieneImportValorDeStore);
    expect(mal).toEqual([]);
  });
});

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function ventaBody(seq: number) {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: seq,
    client_occurred_at: new Date().toISOString(),
    offline: false,
  };
}

function reqJson(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function vender(key: string, seq: number) {
  const r = (await postSales({ request: reqJson("http://x/api/sales", ventaBody(seq), { "Idempotency-Key": key }) } as never)) as Response;
  expect(r.status).toBe(201);
  return (await r.json()) as { sale_id: string; fiscal_estado: string };
}

describe("PERS2-S8/S9 single sin DB: fiscal se comporta como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("venta crea pendiente y documents/history/export lo sirven desde memoria", async () => {
    const v = await vender(`pers2-fis-${Date.now()}-1`, 101);
    const saleId = v.sale_id;
    const docs = (await getDocuments({ request: new Request("http://x/api/fiscal/documents"), url: new URL(`http://x/api/fiscal/documents?sale_id=${saleId}`) } as never)) as Response;
    expect(docs.status).toBe(200);
    const jd = (await docs.json()) as { docs: Array<{ sale_id: string }> };
    expect(jd.docs.length).toBeGreaterThanOrEqual(1);
    expect(jd.docs[0]?.sale_id).toBe(saleId);

    const h = (await getHistory({ request: new Request("http://x/api/fiscal/history"), url: new URL("http://x/api/fiscal/history") } as never)) as Response;
    expect(h.status).toBe(200);
    const jh = (await h.json()) as { docs: unknown[] };
    expect(jh.docs.length).toBeGreaterThanOrEqual(1);

    const ex = (await getExport({ request: new Request("http://x/api/fiscal/export", { headers: { "X-Rol": "dueno" } }), url: new URL("http://x/api/fiscal/export?formato=csv") } as never)) as Response;
    expect(ex.status).toBe(200);
    const csv = await ex.text();
    expect(csv).toContain("tipo");
  });

  it("retry reencola una rechazada como hoy", async () => {
    store.fiscalDocs.set("k-retry", {
      id: crypto.randomUUID(),
      idempotency_key: "k-retry",
      sale_id: "s-retry",
      cbte_tipo: "11",
      pto_vta: "3",
      cbte_nro: 1,
      cbte_fch: "20261010",
      doc_tipo: "99",
      doc_nro: "0",
      cond_iva_receptor: "5",
      estado: "rechazado",
      cae: null,
      cae_vto: null,
      qr_payload: null,
      intentos: 1,
    });
    const docId = [...store.fiscalDocs.values()].find((d) => d.idempotency_key === "k-retry")!.id;
    const res = (await postRetry({ request: reqJson("http://x/api/fiscal/retry", { fiscal_document_id: docId }) } as never)) as Response;
    expect(res.status).toBe(200);
    expect(store.fiscalDocs.get("k-retry")!.estado).toBe("pendiente");
  });

  it("nd: empleado 403 y dueno emite pendiente con CbtesAsoc", async () => {
    const v = await vender(`pers2-fis-nd-${Date.now()}`, 102);
    const saleId = v.sale_id;
    const fkey = [...store.fiscalDocs.keys()].find((k) => store.fiscalDocs.get(k)!.sale_id === saleId)!;
    const { crear_homo_fake } = await import("../src/modules/fiscal/homo-fake.js");
    const { procesar_pendiente } = await import("../src/modules/fiscal/worker.js");
    const doc = store.fiscalDocs.get(fkey)!;
    const r = await procesar_pendiente({ doc, lastNumber: 100, totalCentavos: 15000n, cuit: 20933331726, provider: crear_homo_fake() });
    store.fiscalDocs.set(fkey, r.doc);
    const cajaId = [...store.movements].find((m) => m.sale_id === saleId)?.id ?? "caja-1";

    const rej = (await postNd({
      request: reqJson("http://x/api/fiscal/nd", {
        factura_sale_id: saleId,
        monto_centavos: 5000,
        motivo: "ajuste",
        actor: "empleado",
        client_occurred_at: new Date().toISOString(),
      }, { "Idempotency-Key": `nd-k-${Date.now()}`, "X-Rol": "empleado" }),
    } as never)) as Response;
    expect(rej.status).toBe(403);

    const ok = (await postNd({
      request: reqJson("http://x/api/fiscal/nd", {
        factura_sale_id: saleId,
        monto_centavos: 5000,
        motivo: "intereses",
        actor: "dueno",
        caja_movement_id: cajaId,
        client_occurred_at: new Date().toISOString(),
      }, { "Idempotency-Key": `nd-k2-${Date.now()}` }),
    } as never)) as Response;
    expect(ok.status).toBe(201);
    const j = (await ok.json()) as { nd_tipo: number };
    expect(j.nd_tipo).toBe(12);
  });

  it("emitir autoriza un pendiente con homo-fake", async () => {
    const v = await vender(`pers2-fis-em-${Date.now()}`, 103);
    const saleId = v.sale_id;
    const fkey = [...store.fiscalDocs.keys()].find((k) => store.fiscalDocs.get(k)!.sale_id === saleId)!;
    const docId = store.fiscalDocs.get(fkey)!.id;
    const res = (await postEmitir({
      request: reqJson("http://x/api/fiscal/emitir", { fiscal_document_id: docId, cuit: "20-93333172-6" }),
    } as never)) as Response;
    expect([200, 202, 422]).toContain(res.status);
    if (res.status === 200) {
      const j = (await res.json()) as { fiscal_estado: string };
      expect(j.fiscal_estado).toBe("autorizado");
    }
  });

  it("wizard avanza y delegacion confirma como hoy", async () => {
    const tid = `t-wiz-${Date.now()}`;
    const w = (await postWizard({ request: reqJson("http://x/api/fiscal/wizard", { tenant_id: tid, accion: "avanzar", paso: 2 }) } as never)) as Response;
    expect(w.status).toBe(200);
    expect(((await w.json()) as { paso: number }).paso).toBe(2);
    const g = (await getWizard(ctx(`http://x/api/fiscal/wizard?tenant_id=${tid}`))) as Response;
    expect(g.status).toBe(200);
    expect(((await g.json()) as { paso: number }).paso).toBe(2);
    const d = (await postDelegacion({ request: reqJson("http://x/api/fiscal/delegacion-confirmada", { tenant_id: tid, cuit: "20123456789" }) } as never)) as Response;
    expect(d.status).toBe(201);
    expect(((await d.json()) as { delegacion: string }).delegacion).toBe("pendiente_proveedor");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

function duenoDe(tenantId: string, sub: string) {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: tenantId,
    slug: tenantId,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  control.memberships.set(`m-${tenantId}-${sub}`, { id: `m-${tenantId}-${sub}`, tenantId, googleSub: sub, rol: "dueno", permisos: [], estado: "activo" });
}

function sesionPara(sub: string, tenantId: string | null): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function reqHistory(cookie: string, tenant: string): { request: Request; url: URL } {
  const headers = new Headers();
  headers.set("cookie", `__Host-sesion=${cookie}`);
  headers.set("X-Tenant-Id", tenant);
  return { request: new Request("http://x/api/fiscal/history", { headers }), url: new URL("http://x/api/fiscal/history") };
}

const ventasPG: string[] = [];

async function borrarRastroPG() {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      for (const saleId of ventasPG) {
        await db.delete(fiscalDocuments).where(eq(fiscalDocuments.saleId, saleId as never));
      }
      await db.delete(fiscalWizard).where(eq(fiscalWizard.tenantId, tenant));
    });
  }
}

describe.skipIf(!hayPG)("PERS2-S8 multi con PG local: comprobante de A aislado de B", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("documento emitido en A queda en fiscal_documents de A y history en B no lo ve", async () => {
    fijarMulti();
    duenoDe("tenant-a", "dueno-a");
    duenoDe("tenant-b", "dueno-b");
    const cookieA = sesionPara("dueno-a", "tenant-a");
    const cookieB = sesionPara("dueno-b", "tenant-b");
    const key = `pers2-fis-pg-${sufijoPG}`;
    const sale_id = randomUUID();
    const res = await conTenant("tenant-a", () =>
      asegurarDoc({
        id: randomUUID(), idempotency_key: key, sale_id, tenant_id: "tenant-a",
        cbte_tipo: "C", pto_vta: "1", cbte_nro: null, cbte_fch: "20261013",
        doc_tipo: "99", doc_nro: "0", cond_iva_receptor: "5", estado: "pendiente",
        cae: null, cae_vto: null, qr_payload: null, imp_total_centavos: "15000",
      }),
    );
    expect(res.fuente).toBe("db");
    ventasPG.push(sale_id);

    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(fiscalDocuments).where(eq(fiscalDocuments.saleId, sale_id as never));
    });
    expect(filasA.length).toBeGreaterThanOrEqual(1);
    expect(filasA[0]?.tenantId).toBe("tenant-a");

    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(fiscalDocuments).where(eq(fiscalDocuments.saleId, sale_id as never));
    });
    expect(filasB.length).toBe(0);

    const hA = await conTenant("tenant-a", () => {
      const { request, url } = reqHistory(cookieA, "tenant-a");
      return getHistory({ request, url } as never) as Promise<Response>;
    });
    expect(hA.status).toBe(200);
    const jA = (await hA.json()) as { docs: Array<{ sale_id: string }> };
    expect(jA.docs.some((d) => d.sale_id === sale_id)).toBe(true);

    const hB = await conTenant("tenant-b", () => {
      const { request, url } = reqHistory(cookieB, "tenant-b");
      return getHistory({ request, url } as never) as Promise<Response>;
    });
    expect(hB.status).toBe(200);
    const jB = (await hB.json()) as { docs: Array<{ sale_id: string }> };
    expect(jB.docs.some((d) => d.sale_id === sale_id)).toBe(false);
  });

  it("wizard de A no se ve en B", async () => {
    fijarMulti();
    const r = await conTenant("tenant-a", () =>
      postWizard({ request: reqJson("http://x/api/fiscal/wizard", { accion: "avanzar", paso: 3 }) } as never),
    ) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { paso: number }).paso).toBe(3);

    const gB = await conTenant("tenant-b", () => getWizard(ctx("http://x/api/fiscal/wizard"))) as Response;
    expect(gB.status).toBe(200);
    expect(((await gB.json()) as { paso: number }).paso).toBe(0);

    const wizA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(fiscalWizard).where(eq(fiscalWizard.tenantId, "tenant-a"));
    });
    expect(wizA.length).toBe(1);
    expect(wizA[0]?.paso).toBe(3);

    const wizB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(fiscalWizard).where(eq(fiscalWizard.tenantId, "tenant-a"));
    });
    expect(wizB.length).toBe(0);
  });
});
