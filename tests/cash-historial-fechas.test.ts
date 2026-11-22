import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { GET as GETHistory } from "../src/pages/api/cash/history.js";
import { GET as GETExport } from "../src/pages/api/cash/export.js";
import { resetStore, store, type StoredMovement } from "../src/lib/store.js";

function mov(over: Partial<StoredMovement> & { id: string }): StoredMovement {
  return {
    tipo: "ingreso",
    metodo: "Efectivo",
    monto_centavos: "10000",
    origen: "venta",
    idempotency_key: `k-${over.id}`,
    ...over,
  };
}

beforeEach(() => {
  resetStore();
  store.movements.push(
    // 23:30 del 31/12/2025 en Argentina: UTC ya es 1/1/2026.
    mov({ id: "m1", ocurrido_en: "2026-01-01T02:30:00.000Z" }),
    mov({ id: "m2", ocurrido_en: "2026-01-01T03:30:00.000Z" }),
    mov({ id: "m3", ocurrido_en: "2026-01-02T03:00:00.000Z" }),
    mov({ id: "m4" }),
  );
});

async function getHistory(qs: string) {
  const res = (await GETHistory(ctx(`http://localhost/api/cash/history${qs}`))) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function ids(json: Record<string, unknown>): string[] {
  return (json["items"] as Array<{ id: string }>).map((m) => m.id);
}

describe("P10-28 filtro por fecha en el historial de caja", () => {
  it("desde/hasta filtran por la fecha de jornada en America/Argentina/Buenos_Aires", async () => {
    const r = await getHistory("?desde=2026-01-01&hasta=2026-01-01");
    expect(r.status).toBe(200);
    expect(ids(r.json)).toEqual(["m2"]);
  });

  it("un cierre a las 23:30 no pertenece al día UTC siguiente", async () => {
    const r = await getHistory("?desde=2026-01-01");
    expect(ids(r.json)).toEqual(["m3", "m2"]);
  });

  it("hasta es inclusivo y los movimientos sin ocurrido_en quedan afuera", async () => {
    const r = await getHistory("?hasta=2025-12-31");
    expect(ids(r.json)).toEqual(["m1"]);
  });

  it("422 con fechas inválidas", async () => {
    for (const qs of ["?desde=2026-13-01", "?hasta=2026-02-30", "?desde=2026-1-1", "?desde=no-fecha"]) {
      const r = await getHistory(qs);
      expect(r.status).toBe(422);
    }
  });

  it("el export respeta el mismo rango", async () => {
    const res = (await GETExport(
      ctx("http://localhost/api/cash/export?desde=2026-01-01&hasta=2026-01-01"),
    )) as Response;
    expect(res.status).toBe(200);
    const lineas = (await res.text()).replace(/^\uFEFF/, "").trim().split("\n");
    expect(lineas).toHaveLength(2);
    expect(lineas[1]).toContain("m2");
  });
});
