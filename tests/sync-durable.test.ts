import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { deviceSyncState, offlineGrants, syncState } from "../src/db/schema-sync.js";
import {
  persistirDeviceSync,
  persistirIdMapping,
  persistirOfflineGrant,
  persistirOutboxOp,
  revocarOfflineGrantDb,
} from "../src/lib/control-db.js";
import { POST as POSTPush } from "../src/pages/api/sync/push.js";
import { GET as GETBalance } from "../src/pages/api/cash/balance.js";
import { resetStore } from "../src/lib/store.js";

describe("sync durable SYNC-S1/S3/S5 (sin DB no rompe)", () => {
  beforeEach(() => {
    resetStore();
    delete process.env.CONTROL_DATABASE_URL;
  });

  it("schema expone device_sync_state + sync_state + offline_grants", () => {
    expect(deviceSyncState.deviceCode).toBeDefined();
    expect(syncState.tenantId).toBeDefined();
    expect(offlineGrants.grantId).toBeDefined();
  });

  it("write-through best-effort resuelve false sin env y no lanza", async () => {
    await expect(
      persistirDeviceSync({ deviceCode: "caja-01", ultimaVistaEn: new Date().toISOString(), pendientes: 0, ultimaOpHlc: null }),
    ).resolves.toBe(false);
    await expect(
      persistirOfflineGrant({
        grantId: "g-1",
        tokenHash: "h",
        tenantId: "t-1",
        googleSub: "s-1",
        deviceCode: "caja-01",
        alcance: "venta",
        expiraEn: new Date().toISOString(),
      }),
    ).resolves.toBe(false);
    await expect(revocarOfflineGrantDb("g-1")).resolves.toBe(false);
    await expect(
      persistirOutboxOp({ opId: crypto.randomUUID(), deviceCode: "caja-01", deviceSeq: 1, hlc: "1:0", modulo: "sales", payload: {} }),
    ).resolves.toBe(false);
    await expect(persistirIdMapping({ opId: crypto.randomUUID(), idProvisorio: "p", idDefinitivo: "srv-p" })).resolves.toBe(false);
  });

  it("push 201 + replay con write-through activo (memoria manda)", async () => {
    const opId = crypto.randomUUID();
    const body = {
      op_id: opId,
      device_code: "caja-01",
      device_seq: 1,
      hlc: "1:0",
      modulo: "sales",
      payload: { total: 100 },
      client_occurred_at: new Date().toISOString(),
    };
    const req1 = new Request("http://localhost/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": opId },
      body: JSON.stringify(body),
    });
    const r1 = (await POSTPush({ request: req1 } as never)) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as Record<string, unknown>;
    expect(j1["id_mapeado"]).toBe(`srv-${opId.slice(0, 8)}`);
    const r2 = (await POSTPush({
      request: new Request("http://localhost/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": opId },
        body: JSON.stringify(body),
      }),
    } as never)) as Response;
    expect(r2.status).toBe(200);
  });

  it("balance sin DB cae a memoria y cuadra (PERS-S3)", async () => {
    const b = (await GETBalance(ctx("http://x/api/cash/balance"))) as Response;
    expect(b.status).toBe(200);
    const j = (await b.json()) as { por_medio: Record<string, string>; total: string; fuente: string };
    expect(j.fuente).toBe("memoria");
    expect(typeof j.total).toBe("string");
  });
});
