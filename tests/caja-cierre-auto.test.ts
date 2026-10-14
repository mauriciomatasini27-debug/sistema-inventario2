import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { POST as POSTAuto } from "../src/pages/api/jobs/cierre-medianoche.js";
import { ejecutar_cierre_medianoche } from "../src/jobs/cierre-medianoche.js";
import type { CierreOk } from "../src/modules/cash/cierre.js";
import { resetStore, store } from "../src/lib/store.js";

const SECRET = "test-secret-jobs";

beforeEach(() => {
  resetStore();
  process.env.JOBS_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.JOBS_SECRET;
});

function req(secret: string | null) {
  return ctx("http://localhost/api/jobs/cierre-medianoche", {
    method: "POST",
    headers: secret === null ? {} : { "X-Job-Secret": secret },
  });
}

describe("cierre automatico de medianoche", () => {
  it("sin secret es 403", async () => {
    const res = (await POSTAuto(req(null))) as Response;
    expect(res.status).toBe(403);
  });

  it("primer disparo 201 automatica con aviso enviado; segundo 409 sin duplicar", async () => {
    const r1 = (await POSTAuto(req(SECRET))) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as Record<string, unknown>;
    expect(j1["close_type"]).toBe("automatica");
    expect(String(j1["fecha_jornada"])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((j1["wa"] as { estado: string }).estado).toBe("enviado");

    const r2 = (await POSTAuto(req(SECRET))) as Response;
    expect(r2.status).toBe(409);
    const j2 = (await r2.json()) as Record<string, unknown>;
    expect((j2["wa"] as { estado: string }).estado).toBe("duplicado");
    expect(j2["fecha_jornada"]).toBe(j1["fecha_jornada"]);
  });

  it("con turno en disputa es 422 y no cierra ni avisa", async () => {
    store.turnos.set("t1", {
      id: "t1",
      fechaJornada: "2026-10-10",
      turno: "manana",
      entregadoPor: "juan",
      esperadoCentavos: 0n,
      estado: "en_disputa",
    });
    const res = (await POSTAuto(req(SECRET))) as Response;
    expect(res.status).toBe(422);
    expect(store.cierres.size).toBe(0);
    expect(store.waEnviados.size).toBe(0);
  });

  it("la jornada es America/Argentina, no UTC (job puro)", () => {
    // 02:30 UTC = 23:30 del dia anterior en AR (UTC-3).
    const r = ejecutar_cierre_medianoche({
      ahora: new Date("2026-01-01T02:30:00Z"),
      movimientos: [],
      ultimoMovimientoId: null,
      turnosEnDisputa: 0,
      cierres: new Map<string, CierreOk>(),
      waEnviados: new Set<string>(),
    });
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.fechaJornada).toBe("2025-12-31");
  });
});
