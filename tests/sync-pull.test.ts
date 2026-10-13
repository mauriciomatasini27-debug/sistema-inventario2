import { beforeEach, describe, expect, it } from "vitest";
import { POST as POSTPush } from "../src/pages/api/sync/push.js";
import { GET as GETPull } from "../src/pages/api/sync/pull.js";
import { resetStore } from "../src/lib/store.js";

function pushReq(op_id: string, seq: number): Request {
  return new Request("http://localhost/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": op_id },
    body: JSON.stringify({
      op_id,
      device_code: "caja-01",
      device_seq: seq,
      hlc: `${Date.now()}:${seq}`,
      modulo: "sales",
      payload: { seq },
      client_occurred_at: new Date().toISOString(),
    }),
  });
}

async function pull(cursor: string, limite?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const q = new URLSearchParams({ cursor });
  if (limite !== undefined) q.set("limite", limite);
  const res = (await GETPull({ request: new Request(`http://localhost/api/sync/pull?${q}`) } as never)) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("sync pull SYNC-S1 (PRD-SYNC-01)", () => {
  beforeEach(() => resetStore());

  it("vacío devuelve lote vacío + cursor 0", async () => {
    const { status, json } = await pull("0");
    expect(status).toBe(200);
    expect(json["movimientos"]).toEqual([]);
    expect(json["cursor_nuevo"]).toBe("0");
    expect(json["total"]).toBe(0);
  });

  it("pushea 2 ops y los pagina por cursor con cap 50", async () => {
    const op1 = crypto.randomUUID();
    const op2 = crypto.randomUUID();
    expect((await POSTPush({ request: pushReq(op1, 1) } as never) as Response).status).toBe(201);
    expect((await POSTPush({ request: pushReq(op2, 2) } as never) as Response).status).toBe(201);

    const p0 = await pull("0", "50");
    expect(p0.status).toBe(200);
    expect((p0.json["movimientos"] as unknown[])).toHaveLength(2);
    expect(p0.json["cursor_nuevo"]).toBe("2");

    const p1 = await pull("1", "50");
    expect((p1.json["movimientos"] as unknown[])).toHaveLength(1);
    expect(p1.json["cursor_nuevo"]).toBe("2");

    const p2 = await pull("2");
    expect((p2.json["movimientos"] as unknown[])).toHaveLength(0);
    expect(p2.json["cursor_nuevo"]).toBe("2");
  });

  it("422 con cursor negativo", async () => {
    const { status } = await pull("-1");
    expect(status).toBe(422);
  });

  it("limite >50 se capa a 50", async () => {
    const { status, json } = await pull("0", "200");
    expect(status).toBe(200);
    expect(json["cursor_nuevo"]).toBe("0");
  });
});
