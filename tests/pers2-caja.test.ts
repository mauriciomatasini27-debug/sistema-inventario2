import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { cashMovements } from "../src/db/schema.js";
import { cashDrawerDrops, cashReversals } from "../src/db/schema-caja.js";
import { GET as getBalance } from "../src/pages/api/cash/balance.js";
import { GET as getHistory } from "../src/pages/api/cash/history.js";
import { GET as getExport } from "../src/pages/api/cash/export.js";
import { POST as postClose, GET as getClose } from "../src/pages/api/cash/close.js";
import { POST as postDrops } from "../src/pages/api/cash/drops.js";
import { POST as postShifts } from "../src/pages/api/cash/shifts.js";
import { POST as postConciliate } from "../src/pages/api/cash/shifts/conciliate.js";
import { POST as postResolve } from "../src/pages/api/cash/shifts/resolve.js";
import { POST as postQr, GET as getQr, DELETE as deleteQr } from "../src/pages/api/cash/qr.js";
import { POST as postReversals } from "../src/pages/api/cash/reversals.js";
import { GET as getDue, POST as postDue, PATCH as patchDue } from "../src/pages/api/cash/due-items.js";
import { POST as postMovements } from "../src/pages/api/cash/movements.js";

const RUTAS_SIN_STORE = [
  "src/pages/api/cash/shifts/conciliate.ts",
  "src/pages/api/cash/shifts/resolve.ts",
  "src/pages/api/cash/balance.ts",
  "src/pages/api/cash/drops.ts",
  "src/pages/api/cash/export.ts",
  "src/pages/api/cash/shifts.ts",
  "src/pages/api/cash/close.ts",
  "src/pages/api/cash/qr.ts",
  "src/pages/api/cash/history.ts",
  "src/pages/api/cash/reversals.ts",
  "src/pages/api/cash/due-items.ts",
];

function importaStoreValores(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s+type\b/.test(linea)) return false;
    if (/^\s*import\s*\{\s*control\s*\}\s*from/.test(linea)) return false;
    return true;
  });
}

describe("PERS2-S12/S13 AT10: rutas cash sin valores de lib/store (ADR-0056)", () => {
  it("ninguna de las 11 rutas importa valores de lib/store (import type y control permitidos)", () => {
    const mal = RUTAS_SIN_STORE.filter(importaStoreValores);
    expect(mal).toEqual([]);
  });
});

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function movimientoBody(seq: number) {
  return {
    tipo: "ingreso",
    metodo: "Efectivo",
    categoria_id: "general",
    origen: "devolucion",
    monto_centavos: 15000,
    device_code: "caja-01",
    seq_local: seq,
    client_occurred_at: new Date().toISOString(),
  };
}

describe("PERS2-S12/S13 single sin DB: caja se comporta como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("movements + balance: fuente memoria y total derivado", async () => {
    const key = `pers2-caja-mov-${Date.now()}`;
    const r = (await postMovements(ctx("http://x/api/cash/movements", { body: movimientoBody(1), headers: { "Idempotency-Key": key } }))) as Response;
    expect(r.status).toBe(201);
    const b = (await getBalance(ctx("http://x/api/cash/balance"))) as Response;
    expect(b.status).toBe(200);
    const j = (await b.json()) as { total: string; fuente: string; por_medio: Record<string, string> };
    expect(j.fuente).toBe("memoria");
    expect(j.total).toBe("15000");
    expect(j.por_medio["Efectivo"]).toBe("15000");
  });

  it("history lista lo movido y export lo baja en CSV", async () => {
    const key = `pers2-caja-h-${Date.now()}`;
    await postMovements(ctx("http://x/api/cash/movements", { body: movimientoBody(2), headers: { "Idempotency-Key": key } }));
    const h = (await getHistory(ctx("http://x/api/cash/history"))) as Response;
    expect(h.status).toBe(200);
    const jh = (await h.json()) as { total: number; items: Array<{ idempotency_key: string }>; next_cursor: number | null };
    expect(jh.total).toBe(1);
    expect(jh.items[0]?.idempotency_key).toBe(key);
    const ex = (await getExport(ctx("http://x/api/cash/export"))) as Response;
    expect(ex.status).toBe(200);
    expect(ex.headers.get("content-type")).toContain("text/csv");
    const csv = await ex.text();
    expect(csv).toContain("id,tipo,metodo,monto_centavos,origen,sale_id,idempotency_key");
    expect(csv).toContain(key);
  });

  it("drops: 201 y misma key 409", async () => {
    const key = `pers2-caja-drop-${Date.now()}`;
    const body = { fecha_jornada: "2026-10-10", monto_centavos: 50000, creado_por: "duena" };
    const r1 = (await postDrops(ctx("http://x/api/cash/drops", { body, headers: { "Idempotency-Key": key } }))) as Response;
    expect(r1.status).toBe(201);
    expect(((await r1.json()) as { drop_id: string }).drop_id).toBe(key);
    const r2 = (await postDrops(ctx("http://x/api/cash/drops", { body, headers: { "Idempotency-Key": key } }))) as Response;
    expect(r2.status).toBe(409);
  });

  it("shifts: apertura, conciliacion y resolucion de disputa", async () => {
    const r1 = (await postShifts(
      ctx("http://x/api/cash/shifts", { body: { fecha_jornada: "2026-10-10", turno: "manana", entregado_por: "ana", esperado_centavos: 200000 }, headers: { "Idempotency-Key": `pers2-caja-sh-${Date.now()}` } }),
    )) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as { turno_id: string; estado: string };
    expect(j1.estado).toBe("pendiente");
    const c1 = (await postConciliate(
      ctx("http://x/api/cash/shifts/conciliate", { body: { turno_id: j1.turno_id, contado_centavos: 200000, conteos_por_medio: [{ medio: "Efectivo", monto_centavos: 200000 }] }, headers: { "Idempotency-Key": `pers2-caja-co-${Date.now()}` } }),
    )) as Response;
    expect(c1.status).toBe(201);
    expect(((await c1.json()) as { estado: string }).estado).toBe("conciliado");

    const r2 = (await postShifts(
      ctx("http://x/api/cash/shifts", { body: { fecha_jornada: "2026-10-10", turno: "tarde", entregado_por: "ana", esperado_centavos: 200000 }, headers: { "Idempotency-Key": `pers2-caja-sh2-${Date.now()}` } }),
    )) as Response;
    const j2 = (await r2.json()) as { turno_id: string };
    const c2 = (await postConciliate(
      ctx("http://x/api/cash/shifts/conciliate", { body: { turno_id: j2.turno_id, contado_centavos: 100000, conteos_por_medio: [{ medio: "Efectivo", monto_centavos: 100000 }] }, headers: { "Idempotency-Key": `pers2-caja-co2-${Date.now()}` } }),
    )) as Response;
    expect(((await c2.json()) as { estado: string }).estado).toBe("en_disputa");
    const res = (await postResolve(
      ctx("http://x/api/cash/shifts/resolve", { body: { turno_id: j2.turno_id, nota: "faltante justificado", rol: "dueno", resuelto_por: "duena" } }),
    )) as Response;
    expect(res.status).toBe(200);
    expect(((await res.json()) as { estado: string }).estado).toBe("resuelto");
  });

  it("qr: alta, dedupe, lista y deshacer", async () => {
    const num = `OP-PERS2-${Date.now()}`;
    const r1 = (await postQr(ctx("http://x/api/cash/qr", { body: { numero_operacion: num, monto_centavos: 1000 }, headers: { "Idempotency-Key": "q1" } }))) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await postQr(ctx("http://x/api/cash/qr", { body: { numero_operacion: num, monto_centavos: 1000 }, headers: { "Idempotency-Key": "q2" } }))) as Response;
    expect(r2.status).toBe(409);
    const g = (await getQr(ctx("http://x/api/cash/qr"))) as Response;
    expect(((await g.json()) as { recibos: unknown[] }).recibos.length).toBe(1);
    const d = (await deleteQr(ctx(`http://x/api/cash/qr?numero_operacion=${num}`))) as Response;
    expect(d.status).toBe(200);
  });

  it("due-items: alta, aviso y pago con egreso", async () => {
    const r = (await postDue(ctx("http://x/api/cash/due-items", { body: { concepto: "Luz", vence_el: new Date().toISOString(), monto_centavos: 2000 } }))) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as { id: string };
    const g = (await getDue(ctx("http://x/api/cash/due-items"))) as Response;
    const jg = (await g.json()) as { vencimientos: Array<{ id: string; avisa: boolean }> };
    expect(jg.vencimientos.some((v) => v.id === j.id)).toBe(true);
    const p = (await patchDue(ctx(`http://x/api/cash/due-items?id=${j.id}`, { method: "PATCH", body: {}, headers: { "Idempotency-Key": "d1" } }))) as Response;
    expect(p.status).toBe(200);
    expect(((await p.json()) as { estado: string }).estado).toBe("pagada");
  });

  it("close: 201 con aviso, lectura y reintento 409", async () => {
    const fecha = "2026-10-10";
    const r1 = (await postClose(ctx("http://x/api/cash/close", { body: { fecha_jornada: fecha, close_type: "manual" }, headers: { "Idempotency-Key": `pers2-caja-cierre-${Date.now()}` } }))) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as { fecha_jornada: string; wa: { estado: string } };
    expect(j1.fecha_jornada).toBe(fecha);
    expect(j1.wa.estado).toBe("enviado");
    const g = (await getClose(ctx(`http://x/api/cash/close?fecha=${fecha}`))) as Response;
    expect(g.status).toBe(200);
    const r2 = (await postClose(ctx("http://x/api/cash/close", { body: { fecha_jornada: "2026-10-11", close_type: "manual" }, headers: { "Idempotency-Key": `pers2-caja-cierre2-${Date.now()}` } }))) as Response;
    expect(r2.status).toBe(201);
    const r3 = (await postClose(ctx("http://x/api/cash/close", { body: { fecha_jornada: fecha, close_type: "manual" }, headers: { "Idempotency-Key": `pers2-caja-cierre3-${Date.now()}` } }))) as Response;
    expect(r3.status).toBe(409);
  });

  it("reversals: compensatorio 201 y segunda 409", async () => {
    const key = `pers2-caja-revmov-${Date.now()}`;
    const rm = (await postMovements(ctx("http://x/api/cash/movements", { body: movimientoBody(9), headers: { "Idempotency-Key": key } }))) as Response;
    expect(rm.status).toBe(201);
    const jm = (await rm.json()) as { id: string };
    const r1 = (await postReversals(ctx("http://x/api/cash/reversals", { body: { revierte_a: jm.id, actor: "duena" }, headers: { "Idempotency-Key": `pers2-caja-rev-${Date.now()}` } }))) as Response;
    expect(r1.status).toBe(201);
    expect(((await r1.json()) as { revierte_a: string }).revierte_a).toBe(jm.id);
    const r2 = (await postReversals(ctx("http://x/api/cash/reversals", { body: { revierte_a: jm.id, actor: "duena" }, headers: { "Idempotency-Key": `pers2-caja-rev2-${Date.now()}` } }))) as Response;
    expect(r2.status).toBe(409);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

const dropKeyPG = `pers2-caja-drop-${sufijoPG}`;
const movKeyPG = `pers2-caja-mov-${sufijoPG}`;
const revKeyPG = `pers2-caja-rev-${sufijoPG}`;
const movIdPG = randomUUID();

async function borrarRastroPG() {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      await db.delete(cashReversals).where(eq(cashReversals.idempotencyKey, revKeyPG));
      await db.delete(cashMovements).where(eq(cashMovements.idempotencyKey, movKeyPG));
      await db.delete(cashMovements).where(eq(cashMovements.idempotencyKey, revKeyPG));
      await db.delete(cashDrawerDrops).where(eq(cashDrawerDrops.idempotencyKey, dropKeyPG));
    });
  }
}

describe.skipIf(!hayPG)("PERS2-S12/S13 multi con PG local: caja de A aislada de B", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("retiro en A queda en cash_drawer_drops de A y B no lo ve", async () => {
    fijarMulti();
    const body = { fecha_jornada: "2026-10-10", monto_centavos: 50000, creado_por: "duena" };
    const r1 = await conTenant("tenant-a", () =>
      postDrops(ctx("http://x/api/cash/drops", { body, headers: { "Idempotency-Key": dropKeyPG } })),
    );
    expect((r1 as Response).status).toBe(201);
    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(cashDrawerDrops).where(eq(cashDrawerDrops.idempotencyKey, dropKeyPG));
    });
    expect(filasA.length).toBe(1);
    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(cashDrawerDrops).where(eq(cashDrawerDrops.idempotencyKey, dropKeyPG));
    });
    expect(filasB.length).toBe(0);
  });

  it("la misma key de retiro en B crea su propia fila (sin colision)", async () => {
    fijarMulti();
    const body = { fecha_jornada: "2026-10-10", monto_centavos: 50000, creado_por: "duena" };
    const rB = await conTenant("tenant-b", () =>
      postDrops(ctx("http://x/api/cash/drops", { body, headers: { "Idempotency-Key": dropKeyPG } })),
    );
    expect((rB as Response).status).toBe(201);
    for (const t of ["tenant-a", "tenant-b"] as const) {
      const filas = await conTenant(t, async () => getTenantDb().select().from(cashDrawerDrops).where(eq(cashDrawerDrops.idempotencyKey, dropKeyPG)));
      expect(filas.length).toBe(1);
    }
  });

  it("reversion en A queda en cash_reversals de A y B no la ve", async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(cashMovements).values({
        id: movIdPG,
        saleId: null,
        idempotencyKey: movKeyPG,
        tipo: "ingreso",
        metodo: "Efectivo",
        categoriaId: "general",
        origen: "devolucion",
        montoCentavos: 15000n,
      });
    });
    const r1 = await conTenant("tenant-a", () =>
      postReversals(ctx("http://x/api/cash/reversals", { body: { revierte_a: movIdPG, actor: "duena" }, headers: { "Idempotency-Key": revKeyPG } })),
    );
    expect((r1 as Response).status).toBe(201);
    const revA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(cashReversals).where(eq(cashReversals.idempotencyKey, revKeyPG));
    });
    expect(revA.length).toBe(1);
    const revB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(cashReversals).where(eq(cashReversals.idempotencyKey, revKeyPG));
    });
    expect(revB.length).toBe(0);
  });
});
