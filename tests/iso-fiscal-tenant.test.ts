import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store, type StoredFiscalDoc } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { getTenantDb } from "../src/lib/db.js";
import { GET as GETHistory } from "../src/pages/api/fiscal/history.js";
import { readFileSync } from "node:fs";

const TA = "tenant-a";
const TB = "tenant-b";

function sembrarTenant(id: string, dueno: string) {
  control.tenants.set(id, {
    id,
    nombreComercio: id,
    slug: id,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: true,
  });
}

function sembrarMembership(tenantId: string, googleSub: string) {
  control.memberships.set(`${tenantId}:${googleSub}`, {
    id: `${tenantId}:${googleSub}`,
    tenantId,
    googleSub,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
}

function cookieSesion(sub: string, tenantId: string | null): string {
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
  return `__Host-sesion=${c.idPlano}`;
}

function docFiscal(key: string, tenantId?: string): StoredFiscalDoc {
  return {
    id: crypto.randomUUID(),
    idempotency_key: key,
    sale_id: "venta-1",
    cbte_tipo: "11",
    pto_vta: "3",
    cbte_nro: 1,
    cbte_fch: "20261013",
    doc_tipo: "99",
    doc_nro: "0",
    cond_iva_receptor: "5",
    estado: "autorizado",
    cae: "owe",
    cae_vto: null,
    qr_payload: null,
    ...(tenantId !== undefined ? { tenant_id: tenantId } : {}),
  };
}

function pedirHistory(init?: { cookie?: string; tenant?: string }) {
  const headers: Record<string, string> = {};
  if (init?.cookie) headers["cookie"] = init.cookie;
  if (init?.tenant) headers["X-Tenant-Id"] = init.tenant;
  return conTenant(TA, () =>
    GETHistory(ctx("http://x/api/fiscal/history", { headers })),
  ) as Promise<Response>;
}

beforeEach(() => {
  resetStore();
  delete process.env.TENANT_DATABASE_URL;
  // El legado sin dueño queda en single para la regresión sin TENANT_MODE.
  store.fiscalDocs.set("doc-legado", docFiscal("doc-legado"));
  process.env.TENANT_MODE = "multi";
  sembrarTenant(TA, "user-a");
  sembrarTenant(TB, "user-b");
  sembrarMembership(TA, "user-a");
  sembrarMembership(TB, "user-b");
  // Semilla por tenant: en multi la memoria exige contexto (PERS2-S1).
  conTenant(TA, () => {
    store.fiscalDocs.set("doc-a", docFiscal("doc-a", TA));
    store.fiscalDocs.set("doc-b", docFiscal("doc-b", TB));
    store.fiscalDocs.set("doc-legado", docFiscal("doc-legado"));
  });
});

afterEach(() => {
  delete process.env.TENANT_MODE;
});

describe("ISO-S4 aislamiento fiscal por tenant", () => {
  it("A pide history y solo ve sus docs (ni B ni legados sin tenant)", async () => {
    const r = await pedirHistory({ cookie: cookieSesion("user-a", TA), tenant: TA });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { docs: StoredFiscalDoc[] };
    expect(j.docs.map((d) => d.idempotency_key).sort()).toEqual(["doc-a"]);
  });

  it("sin sesión en multi responde 403", async () => {
    const r = await pedirHistory({ tenant: TA });
    expect(r.status).toBe(403);
  });

  it("sesión de A con tenant ajeno responde 403 y registra acceso_denegado", async () => {
    const r = await pedirHistory({ cookie: cookieSesion("user-a", TA), tenant: TB });
    expect(r.status).toBe(403);
    expect(control.events.some((e) => e.tipo === "acceso_denegado" && e.tenantId === TB)).toBe(true);
  });

  it("getTenantDb sin tenant en multi lanza en vez de usar la base compartida", () => {
    expect(() => getTenantDb()).toThrow(/Falta tenant/);
  });

  it("getTenantDb con tenant sin base propia en multi lanza, nunca usa la compartida", () => {
    process.env.TENANT_DATABASE_URL = "postgres://compartida@127.0.0.1:1/x";
    expect(() => getTenantDb(TA)).toThrow(/TENANT_DATABASE_URL_tenant-a/);
    delete process.env.TENANT_DATABASE_URL;
  });
});

describe("ISO regresión modo single", () => {
  it("sin TENANT_MODE responde 200 sin sesión y muestra docs de slice0 y legados", async () => {
    delete process.env.TENANT_MODE;
    store.fiscalDocs.set("doc-legado", docFiscal("doc-legado"));
    store.fiscalDocs.set("doc-s0", docFiscal("doc-s0", "slice0"));
    const r = await pedirHistory();
    expect(r.status).toBe(200);
    const j = (await r.json()) as { docs: StoredFiscalDoc[] };
    expect(j.docs.map((d) => d.idempotency_key).sort()).toEqual(["doc-legado", "doc-s0"]);
  });
});

describe("ISO arch-tests", () => {
  it("AT2: rutas fiscales de lectura nunca llaman leerFiscalDocs() sin tenant", () => {
    for (const r of ["documents", "history", "export"]) {
      const src = readFileSync(`src/pages/api/fiscal/${r}.ts`, "utf8");
      // ADR-0054: la lectura pasa por src/lib/repos/fiscal.ts, siempre con tenant.
      expect(src, r).toMatch(/listarFiscalDocs\(t\.tenantId\)/);
      expect(src, r).not.toMatch(/(leer|listar)FiscalDocs\(\)/);
    }
    const repo = readFileSync("src/lib/repos/fiscal.ts", "utf8");
    expect(repo).not.toMatch(/leerFiscalDocs\(\)/);
  });
});
