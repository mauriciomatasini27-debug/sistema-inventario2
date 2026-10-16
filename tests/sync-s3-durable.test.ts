import { beforeEach, describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { deviceSyncState } from "../src/db/schema-sync.js";
import { POST as POSTHeartbeat } from "../src/pages/api/sync/heartbeat.js";
import { ejecutarAvisoSync } from "../src/jobs/aviso-sync.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function hbCtx(body: Record<string, unknown>) {
  return ctx("http://localhost/api/sync/heartbeat", { body });
}

describe("SYNC-S3/S4 durable memoria: comportamiento sin DB intacto", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("heartbeat verde registra en memoria y aviso rojo con previo viejo", async () => {
    const v = (await POSTHeartbeat(hbCtx({ device_code: "caja-mem-01", pendientes: 0 }))) as Response;
    expect(v.status).toBe(200);
    expect(((await v.json()) as Record<string, unknown>)["estado"]).toBe("verde");
    expect(store.deviceSync.get("caja-mem-01")?.pendientes).toBe(0);

    const hace80h = new Date(Date.now() - 80 * 3_600_000).toISOString();
    store.deviceSync.set("caja-vieja-mem", { ultimaVistaEn: hace80h, pendientes: 5, ultimaOpHlc: null });
    const r = (await POSTHeartbeat(hbCtx({ device_code: "caja-vieja-mem", pendientes: 0 }))) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as Record<string, unknown>)["estado"]).toBe("rojo");
  });

  it("job memoria lista vencidos sin mutar (doble corrida repite)", () => {
    const ahora = new Date("2026-10-12T12:00:00Z");
    const iso = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString();
    store.deviceSync.set("caja-ok", { ultimaVistaEn: iso(1), pendientes: 0, ultimaOpHlc: null });
    store.deviceSync.set("caja-24", { ultimaVistaEn: iso(25), pendientes: 2, ultimaOpHlc: null });
    const r1 = ejecutarAvisoSync(ahora);
    const r2 = ejecutarAvisoSync(ahora);
    expect(r1.avisos.map((a) => a.device_code)).toEqual(["caja-24"]);
    expect(r2.avisos.map((a) => a.device_code)).toEqual(["caja-24"]);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijo = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`.slice(0, 12);
const deviceA = `s3-${sufijo}-a`.slice(0, 32);
const deviceViejo = `s3-${sufijo}-v`.slice(0, 32);
const device24 = `s3-${sufijo}-24`.slice(0, 32);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function aplicarMigraciones(db: ReturnType<typeof getTenantDb>) {
  const { readFileSync } = await import("node:fs");
  const { sql } = await import("drizzle-orm");
  for (const f of ["drizzle/0007_sync_state_grants.sql", "drizzle/0024_device_sync_avisos.sql"]) {
    let mig: string;
    try {
      mig = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const parte of mig.split("--> statement-breakpoint")) {
      const stmt = parte.trim();
      if (stmt) await db.execute(sql.raw(stmt));
    }
  }
}

async function limpiarPG() {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      for (const d of [deviceA, deviceViejo, device24]) {
        await db.delete(deviceSyncState).where(eq(deviceSyncState.deviceCode, d));
      }
    });
  }
}

describe.skipIf(!hayPG)("SYNC-S3/S4 durable PG: heartbeat y avisos DB-first", () => {
  beforeAll(async () => {
    fijarMulti();
    resetStore();
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => aplicarMigraciones(getTenantDb()));
    }
    await limpiarPG();
  });

  afterAll(async () => {
    fijarMulti();
    await limpiarPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("heartbeat persiste en PG y memoria fresca relee desde DB", async () => {
    fijarMulti();
    const { guardarLatido, leerLatidoPrevioDuro } = await import("../src/lib/repos/sync.js");
    const hace80h = new Date(Date.now() - 80 * 3_600_000).toISOString();
    await conTenant("tenant-a", () =>
      guardarLatido({ deviceCode: deviceViejo, ultimaVistaEn: hace80h, pendientes: 5, ultimaOpHlc: "7:0" }),
    );
    const filaA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(deviceSyncState).where(eq(deviceSyncState.deviceCode, deviceViejo));
    });
    expect(filaA.length).toBe(1);
    expect(filaA[0]?.pendientes).toBe(5);

    resetStore();
    fijarMulti();
    const previo = await conTenant("tenant-a", () => leerLatidoPrevioDuro(deviceViejo));
    expect(previo?.pendientes).toBe(5);
    expect(previo?.ultimaOpHlc).toBe("7:0");

    const res = (await conTenant("tenant-a", () =>
      POSTHeartbeat(hbCtx({ device_code: deviceViejo, pendientes: 0 })),
    )) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j["estado"]).toBe("rojo");
    expect(j["aviso"]).toMatchObject({ nivel: 72, cuarentena: true });
  });

  it("tenant B no ve el device de A", async () => {
    fijarMulti();
    const r = (await conTenant("tenant-a", () =>
      POSTHeartbeat(hbCtx({ device_code: deviceA, pendientes: 2, ultima_op_hlc: "9:0" })),
    )) as Response;
    expect(r.status).toBe(200);

    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(deviceSyncState).where(eq(deviceSyncState.deviceCode, deviceA));
    });
    expect(filasB.length).toBe(0);
    const { leerLatidoPrevioDuro } = await import("../src/lib/repos/sync.js");
    const previoB = await conTenant("tenant-b", () => leerLatidoPrevioDuro(deviceA));
    expect(previoB).toBeNull();
  });

  it("aviso concurrente marca una sola vez (UPDATE condicional)", async () => {
    fijarMulti();
    const { guardarLatido, leerLatidoPrevioDuro } = await import("../src/lib/repos/sync.js");
    const { ejecutarAvisoSyncDuro } = await import("../src/jobs/aviso-sync.js");
    expect(typeof leerLatidoPrevioDuro).toBe("function");
    const hace25h = new Date(Date.now() - 25 * 3_600_000).toISOString();
    await conTenant("tenant-a", () =>
      guardarLatido({ deviceCode: device24, ultimaVistaEn: hace25h, pendientes: 1, ultimaOpHlc: null }),
    );

    const [r1, r2] = await Promise.all([
      conTenant("tenant-a", () => ejecutarAvisoSyncDuro(new Date())),
      conTenant("tenant-a", () => ejecutarAvisoSyncDuro(new Date())),
    ]);
    const todos = [...r1.avisos, ...r2.avisos].filter((a) => a.device_code === device24);
    expect(todos.length).toBe(1);
    expect(todos[0]?.nivel).toBe(24);

    const r3 = await conTenant("tenant-a", () => ejecutarAvisoSyncDuro(new Date()));
    expect(r3.avisos.map((a) => a.device_code)).not.toContain(device24);
  });
});
