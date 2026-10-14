import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { idMappings, outbox } from "../src/db/schema.js";
import { deviceSyncState } from "../src/db/schema-sync.js";
import { POST as POSTPush } from "../src/pages/api/sync/push.js";
import { GET as GETPull } from "../src/pages/api/sync/pull.js";
import { POST as POSTPromote } from "../src/pages/api/sync/promote.js";
import { POST as POSTHeartbeat } from "../src/pages/api/sync/heartbeat.js";

const RUTAS_SIN_STORE = [
  "src/pages/api/sync/push.ts",
  "src/pages/api/sync/pull.ts",
  "src/pages/api/sync/promote.ts",
  "src/pages/api/sync/heartbeat.ts",
];

function importaStoreBinding(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s+type\b/.test(linea)) return false;
    if (/^\s*import\s*\{\s*control\s*\}\s*from/.test(linea)) return false;
    return true;
  });
}

describe("PERS2-S21/S22 AT15: sync/* sin store (ADR-0061)", () => {
  it("las 4 rutas no importan el binding store (import type y control permitidos)", () => {
    const mal = RUTAS_SIN_STORE.filter(importaStoreBinding);
    expect(mal).toEqual([]);
  });
});

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function pushReq(opId: string, seq: number, payload: unknown = { seq }): Request {
  return new Request("http://localhost/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": opId },
    body: JSON.stringify({
      op_id: opId,
      device_code: "caja-01",
      device_seq: seq,
      hlc: `${Date.now()}:${seq}`,
      modulo: "sales",
      payload,
      client_occurred_at: new Date().toISOString(),
    }),
  });
}

function promoteReq(opId: string, seq = 5): Request {
  return new Request("http://localhost/api/sync/promote", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": opId },
    body: JSON.stringify({ op_id: opId, device_code: "caja-01", device_seq: seq }),
  });
}

function hbReq(body: unknown): Request {
  return new Request("http://localhost/api/sync/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function pull(cursor: string, limite?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const q = new URLSearchParams({ cursor });
  if (limite !== undefined) q.set("limite", limite);
  const res = (await GETPull({ request: new Request(`http://localhost/api/sync/pull?${q}`) } as never)) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("PERS2-S21/S22 single sin DB: push/pull/promote/heartbeat como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("push 201, replay mismo payload 200 y distinto payload 409", async () => {
    const opId = crypto.randomUUID();
    const payload = { venta: "v1" };
    const r1 = (await POSTPush({ request: pushReq(opId, 7, payload) } as never)) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as Record<string, unknown>;
    expect(j1["op_id"]).toBe(opId);
    expect(typeof j1["cursor_nuevo"]).toBe("string");
    expect(typeof j1["id_mapeado"]).toBe("string");

    const r2 = (await POSTPush({ request: pushReq(opId, 7, payload) } as never)) as Response;
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as Record<string, unknown>)["op_id"]).toBe(opId);

    const r3 = (await POSTPush({ request: pushReq(opId, 7, { venta: "otra" }) } as never)) as Response;
    expect(r3.status).toBe(409);
    expect(((await r3.json()) as Record<string, unknown>)["error"]).toMatch(/op_id duplicado/);
  });

  it("push 422 con device_seq desordenado y con Idempotency-Key distinto de op_id", async () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(((await POSTPush({ request: pushReq(a, 3) } as never)) as Response).status).toBe(201);
    expect(((await POSTPush({ request: pushReq(b, 3) } as never)) as Response).status).toBe(422);

    const c = crypto.randomUUID();
    const mala = new Request("http://localhost/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "otra-clave" },
      body: JSON.stringify({
        op_id: c,
        device_code: "caja-01",
        device_seq: 9,
        hlc: `${Date.now()}:9`,
        modulo: "sales",
        payload: {},
        client_occurred_at: new Date().toISOString(),
      }),
    });
    expect(((await POSTPush({ request: mala } as never)) as Response).status).toBe(422);
  });

  it("pull pagina por cursor con cap 50 y 422 con cursor negativo", async () => {
    const vacio = await pull("0");
    expect(vacio.status).toBe(200);
    expect(vacio.json["movimientos"]).toEqual([]);
    expect(vacio.json["cursor_nuevo"]).toBe("0");
    expect(vacio.json["total"]).toBe(0);

    const op1 = crypto.randomUUID();
    const op2 = crypto.randomUUID();
    expect(((await POSTPush({ request: pushReq(op1, 1) } as never)) as Response).status).toBe(201);
    expect(((await POSTPush({ request: pushReq(op2, 2) } as never)) as Response).status).toBe(201);

    const p0 = await pull("0", "50");
    expect((p0.json["movimientos"] as unknown[])).toHaveLength(2);
    expect(p0.json["cursor_nuevo"]).toBe("2");
    const p1 = await pull("1", "50");
    expect((p1.json["movimientos"] as unknown[])).toHaveLength(1);
    const cap = await pull("0", "200");
    expect(cap.status).toBe(200);
    expect(((await pull("-1")).status)).toBe(422);
  });

  it("promote asigna T-* al op pusheado, replay 200 y 404 con op desconocido", async () => {
    const opId = crypto.randomUUID();
    expect(((await POSTPush({ request: pushReq(opId, 5, { x: 1 }) } as never)) as Response).status).toBe(201);
    const pm = (await POSTPromote({ request: promoteReq(opId) } as never)) as Response;
    expect(pm.status).toBe(201);
    const pmj = (await pm.json()) as Record<string, unknown>;
    expect(pmj["ticket_provisorio"]).toBe("caja-01-5");
    expect(pmj["ticket_definitivo"]).toMatch(/^T-\d{6}$/);

    const pm2 = (await POSTPromote({ request: promoteReq(opId) } as never)) as Response;
    expect(pm2.status).toBe(200);
    expect(((await pm2.json()) as Record<string, unknown>)["ticket_definitivo"]).toBe(pmj["ticket_definitivo"]);

    const pm404 = (await POSTPromote({ request: promoteReq(crypto.randomUUID()) } as never)) as Response;
    expect(pm404.status).toBe(404);
  });

  it("heartbeat verde sin pendientes, ambar con pendientes y 422 sin device_code", async () => {
    const v = (await POSTHeartbeat({ request: hbReq({ device_code: "caja-01", pendientes: 0 }) } as never)) as Response;
    expect(v.status).toBe(200);
    const vj = (await v.json()) as Record<string, unknown>;
    expect(vj["estado"]).toBe("verde");
    expect(vj["aviso"]).toBeNull();

    const a = (await POSTHeartbeat({
      request: hbReq({ device_code: "caja-01", pendientes: 3, ultima_op_hlc: "123:0" }),
    } as never)) as Response;
    expect(a.status).toBe(200);
    expect(((await a.json()) as Record<string, unknown>)["estado"]).toBe("ambar");

    const m = (await POSTHeartbeat({ request: hbReq({ pendientes: 0 }) } as never)) as Response;
    expect(m.status).toBe(422);
  });

  it("heartbeat avisa rojo si el previo supero 72h", async () => {
    const hace80h = new Date(Date.now() - 80 * 3_600_000).toISOString();
    store.deviceSync.set("caja-vieja", { ultimaVistaEn: hace80h, pendientes: 5, ultimaOpHlc: null });
    const res = (await POSTHeartbeat({ request: hbReq({ device_code: "caja-vieja", pendientes: 0 }) } as never)) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j["estado"]).toBe("rojo");
    expect(j["aviso"]).toMatchObject({ nivel: 72, cuarentena: true });
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

const opPG = crypto.randomUUID();
const devicePG = `caja-pg-${sufijoPG}`.slice(0, 32);

function pushPGReq(opId: string, seq: number, device: string, payload: unknown): Request {
  return new Request("http://localhost/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": opId },
    body: JSON.stringify({
      op_id: opId,
      device_code: device,
      device_seq: seq,
      hlc: `${Date.now()}:${seq}`,
      modulo: "sales",
      payload,
      client_occurred_at: new Date().toISOString(),
    }),
  });
}

async function limpiarRastroPG() {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      await db.delete(outbox).where(eq(outbox.opId, opPG));
      await db.delete(idMappings).where(eq(idMappings.opId, opPG));
      await db.delete(deviceSyncState).where(eq(deviceSyncState.deviceCode, devicePG));
    });
  }
}

describe.skipIf(!hayPG)("PERS2-S21/S22 multi con PG local: outbox y heartbeat aislados por tenant", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await limpiarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("operaciones de A quedan en outbox de A, op_id repetido no duplica y B no las ve", async () => {
    fijarMulti();
    const payload = { pg: sufijoPG };
    const r1 = (await conTenant("tenant-a", () =>
      POSTPush({ request: pushPGReq(opPG, 1, devicePG, payload) } as never),
    )) as Response;
    expect(r1.status).toBe(201);
    expect(((await r1.json()) as { fuente: string }).fuente).toBe("db");

    const r2 = (await conTenant("tenant-a", () =>
      POSTPush({ request: pushPGReq(opPG, 1, devicePG, payload) } as never),
    )) as Response;
    expect(r2.status).toBe(200);

    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(outbox).where(eq(outbox.opId, opPG));
    });
    expect(filasA.length).toBe(1);
    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(outbox).where(eq(outbox.opId, opPG));
    });
    expect(filasB.length).toBe(0);
  });

  it("pull en A trae el op de A y pull en B no lo trae", async () => {
    fijarMulti();
    const enA = (await conTenant("tenant-a", () =>
      GETPull({ request: new Request("http://localhost/api/sync/pull?cursor=0&limite=50") } as never),
    )) as Response;
    expect(enA.status).toBe(200);
    const movsA = ((await enA.json()) as { movimientos: Array<{ op_id: string }> }).movimientos;
    expect(movsA.map((m) => m.op_id)).toContain(opPG);

    const enB = (await conTenant("tenant-b", () =>
      GETPull({ request: new Request("http://localhost/api/sync/pull?cursor=0&limite=50") } as never),
    )) as Response;
    expect(enB.status).toBe(200);
    const movsB = ((await enB.json()) as { movimientos: Array<{ op_id: string }> }).movimientos;
    expect(movsB.map((m) => m.op_id)).not.toContain(opPG);
  });

  it("heartbeat de A guarda device_sync_state en A y B no lo ve", async () => {
    fijarMulti();
    const r = (await conTenant("tenant-a", () =>
      POSTHeartbeat({
        request: hbReq({ device_code: devicePG, pendientes: 2, ultima_op_hlc: "9:0" }),
      } as never),
    )) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { estado: string }).estado).toBe("ambar");

    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(deviceSyncState).where(eq(deviceSyncState.deviceCode, devicePG));
    });
    expect(filasA.length).toBe(1);
    expect(filasA[0]?.pendientes).toBe(2);
    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(deviceSyncState).where(eq(deviceSyncState.deviceCode, devicePG));
    });
    expect(filasB.length).toBe(0);
    const enB = await conTenant("tenant-b", () => store.deviceSync.get(devicePG));
    expect(enB).toBeUndefined();
  });
});
