import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { idMappings, outbox } from "../src/db/schema.js";
import { POST as POSTPush } from "../src/pages/api/sync/push.js";
import { GET as GETPull } from "../src/pages/api/sync/pull.js";
import { OPERACIONES_SOLO_ONLINE, NecesitaConexionError } from "../src/lib/offline-gate.js";
import { encolar, pendientes, resetOutbox } from "../src/offline/outbox-store.js";
import { activarSinglePgDesdeEnv } from "./helpers/pg-tenant-fixture.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function op(device: string, seq: number, tipo: string | undefined, modulo = "sales") {
  const payload: Record<string, unknown> = tipo === undefined ? { venta: "normal" } : { tipo };
  return {
    op_id: crypto.randomUUID(),
    device_code: device,
    device_seq: seq,
    hlc: `${Date.now()}:${seq}`,
    modulo,
    payload,
    client_occurred_at: new Date().toISOString(),
  };
}

function batchCtx(ops: Array<ReturnType<typeof op>>) {
  return ctx("http://localhost/api/sync/push", { body: { ops } });
}

function singleCtx(o: ReturnType<typeof op>) {
  return ctx("http://localhost/api/sync/push", {
    body: o,
    headers: { "Idempotency-Key": o.op_id },
  });
}

beforeEach(async () => {
  modoSingleSinDb();
  resetStore();
  await resetOutbox();
});

describe("SYNC-S7 sensibles solo online (OF16/OF9.5/FC13)", () => {
  it("OPERACIONES_SOLO_ONLINE cubre la lista del PRD (tope/plazo/baja/ajuste/reversión/export)", () => {
    const unida = OPERACIONES_SOLO_ONLINE.join(" ");
    for (const palabra of ["tope", "plazo", "baja", "ajuste", "reversion", "export"]) {
      expect(unida).toContain(palabra);
    }
  });

  it("push batch: venta normal aplica, sensible responde necesita_conexion sin efecto", async () => {
    const device = `caja-s7-${Date.now().toString(36)}`;
    const venta = op(device, 1, undefined);
    const sensible = op(device, 2, OPERACIONES_SOLO_ONLINE[0]);
    const res = (await POSTPush(batchCtx([venta, sensible]))) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as { resultados: Array<Record<string, unknown>> };
    expect(j.resultados).toHaveLength(2);
    const rVenta = j.resultados.find((r) => r["op_id"] === venta.op_id);
    const rSens = j.resultados.find((r) => r["op_id"] === sensible.op_id);
    expect(rVenta?.["resultado"]).toBe("aplicado");
    expect(typeof rVenta?.["id_mapeado"]).toBe("string");
    expect(rSens?.["resultado"]).toBe("necesita_conexion");
    expect(rSens?.["error"]).toMatch(/Necesita conexión/);
    expect(res.status).not.toBe(500);

    // Sin efecto: la sensible nunca entró al outbox (re-push no es replay),
    // la venta sí (re-push mismo payload es replay 200).
    const pull = (await GETPull(ctx("http://localhost/api/sync/pull?cursor=0&limite=50"))) as Response;
    const movs = ((await pull.json()) as { movimientos: Array<{ op_id: string }> }).movimientos;
    expect(movs.map((m) => m.op_id)).toContain(venta.op_id);
    expect(movs.map((m) => m.op_id)).not.toContain(sensible.op_id);
  });

  it("push simple de op sensible responde necesita_conexion (no aplica, no 500)", async () => {
    const device = `caja-s7-1op-${Date.now().toString(36)}`;
    for (const tipo of OPERACIONES_SOLO_ONLINE) {
      const o = op(`${device}-${tipo}`.slice(0, 32), 1, tipo);
      const res = (await POSTPush(singleCtx(o))) as Response;
      expect(res.status).not.toBe(500);
      expect(res.status).not.toBe(201);
      const j = (await res.json()) as Record<string, unknown>;
      expect(j["resultado"]).toBe("necesita_conexion");
      expect(String(j["error"])).toMatch(/Necesita conexión/);
    }
  });

  it("encolar offline rechaza cada tipo sensible con NecesitaConexion y deja la cola intacta", async () => {
    for (const tipo of OPERACIONES_SOLO_ONLINE) {
      const p = encolar({ kind: "venta", resumen: "s7", tipo }, `caja-s7-${tipo}`.slice(0, 32));
      await expect(p).rejects.toBeInstanceOf(NecesitaConexionError);
      await expect(p).rejects.toThrow(/Necesita conexión/);
    }
    expect(await pendientes(100)).toHaveLength(0);
    // La vía normal sigue encolando.
    const normal = await encolar({ kind: "venta", resumen: "venta normal" }, "caja-s7-normal");
    expect(normal.opId).toBeTruthy();
    expect(await pendientes(100)).toHaveLength(1);
  });
});

const PG_URL = process.env.PG_TEST_URL ?? process.env.PG_TEST_URL_A ?? "";
const hayPG = Boolean(PG_URL);

describe.skipIf(!hayPG)("SYNC-S7 PG: batch sensible no persiste en outbox del tenant", () => {
  it("venta en outbox, sensible ausente", async () => {
    activarSinglePgDesdeEnv();
    delete process.env.TENANT_MODE;
    resetStore();
    const device = `caja-s7pg-${Date.now().toString(36)}`.slice(0, 32);
    const venta = op(device, 1, undefined);
    const sensible = op(device, 2, OPERACIONES_SOLO_ONLINE[0]);
    const res = (await POSTPush(batchCtx([venta, sensible]))) as Response;
    expect(res.status).toBe(200);
    const db = getTenantDb();
    try {
      const filasVenta = await db.select().from(outbox).where(eq(outbox.opId, venta.op_id));
      expect(filasVenta.length).toBe(1);
      const filasSens = await db.select().from(outbox).where(eq(outbox.opId, sensible.op_id));
      expect(filasSens.length).toBe(0);
    } finally {
      await conTenant("x", async () => {
        const d = getTenantDb();
        await d.delete(outbox).where(eq(outbox.opId, venta.op_id));
        await d.delete(outbox).where(eq(outbox.opId, sensible.op_id));
        await d.delete(idMappings).where(eq(idMappings.opId, venta.op_id));
        await d.delete(idMappings).where(eq(idMappings.opId, sensible.op_id));
      }).catch(() => undefined);
      delete process.env.TENANT_DATABASE_URL;
      modoSingleSinDb();
    }
  });
});
