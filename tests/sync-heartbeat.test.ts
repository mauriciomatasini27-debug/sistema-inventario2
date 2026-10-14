import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { POST as POSTHeartbeat } from "../src/pages/api/sync/heartbeat.js";
import { GET as GETHealth } from "../src/pages/api/health.js";
import { resetStore, store } from "../src/lib/store.js";

describe("sync heartbeat SYNC-S3/S4 (PRD-SYNC-01)", () => {
  beforeEach(() => resetStore());

  it("GET /api/health responde ok + ahora", async () => {
    const res = (await GETHealth(ctx("http://x/api/health"))) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j["ok"]).toBe(true);
    expect(typeof j["ahora"]).toBe("string");
  });

  it("heartbeat sin pendientes queda verde y registra device_sync", async () => {
    const res = (await POSTHeartbeat(
      ctx("http://localhost/api/sync/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { device_code: "caja-01", pendientes: 0 },
      }),
    )) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j["estado"]).toBe("verde");
    expect(j["aviso"]).toBeNull();
    expect(store.deviceSync.get("caja-01")?.pendientes).toBe(0);
  });

  it("heartbeat con pendientes queda ámbar", async () => {
    const res = (await POSTHeartbeat(
      ctx("http://localhost/api/sync/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { device_code: "caja-01", pendientes: 3, ultima_op_hlc: "123:0" },
      }),
    )) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j["estado"]).toBe("ambar");
    expect(store.deviceSync.get("caja-01")?.ultimaOpHlc).toBe("123:0");
  });

  it("422 sin device_code o pendientes negativos", async () => {
    const r1 = (await POSTHeartbeat(
      ctx("http://localhost/api/sync/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendientes: 0 }),
      }),
    )) as Response;
    expect(r1.status).toBe(422);
    const r2 = (await POSTHeartbeat(
      ctx("http://localhost/api/sync/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { device_code: "caja-01", pendientes: -1 },
      }),
    )) as Response;
    expect(r2.status).toBe(422);
  });
});
