import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { enCuarentena, horasSinSync, nivelAviso } from "../src/offline/avisos.js";
import { ejecutarAvisoSync } from "../src/jobs/aviso-sync.js";
import { POST as POSTHeartbeat } from "../src/pages/api/sync/heartbeat.js";
import { POST as POSTAviso } from "../src/pages/api/jobs/aviso-sync.js";
import { resetStore, store } from "../src/lib/store.js";

const SECRET = "job-secret-sync";

function hbReq(body: unknown): Request {
  return new Request("http://localhost/api/sync/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sync avisos SYNC-S4 (PRD-SYNC-01)", () => {
  beforeEach(() => {
    resetStore();
    process.env.JOBS_SECRET = SECRET;
  });

  it("niveles puros: 0→null, 24→24, 60→60, 72→72 + cuarentena", () => {
    expect(nivelAviso(0)).toBeNull();
    expect(nivelAviso(23.9)).toBeNull();
    expect(nivelAviso(24)).toBe(24);
    expect(nivelAviso(59)).toBe(24);
    expect(nivelAviso(60)).toBe(60);
    expect(nivelAviso(71.9)).toBe(60);
    expect(nivelAviso(72)).toBe(72);
    expect(enCuarentena(71.9)).toBe(false);
    expect(enCuarentena(72)).toBe(true);
    const base = new Date("2026-10-12T00:00:00Z");
    const hace25h = new Date(base.getTime() - 25 * 3_600_000).toISOString();
    expect(Math.round(horasSinSync(hace25h, base))).toBe(25);
  });

  it("job lista solo devices vencidos con nivel y cuarentena", () => {
    const ahora = new Date("2026-10-12T12:00:00Z");
    const iso = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString();
    store.deviceSync.set("caja-ok", { ultimaVistaEn: iso(1), pendientes: 0, ultimaOpHlc: null });
    store.deviceSync.set("caja-24", { ultimaVistaEn: iso(25), pendientes: 2, ultimaOpHlc: null });
    store.deviceSync.set("caja-72", { ultimaVistaEn: iso(80), pendientes: 0, ultimaOpHlc: null });
    const r = ejecutarAvisoSync(ahora);
    expect(r.revisados).toBe(3);
    expect(r.avisos.map((a) => a.device_code).sort()).toEqual(["caja-24", "caja-72"]);
    expect(r.avisos.find((a) => a.device_code === "caja-24")?.nivel).toBe(24);
    const a72 = r.avisos.find((a) => a.device_code === "caja-72");
    expect(a72?.nivel).toBe(72);
    expect(a72?.cuarentena).toBe(true);
  });

  it("heartbeat avisa y pone rojo si el previo superó 72h", async () => {
    const ahora = Date.now();
    const hace80h = new Date(ahora - 80 * 3_600_000).toISOString();
    store.deviceSync.set("caja-vieja", { ultimaVistaEn: hace80h, pendientes: 5, ultimaOpHlc: null });
    const res = (await POSTHeartbeat({
      request: hbReq({ device_code: "caja-vieja", pendientes: 0 }),
    } as never)) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j["estado"]).toBe("rojo");
    expect(j["aviso"]).toMatchObject({ nivel: 72, cuarentena: true });
  });

  it("ruta job exige secreto y responde revisados + avisos", async () => {
    const sin = (await POSTAviso(ctx("http://x/api/jobs/aviso-sync", { method: "POST" }))) as Response;
    expect(sin.status).toBe(403);
    const con = (await POSTAviso({
      request: new Request("http://x/api/jobs/aviso-sync", { method: "POST", headers: { "X-Job-Secret": SECRET } }),
    } as never)) as Response;
    expect(con.status).toBe(200);
    const j = (await con.json()) as { revisados: number; avisos: unknown[] };
    expect(typeof j.revisados).toBe("number");
    expect(Array.isArray(j.avisos)).toBe(true);
  });
});
