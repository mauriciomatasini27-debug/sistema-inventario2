import { describe, expect, it, afterEach } from "vitest";
import { gateJob } from "../src/lib/tenant-context.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";

const SECRETO = "secreto-pers2-s3";

function peticion(encabezados: Record<string, string>): Request {
  return new Request("http://test/api/jobs/cierre-medianoche", { headers: encabezados });
}

function fijarTenant(id: string, estado: string) {
  control.tenants.set(id, {
    id,
    nombreComercio: id,
    slug: id,
    estado,
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueño-1",
    esDemo: false,
  });
}

function modoMulti() {
  process.env.TENANT_MODE = "multi";
  process.env.JOBS_SECRET = SECRETO;
}

function modoSingle() {
  delete process.env.TENANT_MODE;
  process.env.JOBS_SECRET = SECRETO;
}

afterEach(() => {
  delete process.env.TENANT_MODE;
  delete process.env.JOBS_SECRET;
  delete process.env.DEFAULT_TENANT_ID;
  resetStore();
  conTenant("tenant-a", () => resetStore());
  conTenant("tenant-b", () => resetStore());
});

describe("PERS2-S3 gateJob", () => {
  it("multi con secreto válido sin X-Tenant-Id responde 403 E5", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const r = gateJob(peticion({ "X-Job-Secret": SECRETO }));
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
    if (!r!.ok) {
      expect(r!.respuesta.status).toBe(403);
      expect(await r!.respuesta.json()).toEqual({ error: "No tenés permiso para ver este comercio." });
    }
  });

  it("multi con tenant desconocido responde 403 E5", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const r = gateJob(peticion({ "X-Job-Secret": SECRETO, "X-Tenant-Id": "fantasma" }));
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
    if (!r!.ok) {
      expect(r!.respuesta.status).toBe(403);
      expect(await r!.respuesta.json()).toEqual({ error: "No tenés permiso para ver este comercio." });
    }
  });

  it("multi con tenant activo deja pasar con ese tenant", () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const r = gateJob(peticion({ "X-Job-Secret": SECRETO, "X-Tenant-Id": "tenant-a" }));
    expect(r).toEqual({ ok: true, tenantId: "tenant-a" });
  });

  it("multi con tenant suspendido deja pasar con ese tenant", () => {
    modoMulti();
    fijarTenant("tenant-a", "suspendido");
    const r = gateJob(peticion({ "X-Job-Secret": SECRETO, "X-Tenant-Id": "tenant-a" }));
    expect(r).toEqual({ ok: true, tenantId: "tenant-a" });
  });

  it("secreto inválido no pasa por el gate de jobs", () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    expect(gateJob(peticion({ "X-Job-Secret": "otro" }))).toBeNull();
    expect(gateJob(peticion({}))).toBeNull();
  });

  it("single con secreto válido corre como tenant por defecto", () => {
    modoSingle();
    const r = gateJob(peticion({ "X-Job-Secret": SECRETO }));
    expect(r).toEqual({ ok: true, tenantId: "slice0" });
  });
});
